import { useEffect, useState, useRef } from 'react'
import { gameState, MAX_RUN_LIVES } from '../store'
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

const lifeRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
}

const lifePillStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.18rem 0.5rem',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.18)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
}

const lifeDotStyle = (active) => ({
  width: '0.7rem',
  height: '0.7rem',
  borderRadius: '999px',
  background: active ? '#fff3d1' : 'rgba(255, 255, 255, 0.18)',
  boxShadow: active ? '0 0 10px rgba(255, 209, 102, 0.55)' : 'none',
  border: `2px solid ${active ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.2)'}`,
})

const popToneStyles = {
  Perfect: {
    color: '#fff',
    shadow: '2px 2px 0 #FF6B35, 4px 4px 0 rgba(255, 107, 53, 0.28), 0 0 22px rgba(255, 107, 53, 0.5)',
  },
  Good: {
    color: '#FFD166',
    shadow: '2px 2px 0 rgba(200, 140, 0, 0.5), 0 0 20px rgba(255, 209, 102, 0.4)',
  },
  Sloppy: {
    color: '#FF8BA5',
    shadow: '2px 2px 0 rgba(180, 60, 80, 0.5), 0 0 20px rgba(255, 139, 165, 0.35)',
  },
  Rail: {
    color: '#AEEBFF',
    shadow: '2px 2px 0 rgba(25, 60, 90, 0.45), 0 0 18px rgba(138, 228, 255, 0.35)',
  },
  Trick: {
    color: '#FFF3B1',
    shadow: '2px 2px 0 rgba(80, 90, 20, 0.42), 0 0 18px rgba(255, 243, 177, 0.28)',
  },
}

