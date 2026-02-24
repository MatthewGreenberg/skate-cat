import { gameState } from '../store'

export default function GameOverScreen({ visible, onRestart }) {
  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 1000,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{
        fontSize: '4rem',
        color: 'white',
        margin: 0,
        textShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        Game Over
      </h1>
      <p style={{
        fontSize: '1.5rem',
        color: '#ddd',
        margin: '0.5rem 0 2rem',
      }}>
        Logs cleared: {gameState.score}
      </p>
      <button
        onClick={onRestart}
        style={{
          padding: '1rem 3rem',
          fontSize: '1.2rem',
          background: '#FF6B35',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          boxShadow: '0 4px 15px rgba(255,107,53,0.4)',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
