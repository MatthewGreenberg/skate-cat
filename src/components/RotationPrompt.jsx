import { useEffect, useRef, useState } from 'react'

const FADE_MS = 300

const overlayBase = {
  position: 'fixed',
  inset: 0,
  zIndex: 1500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: '18px',
  background: 'rgba(4, 6, 12, 0.94)',
  color: '#f6eecf',
  fontFamily: '"Nunito", system-ui, sans-serif',
  fontWeight: 800,
  fontSize: '20px',
  letterSpacing: '0.04em',
  textAlign: 'center',
  padding: '24px',
  transition: `opacity ${FADE_MS}ms ease`,
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
}

export default function RotationPrompt({ shouldBlock }) {
  const [open, setOpen] = useState(false)
  const rafRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setOpen(shouldBlock))
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [shouldBlock])

  return (
    <div
      style={{
        ...overlayBase,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        visibility: open || shouldBlock ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Rotate your device to landscape"
      aria-hidden={!open}
    >
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: open ? 'skateCatRotateHint 2.2s ease-in-out infinite' : 'none',
          transformOrigin: '50% 50%',
        }}
        aria-hidden="true"
      >
        <rect
          x="18"
          y="30"
          width="60"
          height="36"
          rx="6"
          stroke="#f6eecf"
          strokeWidth="3"
          fill="none"
        />
        <circle cx="24" cy="48" r="2" fill="#f6eecf" />
        <path
          d="M50 18 A18 18 0 0 1 78 34"
          stroke="#ffb347"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M74 30 L78 34 L82 30"
          stroke="#ffb347"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <div style={{ fontSize: '22px', lineHeight: 1.2 }}>Rotate your device</div>
      <div style={{ fontSize: '14px', opacity: 0.75, fontWeight: 700 }}>
        Skate Cat plays in landscape
      </div>
      <style>{`
        @keyframes skateCatRotateHint {
          0%, 20% { transform: rotate(0deg); }
          55%, 75% { transform: rotate(-90deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  )
}
