import { useEffect, useState, useRef } from 'react'
import { gameState } from '../store'
import { BEAT_INTERVAL, getPerceivedMusicTime } from '../rhythm'

const hudStyle = {
  position: 'fixed',
  top: '1rem',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.9rem',
  padding: '0.55rem 1.2rem',
  borderRadius: '999px',
  background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.88), rgba(255, 160, 72, 0.88))',
  border: '3px solid rgba(255, 255, 255, 0.35)',
  boxShadow: '0 6px 24px rgba(255, 107, 53, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  fontFamily: 'Knewave',
  color: '#fff',
  zIndex: 60,
  pointerEvents: 'none',
  letterSpacing: '0.04em',
}

const dotRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
}

const scorePillStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.2rem 0.75rem',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.22)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  fontSize: '1rem',
  letterSpacing: '0.06em',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
}

const scoreLabelStyle = {
  fontSize: '0.6rem',
  fontFamily: 'Nunito, sans-serif',
  fontWeight: 800,
  letterSpacing: '0.12em',
  opacity: 0.65,
}

const scoreNumStyle = {
  fontSize: '1.05rem',
  letterSpacing: '0.04em',
}

const multiplierBadgeStyle = {
  padding: '0.12rem 0.45rem',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.14)',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
}

function getDotStyle(isActive, isAnchorBeat) {
  return {
    width: isActive ? '1.3rem' : '0.9rem',
    height: isActive ? '1.3rem' : '0.9rem',
    borderRadius: '999px',
    background: isActive ? '#fff' : isAnchorBeat ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.2)',
    border: `2px solid ${isAnchorBeat ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.55)'}`,
    boxShadow: isActive
      ? '0 0 8px rgba(255, 255, 255, 0.6), 0 0 0 3px rgba(255, 255, 255, 0.15)'
      : 'none',
    transition: 'all 100ms cubic-bezier(0.33, 1, 0.68, 1)',
  }
}

const JUDGEMENT_STYLES = {
  PERFECT: {
    color: '#fff',
    shadow: '2px 2px 0 #FF6B35, 4px 4px 0 rgba(255, 107, 53, 0.4), 0 0 30px rgba(255, 107, 53, 0.5), 0 0 60px rgba(255, 175, 72, 0.2)',
  },
  GOOD: {
    color: '#FFD166',
    shadow: '2px 2px 0 rgba(200, 140, 0, 0.5), 0 0 20px rgba(255, 209, 102, 0.4), 0 0 40px rgba(255, 209, 102, 0.15)',
  },
  SLOPPY: {
    color: '#FF8BA5',
    shadow: '2px 2px 0 rgba(180, 60, 80, 0.5), 0 0 20px rgba(255, 139, 165, 0.4), 0 0 40px rgba(255, 139, 165, 0.15)',
  },
}

function getJudgementStyle(label, shouldAnimate) {
  const normalizedLabel = label.replace(/[!.]/g, '')
  const style = JUDGEMENT_STYLES[normalizedLabel] || { color: '#fff', shadow: 'none' }
  return {
    position: 'fixed',
    top: '5rem',
    left: '50%',
    transform: 'translateX(-50%) scale(0.85)',
    opacity: 0,
    color: style.color,
    textShadow: style.shadow,
    fontFamily: 'Knewave',
    letterSpacing: '0.08em',
    fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
    textTransform: 'uppercase',
    animation: shouldAnimate ? 'hudJudgementPop 500ms cubic-bezier(0.17, 0.9, 0.35, 1) both' : 'none',
    pointerEvents: 'none',
    zIndex: 61,
  }
}

