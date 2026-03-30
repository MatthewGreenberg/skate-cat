import { useState, useEffect } from 'react'
import { gameState, isObstacleSpacingDebug } from '../store'
import { BEAT_INTERVAL, getPerceivedMusicTime } from '../rhythm'

export default function ObstacleSpacingDebugHud({ musicRef, visible }) {
  const [snapshot, setSnapshot] = useState({
    currentBeat: 0,
    speed: 0,
    entries: [],
  })

  useEffect(() => {
    if (!visible || !isObstacleSpacingDebug) return

    let animationFrameId = 0
    const tick = () => {
      const currentTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const currentBeat = currentTime / BEAT_INTERVAL
      const entries = (gameState.obstacleDebug.current || [])
        .filter((entry) => entry.windowEndBeat >= currentBeat - 0.75)
        .slice(0, 12)

      setSnapshot((prev) => {
        const nextSpeed = gameState.speed.current || 0
        const hasSameEntries =
          prev.entries.length === entries.length &&
          prev.entries.every((entry, index) => {
            const nextEntry = entries[index]
            return (
              nextEntry &&
              entry.id === nextEntry.id &&
              entry.lane === nextEntry.lane &&
              entry.requestedLane === nextEntry.requestedLane &&
              entry.z === nextEntry.z &&
              entry.windowStartBeat === nextEntry.windowStartBeat &&
              entry.windowEndBeat === nextEntry.windowEndBeat &&
              entry.conflicts.join(',') === nextEntry.conflicts.join(',')
            )
          })

        if (
          Math.abs(prev.currentBeat - currentBeat) < 0.02 &&
          Math.abs(prev.speed - nextSpeed) < 0.02 &&
          hasSameEntries
        ) {
          return prev
        }

        return {
          currentBeat,
          speed: nextSpeed,
          entries,
        }
      })

      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [musicRef, visible])

  if (!visible || !isObstacleSpacingDebug) return null

  const activeConflictCount = snapshot.entries.filter((entry) => entry.conflicts.length > 0).length

  return (
    <div
      style={{
        position: 'fixed',
        left: '1rem',
        top: '1rem',
        zIndex: 245,
        width: 'min(420px, calc(100vw - 2rem))',
        maxHeight: 'min(70vh, 720px)',
        overflow: 'auto',
        padding: '0.8rem 0.95rem',
        borderRadius: '18px',
        border: '1px solid rgba(255, 154, 102, 0.35)',
        background: 'rgba(20, 10, 8, 0.82)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.32)',
        backdropFilter: 'blur(10px)',
        color: '#fff4eb',
        fontFamily: 'Nunito, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
        Obstacle Spacing
      </div>
      <div style={{ marginTop: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.8rem', fontSize: '0.82rem' }}>
        <span style={{ opacity: 0.68 }}>current beat</span>
        <span>{snapshot.currentBeat.toFixed(2)}</span>
        <span style={{ opacity: 0.68 }}>speed</span>
        <span>{snapshot.speed.toFixed(2)}</span>
        <span style={{ opacity: 0.68 }}>visible rows</span>
        <span>{snapshot.entries.length}</span>
        <span style={{ opacity: 0.68 }}>rows w/ conflicts</span>
        <span style={{ color: activeConflictCount > 0 ? '#ff9c9c' : '#9fffb2', fontWeight: 900 }}>{activeConflictCount}</span>
      </div>
      <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.35rem' }}>
        {snapshot.entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '0.45rem 0.55rem',
              borderRadius: '12px',
              background: entry.conflicts.length > 0 ? 'rgba(140, 30, 24, 0.55)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${entry.conflicts.length > 0 ? 'rgba(255, 130, 120, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.7rem',
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>
                #{entry.id} {entry.type} {entry.lane}
                {entry.remapped ? ` (${entry.requestedLane}->${entry.lane})` : ''}
              </span>
              <span>z {entry.z.toFixed(2)}</span>
            </div>
            <div style={{ opacity: 0.82 }}>
              beat {entry.beatIndex.toFixed(2)} | window {entry.windowStartBeat.toFixed(2)}-{entry.windowEndBeat.toFixed(2)}
            </div>
            {entry.type === 'rail' && (
              <div style={{ opacity: 0.7 }}>
                railLength {entry.railLength.toFixed(2)}
              </div>
            )}
            <div style={{ color: entry.conflicts.length > 0 ? '#ffb1ac' : '#9fffb2' }}>
              conflicts {entry.conflicts.length > 0 ? entry.conflicts.join(', ') : 'none'}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', lineHeight: 1.45, opacity: 0.7 }}>
        Red rows mean the spacing math thinks a rail/log pair overlaps in the same lane. Screenshot this panel when you see a bad spawn.
      </div>
    </div>
  )
}
