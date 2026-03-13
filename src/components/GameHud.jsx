import { useEffect, useState, useRef } from 'react'
import { gameState } from '../store'
import { BEAT_INTERVAL, OBSTACLE_PHASE } from '../rhythm'

const hudStyle = {
  position: 'fixed',
  top: '1rem',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.6rem 1rem',
  borderRadius: '999px',
  background: 'linear-gradient(135deg, rgba(255, 116, 181, 0.92), rgba(255, 175, 72, 0.92))',
  border: '2px solid rgba(255, 255, 255, 0.7)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
  fontFamily: 'Knewave',
  color: '#fff',
  zIndex: 60,
  pointerEvents: 'none',
}

const dotRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
}

const scoreStyle = {
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.22)',
  fontWeight: 900,
  textTransform: 'uppercase',
  fontSize: '1rem',
}

function getDotStyle(isActive) {
  return {
    width: isActive ? '1.45rem' : '1.05rem',
    height: isActive ? '1.45rem' : '1.05rem',
    borderRadius: '999px',
    background: isActive ? '#55b8ff' : 'transparent',
    border: '3px solid #9cdcff',
    boxShadow: isActive ? '0 0 0 4px rgba(85, 184, 255, 0.28)' : 'none',
    transition: 'all 120ms ease-out',
  }
}

function getJudgementStyle(label, shouldAnimate) {
  const colors = {
    EARLY: '#ffc66b',
    PERFECT: '#65ff9e',
    LATE: '#ff8ba5',
  }
  const normalizedLabel = label.replace('!', '')
  return {
    position: 'fixed',
    top: '5rem',
    left: '50%',
    transform: 'translateX(-50%) scale(0.85)',
    opacity: 0,
    color: colors[normalizedLabel] || '#fff',
    textShadow: '0 0 18px rgba(0, 0, 0, 0.5)',
    fontFamily: 'Knewave',
    fontWeight: 1000,
    letterSpacing: '0.06em',
    fontSize: '2.8rem',
    textTransform: 'uppercase',
    transition: 'opacity 160ms ease-out',
    animation: shouldAnimate ? 'hudJudgementPop 420ms cubic-bezier(0.17, 0.9, 0.35, 1) both' : 'none',
    pointerEvents: 'none',
    zIndex: 61,
  }
}

export default function GameHud({ musicRef, visible, timingFeedback }) {
  const [score, setScore] = useState(gameState.score)
  const [activeDot, setActiveDot] = useState(0)
  const [streak, setStreak] = useState(0)
  const [streakKey, setStreakKey] = useState(0)
  const [showPlus, setShowPlus] = useState(false)
  const [plusKey, setPlusKey] = useState(0)
  const lastScoredValue = useRef(gameState.score)
  const lastStreakValue = useRef(0)
  const judgement = timingFeedback?.label ? `${timingFeedback.label.toUpperCase()}!` : ''

  useEffect(() => {
    if (!visible) return

    let animationFrameId = 0
    const tick = () => {
      const nextScore = gameState.score
      const nextStreak = gameState.streak.current
      if (nextScore !== lastScoredValue.current) {
        lastScoredValue.current = nextScore
        setScore(nextScore)
        setPlusKey((k) => k + 1)
        setShowPlus(true)
      }
      if (nextStreak !== lastStreakValue.current) {
        lastStreakValue.current = nextStreak
        if (nextStreak >= 2) setStreakKey(performance.now())
        setStreak(nextStreak)
      }

      const musicTime = musicRef?.current?.currentTime || 0
      const beatIndex = Math.floor(musicTime / BEAT_INTERVAL)
      const nextDot = beatIndex % 2 === OBSTACLE_PHASE ? 1 : 0
      setActiveDot((prev) => (prev === nextDot ? prev : nextDot))
      animationFrameId = window.requestAnimationFrame(tick)
    }
    animationFrameId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(animationFrameId)
  }, [musicRef, visible])

  if (!visible) return null

  return (
    <>
      <style>
        {`@keyframes streakPop {
          0% { transform: translateX(-50%) scale(0.3); opacity: 0; }
          25% { transform: translateX(-50%) scale(1.25); opacity: 1; }
          60% { transform: translateX(-50%) scale(0.95); opacity: 1; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        @keyframes scorePopFloat {
          0% { transform: translateX(-50%) translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateX(-50%) translateY(-10px) scale(1.2); opacity: 1; }
          70% { transform: translateX(-50%) translateY(-40px) scale(1); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-60px) scale(0.8); opacity: 0; }
        }
        @keyframes hudJudgementPop {
          0% { transform: translateX(-50%) translateY(14px) scale(0.62); opacity: 0; }
          38% { transform: translateX(-50%) translateY(-3px) scale(1.16); opacity: 1; }
          72% { transform: translateX(-50%) translateY(0px) scale(1.02); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-10px) scale(0.96); opacity: 0; }
        }`}
      </style>
      <div
        key={timingFeedback?.id || judgement}
        style={getJudgementStyle(judgement, Boolean(visible && judgement))}
      >
        {judgement}
      </div>
      <div style={hudStyle}>
        <div style={dotRowStyle}>
          <span style={getDotStyle(activeDot === 0)} />
          <span style={getDotStyle(activeDot === 1)} />
        </div>
        <div style={scoreStyle}>SCORE: {score}</div>
      </div>
      {streak >= 2 && (
        <div
          key={streakKey}
          style={{
            position: 'fixed',
            bottom: '5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'Knewave',
            fontSize: `${Math.min(2 + streak * 0.3, 5)}rem`,
            color: streak >= 10 ? '#ff6bff' : streak >= 5 ? '#ffb865' : '#65d4ff',
            textShadow: `0 0 ${Math.min(8 + streak * 3, 30)}px currentColor, 0 2px 8px rgba(0,0,0,0.4)`,
            pointerEvents: 'none',
            zIndex: 63,
            animation: 'streakPop 0.4s cubic-bezier(0.16, 0.88, 0.34, 1) both',
            letterSpacing: '0.05em',
          }}
        >
          x{streak} STREAK
        </div>
      )}
      {showPlus && (
        <div
          key={plusKey}
          onAnimationEnd={() => setShowPlus(false)}
          style={{
            position: 'fixed',
            top: '3.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'Knewave',
            fontSize: '2rem',
            color: '#65ff9e',
            textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 62,
            animation: 'scorePopFloat 600ms cubic-bezier(0.16, 0.88, 0.34, 1) both',
          }}
        >
          +1
        </div>
      )}
    </>
  )
}
