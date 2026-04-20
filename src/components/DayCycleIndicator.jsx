import { useEffect, useRef } from 'react'
import { gameState, MAX_EXTRA_CAT_COUNT, getNightFactor } from '../store'
import { NEW_CAT_WARNING_TIME_OF_DAY, DAY_RETURN_TIME_OF_DAY } from './DayNightController'

const VB = 48
const CX = 24
const CY = 24
const RING_R = 22

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

const STARS = [
  { x: 9, y: 9, r: 0.45 },
  { x: 40, y: 7, r: 0.55 },
  { x: 12, y: 40, r: 0.4 },
  { x: 42, y: 38, r: 0.5 },
  { x: 6, y: 24, r: 0.35 },
  { x: 44, y: 22, r: 0.45 },
  { x: 22, y: 5, r: 0.3 },
]

const wrapperStyle = (isTouchDevice) => ({
  position: 'relative',
  width: isTouchDevice ? '3.2rem' : '4rem',
  height: isTouchDevice ? '3.2rem' : '4rem',
  flex: '0 0 auto',
  pointerEvents: 'none',
})

const discStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  background:
    'radial-gradient(circle at 35% 30%, rgba(50, 58, 96, 0.9) 0%, rgba(16, 14, 32, 0.92) 70%, rgba(8, 6, 18, 0.96) 100%)',
  border: '1.5px solid rgba(255, 255, 255, 0.22)',
  boxShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -2px 4px rgba(0, 0, 0, 0.35), 0 3px 10px rgba(0, 0, 0, 0.3)',
  overflow: 'hidden',
  contain: 'layout paint',
}

const chipStyle = (isTouchDevice) => ({
  position: 'absolute',
  top: 'calc(100% + 0.3rem)',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: isTouchDevice ? '0.15rem 0.5rem' : '0.2rem 0.6rem',
  borderRadius: '999px',
  background:
    'linear-gradient(135deg, rgba(255, 107, 53, 0.95), rgba(255, 184, 92, 0.95))',
  border: '1.5px solid rgba(255, 255, 255, 0.45)',
  boxShadow: '0 4px 14px rgba(255, 107, 53, 0.45)',
  color: '#fff6df',
  fontFamily: 'Knewave, Nunito, sans-serif',
  fontSize: isTouchDevice ? '0.55rem' : '0.68rem',
  fontWeight: 900,
  letterSpacing: '0.14em',
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
  whiteSpace: 'nowrap',
  opacity: 0,
  transition: 'opacity 220ms ease, transform 220ms cubic-bezier(0.17, 0.9, 0.35, 1)',
  pointerEvents: 'none',
})

