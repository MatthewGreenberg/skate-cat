import { useState, useEffect } from 'react'
import { gameState } from '../store'

export default function GameOverScreen({ visible, onRestart }) {
  const [show, setShow] = useState(false)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (visible) {
      // Delay overlay fade-in slightly so cat animation starts first
      const t1 = setTimeout(() => setShow(true), 600)
      const t2 = setTimeout(() => setShowContent(true), 1000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    } else {
      setShow(false)
      setShowContent(false)
    }
  }, [visible])

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes gameOverFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes gameOverSlideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gameOverButtonPulse {
          0%, 100% { box-shadow: 0 4px 15px rgba(255,107,53,0.4); }
          50% { box-shadow: 0 4px 25px rgba(255,107,53,0.7); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: show ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        transition: 'background 0.8s ease',
        zIndex: 1000,
        fontFamily: 'Knewave',
        pointerEvents: show ? 'auto' : 'none',
      }}>
        {showContent && (
          <>
            <h1 style={{
              fontSize: '4.5rem',
              color: 'white',
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
              animation: 'gameOverSlideUp 0.6s cubic-bezier(0.16, 0.88, 0.34, 1) both',
            }}>
              Game Over
            </h1>
            <p style={{
              fontSize: '1.5rem',
              color: '#ddd',
              margin: '0.5rem 0 2rem',
              animation: 'gameOverSlideUp 0.6s cubic-bezier(0.16, 0.88, 0.34, 1) 0.15s both',
            }}>
              Logs cleared: {gameState.score}
            </p>
            <button
              onClick={onRestart}
              style={{
                padding: '1rem 3rem',
                fontSize: '1.2rem',
                fontFamily: 'Knewave',
                background: '#FF6B35',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 'bold',
                animation: 'gameOverSlideUp 0.6s cubic-bezier(0.16, 0.88, 0.34, 1) 0.3s both, gameOverButtonPulse 2s ease-in-out 1s infinite',
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </>
  )
}
