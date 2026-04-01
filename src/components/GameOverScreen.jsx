import { useState, useEffect, useRef } from 'react'
import { gameState } from '../store'

function getOutcomeTitle(outcome) {
  return outcome === 'complete' ? 'Track Complete' : 'Game Over'
}

function getOutcomeMessage(summary) {
  if (!summary) return 'One more run.'

  if (summary.outcome === 'complete') {
    if (summary.rank === 'S') return 'Full-song clear. Sharp timing, clean line.'
    if (summary.rank === 'A') return 'Strong finish. There is still room to tighten the line.'
    if (summary.rank === 'B') return 'You finished the track. Push for cleaner hits next run.'
    return 'Song cleared. Now chase a better rank.'
  }

  if (summary.failReason) {
    return `${summary.failReason}. Run it back.`
  }
  return 'The line broke. Run it back.'
}

function createFallbackSummary(outcome) {
  return {
    outcome,
    rank: outcome === 'complete' ? 'C' : 'F',
    totalScore: gameState.score,
    progressScore: gameState.progressScore,
    bestStreak: gameState.bestStreak.current || 0,
    railCount: gameState.railCount.current || 0,
    groundSpinCount: gameState.groundSpinCount.current || 0,
    accuracyPercent: 0,
    remainingLives: gameState.remainingLives.current || 0,
    failReason: '',
  }
}

const statCardStyle = {
  minWidth: '120px',
  padding: '0.8rem 0.95rem',
  borderRadius: '18px',
  background: 'rgba(255, 255, 255, 0.07)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
}

const statLabelStyle = {
  fontSize: '0.66rem',
  fontFamily: 'Nunito, sans-serif',
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.46)',
}

const statValueStyle = {
  marginTop: '0.4rem',
  fontSize: '1.35rem',
  lineHeight: 1,
  color: '#fff',
  fontFamily: 'Knewave',
  letterSpacing: '0.05em',
}

export default function GameOverScreen({ visible, outcome = 'failed', onRestart }) {
  const [show, setShow] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [displayedScore, setDisplayedScore] = useState(0)
  const animFrameRef = useRef(null)
  const summary = gameState.lastRunSummary.current || createFallbackSummary(outcome)

  useEffect(() => {
    if (visible) {
      const t1 = setTimeout(() => setShow(true), 250)
      const t2 = setTimeout(() => setShowContent(true), 520)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }

    const resetFrame = requestAnimationFrame(() => {
      setShow(false)
      setShowContent(false)
      setDisplayedScore(0)
    })
    return () => cancelAnimationFrame(resetFrame)
  }, [visible])

  useEffect(() => {
    if (!showContent) return

    const target = summary.totalScore || 0
    if (target === 0) {
      const resetFrame = requestAnimationFrame(() => setDisplayedScore(0))
      return () => cancelAnimationFrame(resetFrame)
    }

    const duration = Math.min(800, Math.max(380, target * 30))
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayedScore(Math.round(eased * target))
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [showContent, summary.totalScore])

  useEffect(() => {
    if (!visible || !showContent) return

    const onKeyDown = (event) => {
      if (event.repeat) return
      onRestart()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRestart, showContent, visible])

  if (!visible) return null

  const title = getOutcomeTitle(outcome)
  const message = getOutcomeMessage(summary)
  const buttonLabel = outcome === 'complete' ? 'Skate Again' : 'Retry Run'
  const livesLeft = Math.max(0, summary.remainingLives || 0)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: show ? 'rgba(2, 6, 12, 0.78)' : 'rgba(2, 6, 12, 0)',
        transition: 'background 0.6s ease',
        zIndex: 1000,
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      {showContent && (
        <div
          style={{
            width: 'min(92vw, 760px)',
            padding: '2rem 1.4rem 1.6rem',
            borderRadius: '30px',
            background: 'linear-gradient(180deg, rgba(19, 25, 35, 0.96), rgba(8, 11, 18, 0.96))',
            border: '2px solid rgba(255, 255, 255, 0.09)',
            boxShadow: '0 28px 90px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem',
            animation: 'goScoreReveal 0.45s cubic-bezier(0.33, 1, 0.68, 1) both',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.32rem 0.9rem',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span
              style={{
                fontSize: '0.66rem',
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.52)',
              }}
            >
              Rank
            </span>
            <span
              style={{
                fontFamily: 'Knewave',
                fontSize: '1.3rem',
                lineHeight: 1,
                color: outcome === 'complete' ? '#FFD166' : '#FF8BA5',
                textShadow: outcome === 'complete'
                  ? '0 0 20px rgba(255, 209, 102, 0.35)'
                  : '0 0 20px rgba(255, 139, 165, 0.32)',
              }}
            >
              {summary.rank}
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: 'Knewave',
              fontSize: 'clamp(2.8rem, 8vw, 4.8rem)',
              lineHeight: 1,
              color: '#fff',
              textAlign: 'center',
              textShadow: `
                3px 3px 0 #FF6B35,
                6px 6px 0 rgba(255, 107, 53, 0.28),
                0 0 42px rgba(255, 107, 53, 0.26)
              `,
            }}
          >
            {title}
          </h1>

          <div
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 800,
              fontStyle: 'italic',
              fontSize: 'clamp(0.95rem, 2.3vw, 1.1rem)',
              color: outcome === 'complete' ? 'rgba(255, 209, 102, 0.92)' : 'rgba(255, 139, 165, 0.9)',
              textAlign: 'center',
            }}
          >
            {message}
          </div>

          <div
            style={{
              marginTop: '0.3rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <div style={statLabelStyle}>Total Score</div>
            <div
              style={{
                fontFamily: 'Knewave',
                fontSize: 'clamp(2.6rem, 7vw, 4.3rem)',
                lineHeight: 1,
                color: '#fff',
                textShadow: `
                  2px 2px 0 #FF6B35,
                  0 0 24px rgba(255, 107, 53, 0.38)
                `,
              }}
            >
              {displayedScore}
            </div>
          </div>

          {outcome !== 'complete' && summary.failReason && (
            <div
              style={{
                marginTop: '0.25rem',
                padding: '0.5rem 0.9rem',
                borderRadius: '999px',
                background: 'rgba(255, 139, 165, 0.1)',
                border: '1px solid rgba(255, 139, 165, 0.2)',
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 800,
                fontSize: '0.74rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255, 196, 210, 0.88)',
              }}
            >
              Last miss: {summary.failReason}
            </div>
          )}

          <div
            style={{
              marginTop: '0.6rem',
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Best Streak</div>
              <div style={statValueStyle}>{summary.bestStreak}</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Rails</div>
              <div style={statValueStyle}>{summary.railCount}</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>360s</div>
              <div style={statValueStyle}>{summary.groundSpinCount}</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Accuracy</div>
              <div style={statValueStyle}>{summary.accuracyPercent}%</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Lives Left</div>
              <div style={statValueStyle}>{livesLeft}</div>
            </div>
          </div>

          <button
            className="gameover-btn"
            onClick={onRestart}
            style={{
              marginTop: '0.9rem',
              padding: '1rem 2.8rem',
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              fontFamily: 'Knewave',
              letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, #FF6B35, #FF8F5C)',
              color: 'white',
              border: '3px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '60px',
              cursor: 'pointer',
              boxShadow: '0 10px 26px rgba(255, 107, 53, 0.35)',
            }}
          >
            {buttonLabel}
          </button>

          <div
            style={{
              fontSize: '0.65rem',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.3)',
            }}
          >
            or press any key
          </div>
        </div>
      )}
    </div>
  )
}