export default function DayCycleIndicator({ visible, isTouchDevice = false }) {
  const sunRef = useRef(null)
  const sunRaysRef = useRef(null)
  const moonRef = useRef(null)
  const catRef = useRef(null)
  const catEarLRef = useRef(null)
  const catEarRRef = useRef(null)
  const catTailRef = useRef(null)
  const starsRef = useRef(null)
  const progressRef = useRef(null)
  const ambientRef = useRef(null)
  const chipRef = useRef(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!visible) return

    const tick = () => {
      const t = gameState.timeOfDay.current || 0
      const extraCats = gameState.extraCatCount.current || 0
      const night = getNightFactor(t)
      const moonFade = smoothstep(0.35, 0.65, night)
      const atMax = extraCats >= MAX_EXTRA_CAT_COUNT
      const inWarning = t >= NEW_CAT_WARNING_TIME_OF_DAY && t < DAY_RETURN_TIME_OF_DAY
      const showCat = inWarning && !atMax
      const celestialFade = showCat ? 0 : 1
      const now = performance.now()

      if (sunRef.current) {
        sunRef.current.setAttribute('opacity', ((1 - moonFade) * celestialFade).toFixed(3))
      }
      if (moonRef.current) {
        moonRef.current.setAttribute('opacity', (moonFade * celestialFade).toFixed(3))
      }

      if (sunRaysRef.current) {
        const breathe = 1 + 0.05 * Math.sin(now / 380)
        sunRaysRef.current.setAttribute('transform', `scale(${breathe.toFixed(3)})`)
      }

      if (progressRef.current) {
        const C = 2 * Math.PI * RING_R
        progressRef.current.setAttribute('stroke-dashoffset', (C * (1 - t)).toFixed(2))
      }

      if (starsRef.current) {
        starsRef.current.setAttribute('opacity', (moonFade * celestialFade).toFixed(3))
      }

      if (ambientRef.current) {
        ambientRef.current.setAttribute('fill-opacity', (moonFade * 0.55 + 0.15).toFixed(3))
      }

      if (catRef.current) {
        const bob = showCat ? Math.sin(now / 220) * 0.5 : 0
        const pulse = showCat ? 1 + 0.05 * Math.sin(now / 180) : 1
        catRef.current.setAttribute(
          'transform',
          `translate(${CX} ${(CY + bob).toFixed(2)}) scale(${pulse.toFixed(3)})`,
        )
        catRef.current.setAttribute('opacity', showCat ? '1' : '0')
        if (catEarLRef.current && catEarRRef.current) {
          const twitch = Math.sin(now / 150) * 3
          catEarLRef.current.setAttribute('transform', `rotate(${(-twitch).toFixed(2)} -8 -6)`)
          catEarRRef.current.setAttribute('transform', `rotate(${twitch.toFixed(2)} 8 -6)`)
        }
        if (catTailRef.current) {
          const sway = Math.sin(now / 260) * 18
          catTailRef.current.setAttribute('transform', `rotate(${sway.toFixed(2)} 11 6)`)
        }
      }

      if (chipRef.current) {
        chipRef.current.style.opacity = showCat ? '1' : '0'
        chipRef.current.style.transform = showCat
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(-4px)'
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [visible])

  if (!visible) return null

  const C = 2 * Math.PI * RING_R

  return (
    <div style={wrapperStyle(isTouchDevice)}>
      <div style={discStyle}>
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          width="100%"
          height="100%"
          style={{ display: 'block' }}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="dayCycleAmbient" cx="0.5" cy="0.4" r="0.65">
              <stop offset="0" stopColor="#1a2350" />
              <stop offset="0.6" stopColor="#0c0a20" />
              <stop offset="1" stopColor="#06040e" />
            </radialGradient>

            <linearGradient id="dayCycleTrackGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe38a" />
              <stop offset="0.45" stopColor="#ff8a6c" />
              <stop offset="0.75" stopColor="#6f53a6" />
              <stop offset="1" stopColor="#2a3b78" />
            </linearGradient>

            <radialGradient id="dayCycleSunFace" cx="0.45" cy="0.42" r="0.6">
              <stop offset="0" stopColor="#fff6c7" />
              <stop offset="0.55" stopColor="#ffd26a" />
              <stop offset="1" stopColor="#ff9a3a" />
            </radialGradient>

            <radialGradient id="dayCycleMoonFace" cx="0.38" cy="0.42" r="0.8">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.65" stopColor="#f5f3ff" />
              <stop offset="1" stopColor="#d7d1ea" />
            </radialGradient>

            <radialGradient id="dayCycleCatFace" cx="0.5" cy="0.52" r="0.6">
              <stop offset="0" stopColor="#fff0c7" />
              <stop offset="0.55" stopColor="#ffba5c" />
              <stop offset="1" stopColor="#ff7a33" />
            </radialGradient>

            <filter id="dayCycleSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="dayCycleCatPulse" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="0.7" result="b" />
              <feColorMatrix
                in="b"
                type="matrix"
                values="0 0 0 0 1   0 0 0 0 0.72   0 0 0 0 0.35   0 0 0 1.9 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Crescent mask in local (group) coords — used with a group transform of translate(CX,CY) */}
            <mask id="dayCycleMoonCrescentMask" maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
              <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill="#000" />
              <circle cx="0" cy="0" r="11" fill="#fff" />
              <circle cx="4" cy="-2.2" r="9.6" fill="#000" />
            </mask>
          </defs>

          <circle ref={ambientRef} cx={CX} cy={CY} r={VB / 2} fill="url(#dayCycleAmbient)" fillOpacity="0.2" />

          <g ref={starsRef} opacity="0">
            {STARS.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f4f6ff">
                <animate
                  attributeName="opacity"
                  values="0.35;1;0.35"
                  dur={`${2 + (i % 3) * 0.55}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.3}s`}
                />
              </circle>
            ))}
          </g>

          <circle
            cx={CX}
            cy={CY}
            r={RING_R}
            fill="none"
            stroke="rgba(255, 255, 255, 0.13)"
            strokeWidth="1.6"
          />
          <circle
            ref={progressRef}
            cx={CX}
            cy={CY}
            r={RING_R}
            fill="none"
            stroke="url(#dayCycleTrackGradient)"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeDasharray={`${C.toFixed(2)} ${(C * 2).toFixed(2)}`}
            strokeDashoffset={C.toFixed(2)}
            opacity="0.95"
            transform={`rotate(-90 ${CX} ${CY})`}
          />

          {/* SUN — big face with rays that fills most of the disc */}
          <g ref={sunRef} transform={`translate(${CX} ${CY})`}>
            <g ref={sunRaysRef}>
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * 360) / 12
                const long = i % 2 === 0
                const len = long ? 4.8 : 3.2
                const top = long ? -18 : -17
                return (
                  <path
                    key={i}
                    d={`M 0 ${top} l 1.1 ${len} l -2.2 0 z`}
                    fill={long ? '#ffd96a' : '#ffb852'}
                    transform={`rotate(${angle})`}
                    opacity={long ? '0.95' : '0.78'}
                  />
                )
              })}
            </g>
            <circle r="11" fill="url(#dayCycleSunFace)" filter="url(#dayCycleSoftGlow)" />
            <ellipse cx="-5.2" cy="2.4" rx="2" ry="1.1" fill="#ff8e50" opacity="0.55" />
            <ellipse cx="5.2" cy="2.4" rx="2" ry="1.1" fill="#ff8e50" opacity="0.55" />
            <path d="M -6 -1.6 q 1.8 -2.2 3.6 0" fill="none" stroke="#5a2a0e" strokeWidth="0.95" strokeLinecap="round" />
            <path d="M 2.4 -1.6 q 1.8 -2.2 3.6 0" fill="none" stroke="#5a2a0e" strokeWidth="0.95" strokeLinecap="round" />
            <path d="M -6 -1.6 l -0.9 -1.1" stroke="#5a2a0e" strokeWidth="0.55" strokeLinecap="round" />
            <path d="M -4.3 -2.5 l -0.3 -1.2" stroke="#5a2a0e" strokeWidth="0.5" strokeLinecap="round" />
            <path d="M 6 -1.6 l 0.9 -1.1" stroke="#5a2a0e" strokeWidth="0.55" strokeLinecap="round" />
            <path d="M 4.3 -2.5 l 0.3 -1.2" stroke="#5a2a0e" strokeWidth="0.5" strokeLinecap="round" />
            <path d="M -2.6 3.6 q 2.6 2.6 5.2 0" fill="none" stroke="#5a2a0e" strokeWidth="0.95" strokeLinecap="round" />
            <path d="M -2.6 3.6 q 2.6 3.6 5.2 0" fill="#ff8e50" opacity="0.55" />
          </g>

          {/* MOON — classic sleepy white crescent */}
          <g ref={moonRef} transform={`translate(${CX} ${CY})`} opacity="0">
            <circle r="13" fill="rgba(255, 255, 255, 0.14)" />
            <g mask="url(#dayCycleMoonCrescentMask)" filter="url(#dayCycleSoftGlow)">
              <circle r="11" fill="url(#dayCycleMoonFace)" />
            </g>
            {/* closed sleepy eye */}
            <path d="M -6.2 -2 q 2.2 -1.6 4.4 0" fill="none" stroke="#3a2f6a" strokeWidth="0.95" strokeLinecap="round" />
            {/* calm smile */}
            <path d="M -5.2 2.8 q 1.8 1.6 3.6 0" fill="none" stroke="#3a2f6a" strokeWidth="0.95" strokeLinecap="round" />
            {/* cheek blush */}
            <ellipse cx="-5.8" cy="0.6" rx="1.2" ry="0.7" fill="#ff9dc0" opacity="0.55" />
          </g>

          {/* CAT — fills the whole indicator during new-cat warning */}
          <g ref={catRef} transform={`translate(${CX} ${CY})`} opacity="0">
            <g filter="url(#dayCycleCatPulse)">
              {/* tail peeking out from bottom-right */}
              <path
                ref={catTailRef}
                d="M 9 7 q 6 -1 6 -6 q 0 -3 -2 -3"
                fill="none"
                stroke="#ff8a3d"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* ears */}
              <g ref={catEarLRef}>
                <path d="M -11 -4 L -12.5 -14 L -4 -9 Z" fill="url(#dayCycleCatFace)" stroke="#5a2a0e" strokeWidth="0.55" strokeLinejoin="round" />
                <path d="M -10.2 -5.5 L -11 -12.2 L -6 -8.6 Z" fill="#ffc3d3" opacity="0.85" />
              </g>
              <g ref={catEarRRef}>
                <path d="M 11 -4 L 12.5 -14 L 4 -9 Z" fill="url(#dayCycleCatFace)" stroke="#5a2a0e" strokeWidth="0.55" strokeLinejoin="round" />
                <path d="M 10.2 -5.5 L 11 -12.2 L 6 -8.6 Z" fill="#ffc3d3" opacity="0.85" />
              </g>
              {/* head */}
              <ellipse rx="12.5" ry="11" fill="url(#dayCycleCatFace)" stroke="#5a2a0e" strokeWidth="0.55" />
              {/* side tuft accents */}
              <path d="M -11.8 -1 l -1.6 -1.2 l 1.1 2.2 z" fill="#ff8a3d" opacity="0.9" />
              <path d="M 11.8 -1 l 1.6 -1.2 l -1.1 2.2 z" fill="#ff8a3d" opacity="0.9" />
              {/* eyes */}
              <ellipse cx="-4.2" cy="-1.6" rx="2.2" ry="2.9" fill="#fff6da" stroke="#5a2a0e" strokeWidth="0.45" />
              <ellipse cx="4.2" cy="-1.6" rx="2.2" ry="2.9" fill="#fff6da" stroke="#5a2a0e" strokeWidth="0.45" />
              <ellipse cx="-4.2" cy="-1.3" rx="1.9" ry="2.6" fill="#ffcf5a" />
              <ellipse cx="4.2" cy="-1.3" rx="1.9" ry="2.6" fill="#ffcf5a" />
              <ellipse cx="-4.2" cy="-1.2" rx="0.55" ry="2.4" fill="#1a1326" />
              <ellipse cx="4.2" cy="-1.2" rx="0.55" ry="2.4" fill="#1a1326" />
              <circle cx="-3.7" cy="-2.4" r="0.55" fill="#fff" />
              <circle cx="4.7" cy="-2.4" r="0.55" fill="#fff" />
              {/* nose */}
              <path d="M -1.3 2 L 1.3 2 L 0 3.6 Z" fill="#ff7a88" stroke="#5a2a0e" strokeWidth="0.35" strokeLinejoin="round" />
              {/* mouth */}
              <path d="M 0 3.6 L 0 4.6" stroke="#5a2a0e" strokeWidth="0.4" strokeLinecap="round" />
              <path d="M 0 4.6 q -1.4 1.2 -2.6 0.2" fill="none" stroke="#5a2a0e" strokeWidth="0.55" strokeLinecap="round" />
              <path d="M 0 4.6 q 1.4 1.2 2.6 0.2" fill="none" stroke="#5a2a0e" strokeWidth="0.55" strokeLinecap="round" />
              {/* whiskers */}
              <g opacity="0.75" stroke="#5a2a0e" strokeWidth="0.35" strokeLinecap="round">
                <path d="M -3.2 3.3 L -10 2.5" />
                <path d="M -3.2 4.2 L -10 4.6" />
                <path d="M 3.2 3.3 L 10 2.5" />
                <path d="M 3.2 4.2 L 10 4.6" />
              </g>
            </g>
          </g>
        </svg>
      </div>
      <div ref={chipRef} style={chipStyle(isTouchDevice)}>NEW CAT!</div>
    </div>
  )
}
