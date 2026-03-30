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
  const [showTrick, setShowTrick] = useState(false)
  const [trickKey, setTrickKey] = useState(0)
  const [trickText, setTrickText] = useState('360!')
  const lastScoringEventId = useRef(gameState.lastScoringEvent.current?.id || 0)
  const judgement = timingFeedback?.label
    ? `${timingFeedback.label.toUpperCase()}${timingFeedback.label === 'Sloppy' ? '...' : '!'}`
    : ''

  useEffect(() => {
    if (!visible) return

    const applyHudSnapshot = (snapshot) => {
      const nextScore = snapshot.score ?? gameState.score
      const nextStreak = snapshot.streak ?? gameState.streak.current
      const nextMultiplier = snapshot.multiplier ?? gameState.scoreMultiplier.current
      const scoringEvent = snapshot.lastScoringEvent ?? gameState.lastScoringEvent.current

      setScore(nextScore)
      setMultiplier(nextMultiplier)
      setStreak((prev) => {
        if (prev !== nextStreak && nextStreak >= 2) setStreakKey(performance.now())
        return nextStreak
      })

      if (scoringEvent?.id && scoringEvent.id !== lastScoringEventId.current) {
        lastScoringEventId.current = scoringEvent.id
        setPlusText(`+${scoringEvent.points}`)
        setPlusGrade(scoringEvent.grade)
        setPlusKey((k) => k + 1)
        setShowPlus(true)
        if (scoringEvent.trickName) {
          setTrickText(`${scoringEvent.trickName}!`)
          setTrickKey((k) => k + 1)
          setShowTrick(true)
        }
      }
    }

    gameState.onHudScoreChange = applyHudSnapshot
    applyHudSnapshot({
      score: gameState.score,
      streak: gameState.streak.current,
      multiplier: gameState.scoreMultiplier.current,
      lastScoringEvent: gameState.lastScoringEvent.current,
    })

    return () => {
      if (gameState.onHudScoreChange === applyHudSnapshot) {
        gameState.onHudScoreChange = null
      }
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return

    let timeoutId = 0
    const syncBeatDots = () => {
      const musicTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const beatIndex = Math.floor(musicTime / BEAT_INTERVAL)
      const nextBeat = ((beatIndex % 4) + 4) % 4
      setActiveBeat((prev) => (prev === nextBeat ? prev : nextBeat))

      const nextBoundary = (beatIndex + 1) * BEAT_INTERVAL
      const delayMs = Math.max(16, Math.round((nextBoundary - musicTime) * 1000))
      timeoutId = window.setTimeout(syncBeatDots, delayMs)
    }

    syncBeatDots()

    return () => window.clearTimeout(timeoutId)
  }, [musicRef, visible])

  if (!visible) return null

  return (
    <>
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
      {showTrick && (
        <div
          key={`trick-${trickKey}`}
          onAnimationEnd={() => setShowTrick(false)}
          style={{
            position: 'fixed',
            bottom: '3rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'Knewave',
            fontSize: '1.9rem',
            letterSpacing: '0.1em',
            color: '#fff6a8',
            WebkitTextStroke: '1.5px #10283b',
            textShadow: `
              2px 2px 0 #10283b,
              4px 4px 0 #2f6d92,
              -3px -3px 0 rgba(255, 255, 255, 0.75),
              0 0 18px rgba(138, 228, 255, 0.45),
              0 0 34px rgba(255, 245, 168, 0.3)
            `,
            padding: '0.08rem 0.45rem',
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.18) 0%, rgba(138,228,255,0.12) 45%, rgba(138,228,255,0) 78%)',
            borderRadius: '999px',
            pointerEvents: 'none',
            zIndex: 62,
            animation: 'trickPop 480ms cubic-bezier(0.16, 0.88, 0.34, 1) both',
          }}
        >
          {trickText}
        </div>
      )}
      {showPlus && (
        <div
          key={`plus-${plusKey}`}
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
