import { useState, useEffect, useRef } from 'react'
import { gameState } from '../store'

function getScoreMessage(score) {
  if (score === 0) return 'The cat just vibed'
  if (score <= 2) return 'Baby steps!'
  if (score <= 5) return 'Getting the hang of it'
  if (score <= 10) return 'Nice moves!'
  if (score <= 20) return 'Shredding it!'
  if (score <= 35) return 'Absolute legend'
  return 'Cat god status'
}

export default function GameOverScreen({ visible, onRestart }) {
  const [show, setShow] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [displayedScore, setDisplayedScore] = useState(0)
  const animFrameRef = useRef(null)

  useEffect(() => {
    if (visible) {
      const t1 = setTimeout(() => setShow(true), 600)
      const t2 = setTimeout(() => setShowContent(true), 1000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    } else {
      setShow(false)
      setShowContent(false)
      setDisplayedScore(0)
    }
  }, [visible])

  useEffect(() => {
    if (!showContent) return
    const target = gameState.score
    if (target === 0) { setDisplayedScore(0); return }
    const duration = Math.min(600, target * 120)
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayedScore(Math.round(eased * target))
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [showContent])

  if (!visible) return null

  const score = gameState.score

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: show ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0)',
        transition: 'background 0.8s ease',
        zIndex: 1000,
        fontFamily: 'Knewave',
        pointerEvents: show ? 'auto' : 'none',
      }}>
        {showContent && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.4rem',
          }}>
            <h1 style={{
              fontSize: 'clamp(3rem, 9vw, 5.5rem)',
              lineHeight: 1,
              color: 'white',
              margin: 0,
              transform: 'rotate(-1.5deg)',
              textShadow: `
                3px 3px 0 #FF6B35,
                6px 6px 0 rgba(255, 107, 53, 0.35),
                0 0 40px rgba(255, 107, 53, 0.4),
                0 0 80px rgba(255, 175, 72, 0.15)
              `,
              animation: 'goTitleDrop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}>
              Game Over
            </h1>

            <div style={{
              marginTop: '1rem',
              width: 'clamp(120px, 40vw, 200px)',
              height: '2px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, transparent, rgba(255, 107, 53, 0.5), transparent)',
              animation: 'goScoreReveal 0.5s cubic-bezier(0.33, 1, 0.68, 1) 0.2s both',
            }} />

            <div style={{
              marginTop: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.3rem',
              animation: 'goScoreReveal 0.5s cubic-bezier(0.33, 1, 0.68, 1) 0.25s both',
            }}>
              <div style={{
                fontSize: 'clamp(0.65rem, 1.8vw, 0.85rem)',
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 800,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.5)',
                textShadow: '0 1px 6px rgba(0, 0, 0, 0.3)',
              }}>
                Logs Cleared
              </div>
              <div style={{
                fontSize: 'clamp(2.5rem, 7vw, 4rem)',
                lineHeight: 1,
                color: '#fff',
                letterSpacing: '0.04em',
                textShadow: `
                  2px 2px 0 #FF6B35,
                  0 0 20px rgba(255, 107, 53, 0.4),
                  0 0 40px rgba(255, 175, 72, 0.15)
                `,
              }}>
                {displayedScore}
              </div>
            </div>

            <div style={{
              marginTop: '0.3rem',
              fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 700,
              fontStyle: 'italic',
              letterSpacing: '0.02em',
              color: 'rgba(255, 209, 102, 0.85)',
              textShadow: '0 1px 8px rgba(0, 0, 0, 0.4)',
              animation: 'goMsgFade 0.4s ease-out 0.6s both',
            }}>
              {getScoreMessage(score)}
            </div>

            <button
              className="gameover-btn"
              onClick={onRestart}
              style={{
                marginTop: '1.8rem',
                padding: '1rem 3rem',
                fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
                fontFamily: 'Knewave',
                letterSpacing: '0.08em',
                background: 'linear-gradient(135deg, #FF6B35, #FF8F5C)',
                color: 'white',
                border: '3px solid rgba(255, 255, 255, 0.35)',
                borderRadius: '60px',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(255, 107, 53, 0.5)',
                animation: 'goBtnPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both, goBtnGlow 3s ease-in-out 1.5s infinite',
              }}
            >
              Try Again
            </button>

            <div style={{
              marginTop: '0.8rem',
              fontSize: '0.65rem',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.3)',
              animation: 'goHintFade 3s ease-in-out 1.5s infinite both',
            }}>
              or press any key
            </div>

          </div>
        )}
      </div>
    </>
  )
}