export default function GameHud({ musicRef, visible, timingFeedback }) {
  const [score, setScore] = useState(gameState.score)
  const [multiplier, setMultiplier] = useState(gameState.scoreMultiplier.current)
  const [activeBeat, setActiveBeat] = useState(0)
  const [streak, setStreak] = useState(0)
  const [streakKey, setStreakKey] = useState(0)
  const [showPlus, setShowPlus] = useState(false)
  const [plusKey, setPlusKey] = useState(0)
  const [plusText, setPlusText] = useState('+1')
  const [plusGrade, setPlusGrade] = useState('Perfect')
  const lastScoredValue = useRef(gameState.score)
  const lastStreakValue = useRef(0)
  const lastScoringEventId = useRef(gameState.lastScoringEvent.current?.id || 0)
  const judgement = timingFeedback?.label
    ? `${timingFeedback.label.toUpperCase()}${timingFeedback.label === 'Sloppy' ? '...' : '!'}`
    : ''

  useEffect(() => {
    if (!visible) return

    let animationFrameId = 0
    const tick = () => {
      const nextScore = gameState.score
      const nextStreak = gameState.streak.current
      if (nextScore !== lastScoredValue.current) {
        lastScoredValue.current = nextScore
        setScore(nextScore)
      }
      if (nextStreak !== lastStreakValue.current) {
        lastStreakValue.current = nextStreak
        if (nextStreak >= 2) setStreakKey(performance.now())
        setStreak(nextStreak)
      }
      const nextMultiplier = gameState.scoreMultiplier.current
      setMultiplier((prev) => (prev === nextMultiplier ? prev : nextMultiplier))

      const scoringEvent = gameState.lastScoringEvent.current
      if (scoringEvent?.id && scoringEvent.id !== lastScoringEventId.current) {
        lastScoringEventId.current = scoringEvent.id
        setPlusText(`+${scoringEvent.points}`)
        setPlusGrade(scoringEvent.grade)
        setPlusKey((k) => k + 1)
        setShowPlus(true)
      }

      const musicTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const beatIndex = Math.floor(musicTime / BEAT_INTERVAL)
      const nextBeat = ((beatIndex % 4) + 4) % 4
      setActiveBeat((prev) => (prev === nextBeat ? prev : nextBeat))
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
          0% { transform: translateX(-50%) rotate(-3deg) scale(0.3); opacity: 0; }
          25% { transform: translateX(-50%) rotate(-2deg) scale(1.2); opacity: 1; }
          60% { transform: translateX(-50%) rotate(-1deg) scale(0.96); opacity: 1; }
          100% { transform: translateX(-50%) rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes scorePopFloat {
          0% { transform: translateX(-50%) translateY(0) scale(0.5); opacity: 0; }
          18% { transform: translateX(-50%) translateY(-12px) scale(1.3); opacity: 1; }
          65% { transform: translateX(-50%) translateY(-36px) scale(1.05); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-56px) scale(0.85); opacity: 0; }
        }
        @keyframes hudJudgementPop {
          0% { transform: translateX(-50%) translateY(16px) rotate(2deg) scale(0.5); opacity: 0; }
          35% { transform: translateX(-50%) translateY(-4px) rotate(-1deg) scale(1.15); opacity: 1; }
          70% { transform: translateX(-50%) translateY(0px) rotate(0deg) scale(1.02); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-12px) rotate(0deg) scale(0.94); opacity: 0; }
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
          {[0, 1, 2, 3].map((beat) => (
            <span key={beat} style={getDotStyle(activeBeat === beat, beat === 1 || beat === 3)} />
          ))}
        </div>
        <div style={{
          width: '1px',
          height: '1.2rem',
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '999px',
        }} />
        <div style={scorePillStyle}>
          <span style={scoreLabelStyle}>SCORE</span>
          <span style={scoreNumStyle}>{score}</span>
          <span style={multiplierBadgeStyle}>x{multiplier}</span>
        </div>
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
            letterSpacing: '0.06em',
            color: streak >= 10 ? '#FFD166' : streak >= 5 ? '#FF8F5C' : '#fff',
            textShadow: `
              2px 2px 0 #FF6B35,
              4px 4px 0 rgba(255, 107, 53, ${Math.min(0.2 + streak * 0.04, 0.5)}),
              0 0 ${Math.min(12 + streak * 4, 40)}px rgba(255, 107, 53, 0.5),
              0 0 ${Math.min(20 + streak * 6, 60)}px rgba(255, 175, 72, 0.2)
            `,
            pointerEvents: 'none',
            zIndex: 63,
            animation: 'streakPop 0.4s cubic-bezier(0.16, 0.88, 0.34, 1) both',
          }}
        >
          {streak} STREAK
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
            fontSize: '1.8rem',
            letterSpacing: '0.06em',
            color: plusGrade === 'Sloppy' ? '#FF8BA5' : plusGrade === 'Good' ? '#FFD166' : '#fff',
            textShadow: plusGrade === 'Sloppy'
              ? '1px 1px 0 rgba(180, 60, 80, 0.5), 0 0 16px rgba(255, 139, 165, 0.35)'
              : plusGrade === 'Good'
                ? '1px 1px 0 rgba(200, 140, 0, 0.5), 0 0 16px rgba(255, 209, 102, 0.35)'
                : '1px 1px 0 #FF6B35, 0 0 16px rgba(255, 107, 53, 0.5)',
            pointerEvents: 'none',
            zIndex: 62,
            animation: 'scorePopFloat 550ms cubic-bezier(0.16, 0.88, 0.34, 1) both',
          }}
        >
          {plusText}
        </div>
      )}
    </>
  )
}
