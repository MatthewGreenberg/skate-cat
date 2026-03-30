import { useState, useEffect } from 'react'
import { gameState, isTimingDebug } from '../store'
import {
  GOOD_EARLY_WINDOW_SECONDS,
  GOOD_LATE_WINDOW_SECONDS,
  getPerceivedMusicTime,
  getTimingGradeFromOffset,
  INPUT_TIMING_COMPENSATION_SECONDS,
  PERFECT_EARLY_WINDOW_SECONDS,
  PERFECT_LATE_WINDOW_SECONDS,
  TRACK_BEAT_PHASE_OFFSET_SECONDS,
} from '../rhythm'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default function TimingDebugHud({ musicRef, visible, playbackRate, manualOffsetMs, obstacleHitDelayMs }) {
  const [metrics, setMetrics] = useState({
    currentTime: 0,
    nextTargetTime: null,
    offsetMs: 0,
    upcomingCount: 0,
  })

  useEffect(() => {
    if (!visible || !isTimingDebug) return

    let animationFrameId = 0
    const tick = () => {
      const currentTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const targets = gameState.obstacleTargets.current || []
      const nextTarget = targets.find((target) => target.targetTime >= currentTime - 0.02) || null
      setMetrics((prev) => {
        const nextTargetTime = nextTarget?.targetTime ?? null
        const nextOffsetMs = nextTarget ? Math.round((currentTime - nextTarget.targetTime) * 1000) : 0
        const upcomingCount = targets.filter((target) => target.targetTime >= currentTime - 0.02).length
        if (
          prev.currentTime === currentTime &&
          prev.nextTargetTime === nextTargetTime &&
          prev.offsetMs === nextOffsetMs &&
          prev.upcomingCount === upcomingCount
        ) {
          return prev
        }
        return {
          currentTime,
          nextTargetTime,
          offsetMs: nextOffsetMs,
          upcomingCount,
        }
      })
      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [musicRef, visible])

  if (!visible || !isTimingDebug) return null

  const formatTime = (value) => (typeof value === 'number' ? value.toFixed(3) : '---')
  const offsetLabel = `${metrics.offsetMs > 0 ? '+' : ''}${metrics.offsetMs}ms`
  const judgedOffsetMs = metrics.offsetMs + Math.round(INPUT_TIMING_COMPENSATION_SECONDS * 1000)
  const judgedOffsetLabel = `${judgedOffsetMs > 0 ? '+' : ''}${judgedOffsetMs}ms`
  const previewGrade = getTimingGradeFromOffset(judgedOffsetMs / 1000)
  const previewGradeColor =
    previewGrade === 'Perfect' ? '#9fffb2' : previewGrade === 'Good' ? '#ffe08a' : '#ff9c9c'
  const perfectWindowStartMs = Math.round((-PERFECT_EARLY_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const perfectWindowEndMs = Math.round((PERFECT_LATE_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const goodWindowStartMs = Math.round((-GOOD_EARLY_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const goodWindowEndMs = Math.round((GOOD_LATE_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const windowMinMs = goodWindowStartMs - 50
  const windowMaxMs = Math.max(goodWindowEndMs + 50, 50)
  const windowSpanMs = Math.max(1, windowMaxMs - windowMinMs)
  const toPercent = (value) => `${clamp(((value - windowMinMs) / windowSpanMs) * 100, 0, 100)}%`
  const goodWindowLeft = toPercent(goodWindowStartMs)
  const goodWindowWidth = `${clamp(((goodWindowEndMs - goodWindowStartMs) / windowSpanMs) * 100, 0, 100)}%`
  const perfectWindowLeft = toPercent(perfectWindowStartMs)
  const perfectWindowWidth = `${clamp(((perfectWindowEndMs - perfectWindowStartMs) / windowSpanMs) * 100, 0, 100)}%`
  const markerLeft = toPercent(metrics.offsetMs)

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        top: '1rem',
        zIndex: 240,
        width: 'min(320px, calc(100vw - 2rem))',
        padding: '0.8rem 0.95rem',
        borderRadius: '18px',
        border: '1px solid rgba(86, 184, 255, 0.35)',
        background: 'rgba(6, 12, 20, 0.78)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        color: '#eaf7ff',
        fontFamily: 'Nunito, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
        Timing Debug
      </div>
      <div style={{ marginTop: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.8rem', fontSize: '0.82rem' }}>
        <span style={{ opacity: 0.68 }}>music</span>
        <span>{formatTime(metrics.currentTime)}s</span>
        <span style={{ opacity: 0.68 }}>next target</span>
        <span>{formatTime(metrics.nextTargetTime)}s</span>
        <span style={{ opacity: 0.68 }}>visual offset</span>
        <span>{offsetLabel}</span>
        <span style={{ opacity: 0.68 }}>press preview</span>
        <span style={{ color: previewGradeColor, fontWeight: 900 }}>{previewGrade} ({judgedOffsetLabel})</span>
        <span style={{ opacity: 0.68 }}>upcoming</span>
        <span>{metrics.upcomingCount}</span>
        <span style={{ opacity: 0.68 }}>track phase</span>
        <span>{Math.round(TRACK_BEAT_PHASE_OFFSET_SECONDS * 1000)}ms</span>
        <span style={{ opacity: 0.68 }}>manual offset</span>
        <span>{manualOffsetMs}ms</span>
        <span style={{ opacity: 0.68 }}>obstacle delay</span>
        <span>{obstacleHitDelayMs}ms</span>
        <span style={{ opacity: 0.68 }}>total offset</span>
        <span>{Math.round((gameState.timingOffsetSeconds.current || 0) * 1000)}ms</span>
        <span style={{ opacity: 0.68 }}>playback</span>
        <span>{playbackRate}x</span>
      </div>
      <div style={{ marginTop: '0.7rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', opacity: 0.8 }}>
          <span>Press Window</span>
          <span style={{ color: previewGradeColor, fontWeight: 900 }}>{previewGrade}</span>
        </div>
        <div
          style={{
            position: 'relative',
            height: '18px',
            marginTop: '0.35rem',
            borderRadius: '999px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'linear-gradient(180deg, rgba(15, 22, 34, 0.95), rgba(7, 11, 18, 0.95))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: goodWindowLeft,
              width: goodWindowWidth,
              top: 0,
              bottom: 0,
              background: 'rgba(255, 224, 138, 0.38)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: perfectWindowLeft,
              width: perfectWindowWidth,
              top: 0,
              bottom: 0,
              background: 'rgba(159, 255, 178, 0.75)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: markerLeft,
              top: 0,
              bottom: 0,
              width: '2px',
              background: previewGradeColor,
              boxShadow: `0 0 8px ${previewGradeColor}`,
              transform: 'translateX(-1px)',
            }}
          />
        </div>
        <div style={{ marginTop: '0.28rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem 0.8rem', fontSize: '0.72rem', opacity: 0.78 }}>
          <span>perfect press zone</span>
          <span>{perfectWindowStartMs}ms to {perfectWindowEndMs}ms</span>
          <span>good press zone</span>
          <span>{goodWindowStartMs}ms to {goodWindowEndMs}ms</span>
        </div>
      </div>
      <div style={{ marginTop: '0.6rem', fontSize: '0.72rem', lineHeight: 1.45, opacity: 0.7 }}>
        Marker is your live visual offset. Green band is where a press right now scores `Perfect` after the jump lead is applied.
      </div>
    </div>
  )
}