const judgementToneStyles = {
  Perfect: popToneStyles.Perfect,
  Good: popToneStyles.Good,
  Sloppy: popToneStyles.Sloppy,
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

function formatJudgementLabel(grade) {
  if (!grade) return ''
  return grade === 'Sloppy' ? 'SLOPPY...' : `${grade.toUpperCase()}!`
}

function isTimingGrade(grade) {
  return grade === 'Perfect' || grade === 'Good' || grade === 'Sloppy'
}

function getJudgementStyle(tone, shouldAnimate) {
  const style = judgementToneStyles[tone] || judgementToneStyles.Perfect
  return {
    position: 'fixed',
    top: '4.9rem',
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

export default function GameHud({ musicRef, visible }) {
  const [score, setScore] = useState(gameState.score)
  const [multiplier, setMultiplier] = useState(gameState.scoreMultiplier.current)
  const [activeBeat, setActiveBeat] = useState(0)
  const [streak, setStreak] = useState(0)
  const [remainingLives, setRemainingLives] = useState(gameState.remainingLives.current || 0)
  const [maxLives, setMaxLives] = useState(MAX_RUN_LIVES)
  const [tutorialPrompt, setTutorialPrompt] = useState(gameState.tutorialPrompt.current || '')
  const [judgementText, setJudgementText] = useState('')
  const [judgementTone, setJudgementTone] = useState('Perfect')
  const [judgementKey, setJudgementKey] = useState(0)
  const [showJudgement, setShowJudgement] = useState(false)
  const [pointsText, setPointsText] = useState('+0')
  const [pointsTone, setPointsTone] = useState('Perfect')
  const [pointsKey, setPointsKey] = useState(0)
  const [showPoints, setShowPoints] = useState(false)
  const [showTrick, setShowTrick] = useState(false)
  const [trickKey, setTrickKey] = useState(0)
  const [trickText, setTrickText] = useState('360!')
  const [phaseBanner, setPhaseBanner] = useState('')
  const [phaseKey, setPhaseKey] = useState(0)
  const [streakKey, setStreakKey] = useState(0)
  const lastScoringEventId = useRef(gameState.lastScoringEvent.current?.id || 0)
  const lastPhaseAnnouncement = useRef('')

  useEffect(() => {
    if (!visible) return

    const applyHudSnapshot = (snapshot) => {
      const nextScore = snapshot.score ?? gameState.score
      const nextStreak = snapshot.streak ?? gameState.streak.current
      const nextMultiplier = snapshot.multiplier ?? gameState.scoreMultiplier.current
      const scoringEvent = snapshot.lastScoringEvent ?? gameState.lastScoringEvent.current
      const nextPhaseAnnouncement = snapshot.phaseAnnouncement ?? gameState.phaseAnnouncement.current ?? ''

      setScore(nextScore)
      setMultiplier(nextMultiplier)
      setRemainingLives(snapshot.remainingLives ?? gameState.remainingLives.current ?? 0)
      setMaxLives(snapshot.maxLives ?? MAX_RUN_LIVES)
      setTutorialPrompt(snapshot.tutorialPrompt ?? gameState.tutorialPrompt.current ?? '')
      setStreak((prev) => {
        if (prev !== nextStreak && nextStreak >= 2) setStreakKey(performance.now())
        return nextStreak
      })

      if (scoringEvent?.id && scoringEvent.id !== lastScoringEventId.current) {
        lastScoringEventId.current = scoringEvent.id
        if (isTimingGrade(scoringEvent.grade)) {
          setJudgementText(formatJudgementLabel(scoringEvent.grade))
          setJudgementTone(scoringEvent.grade)
          setJudgementKey((prev) => prev + 1)
          setShowJudgement(true)
        }
        if (scoringEvent.points > 0) {
          const pointsTone = isTimingGrade(scoringEvent.grade)
            ? scoringEvent.grade
            : scoringEvent.trickName
              ? 'Trick'
              : scoringEvent.isRail
                ? 'Rail'
                : 'Perfect'
          setPointsText(`+${scoringEvent.points}`)
          setPointsTone(pointsTone)
          setPointsKey((prev) => prev + 1)
          setShowPoints(true)
        }
        if (scoringEvent.trickName) {
          setTrickText(`${scoringEvent.trickName}!`)
          setTrickKey((prev) => prev + 1)
          setShowTrick(true)
        }
      }

      if (nextPhaseAnnouncement && nextPhaseAnnouncement !== lastPhaseAnnouncement.current) {
        lastPhaseAnnouncement.current = nextPhaseAnnouncement
        setPhaseBanner(nextPhaseAnnouncement)
        setPhaseKey((prev) => prev + 1)
      } else if (!nextPhaseAnnouncement) {
        lastPhaseAnnouncement.current = ''
      }
    }

    gameState.onHudScoreChange = applyHudSnapshot
    applyHudSnapshot({
      score: gameState.score,
      streak: gameState.streak.current,
      multiplier: gameState.scoreMultiplier.current,
      remainingLives: gameState.remainingLives.current,
      maxLives: MAX_RUN_LIVES,
      tutorialPrompt: gameState.tutorialPrompt.current,
      phaseAnnouncement: gameState.phaseAnnouncement.current,
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

  const pointsStyle = popToneStyles[pointsTone] || popToneStyles.Perfect
  const trickStyle = popToneStyles.Trick

  return (
    <>
      {showJudgement && judgementText && (
        <div
          key={`judgement-${judgementKey}`}
          onAnimationEnd={() => setShowJudgement(false)}
          style={getJudgementStyle(judgementTone, showJudgement)}
        >
          {judgementText}
        </div>
      )}
      <div style={hudStyle}>
        <div style={dotRowStyle}>
          {[0, 1, 2, 3].map((beat) => (
            <span key={beat} style={getDotStyle(activeBeat === beat, beat === 1 || beat === 3)} />
          ))}
        </div>
        <div style={lifeRowStyle}>
          <span style={scoreLabelStyle}>LIVES</span>
          <div style={lifePillStyle}>
            {Array.from({ length: maxLives }).map((_, index) => (
              <span key={index} style={lifeDotStyle(index < remainingLives)} />
            ))}
          </div>
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
      {showPoints && pointsText && (
        <div
          key={`points-${pointsKey}`}
          onAnimationEnd={() => setShowPoints(false)}
          style={{
            position: 'fixed',
            top: '3.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'Knewave',
            fontSize: '1.8rem',
            letterSpacing: '0.06em',
            color: pointsStyle.color,
            textShadow: pointsStyle.shadow,
            pointerEvents: 'none',
            zIndex: 62,
            animation: 'scorePopFloat 550ms cubic-bezier(0.16, 0.88, 0.34, 1) both',
          }}
        >
          {pointsText}
        </div>
      )}
      {phaseBanner && (
        <div
          key={`phase-${phaseKey}`}
          onAnimationEnd={() => setPhaseBanner('')}
          style={{
            position: 'fixed',
            top: '7rem',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.45rem 0.9rem',
            borderRadius: '999px',
            background: 'rgba(255, 209, 102, 0.12)',
            border: '1px solid rgba(255, 209, 102, 0.22)',
            color: '#FFD166',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 900,
            fontSize: '0.8rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 62,
            animation: 'hudJudgementPop 820ms cubic-bezier(0.17, 0.9, 0.35, 1) both',
          }}
        >
          {phaseBanner}
        </div>
      )}
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
            color: trickStyle.color,
            WebkitTextStroke: '1.5px #10283b',
            textShadow: `
              2px 2px 0 #10283b,
              4px 4px 0 #2f6d92,
              -3px -3px 0 rgba(255, 255, 255, 0.75),
              ${trickStyle.shadow}
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
      {tutorialPrompt && (
        <div
          style={{
            position: 'fixed',
            bottom: '6.2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.6rem 1rem',
            borderRadius: '999px',
            background: 'rgba(8, 14, 22, 0.72)',
            border: '2px solid rgba(255, 255, 255, 0.14)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 900,
            fontSize: '0.78rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.24)',
            pointerEvents: 'none',
            zIndex: 62,
          }}
        >
          {tutorialPrompt}
        </div>
      )}
    </>
  )
}
