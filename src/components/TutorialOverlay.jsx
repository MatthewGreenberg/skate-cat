import { useCallback, useEffect, useRef, useState } from 'react'

const JUMP_KEY_CODES = new Set(['ArrowUp'])
const SPIN_KEY_CODES = new Set(['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS'])
const GRIND_HOLD_MS = 500

const STEPS = [
  {
    id: 'concept',
    badge: 'Rhythm Skate',
    title: 'JUMP TO THE BEAT',
    body: 'Every log, rail, and spin lands on the music. Nail the timing — the tighter you ride the beat, the more you score.',
    bodyTouch: 'Every move lands on the beat. Tap in time to score big.',
    waitingTouch: 'Tap either button to continue',
    infoOnly: true,
    image: 'jump.png',
    imageTouch: 'jump-mobile.png',
  },
  {
    id: 'jump',
    badge: 'Move 1 of 3',
    title: 'JUMP ON THE BEAT',
    body: 'A log rolls in on every beat. Hop it in time — perfect timing = perfect score.',
    bodyTouch: 'Tap JUMP to hop the log on beat.',
    keyHintDesktop: '\u2191  UP ARROW',
    keyHintTouch: 'Tap JUMP',
    waiting: 'Press \u2191 once here to continue',
    waitingTouch: 'Use the JUMP button below to continue',
    image: 'jump.png',
    imageTouch: 'jump-mobile.png',
  },
  {
    id: 'grind',
    badge: 'Move 2 of 3',
    title: 'RIDE THE BEAT',
    body: 'Hold \u2191 to lock onto rails. Ride the beat, then release to land the trick.',
    bodyTouch: 'Hold JUMP to lock onto the rail.',
    keyHintDesktop: 'HOLD  \u2191  FOR A BEAT',
    keyHintTouch: 'Hold JUMP',
    waiting: 'Hold \u2191 until the bar fills to continue',
    waitingTouch: 'Hold the JUMP button below until the bar fills',
    image: 'grind.png',
    imageTouch: 'grind-mobile.png',
  },
  {
    id: 'spin',
    badge: 'Move 3 of 3',
    title: 'SPIN TO THE BEAT',
    body: 'Tap left to throw a 360 — land it on beat for bonus points.',
    bodyTouch: 'Tap SPIN to throw a 360 on beat.',
    keyHintDesktop: 'PRESS \u2190',
    keyHintTouch: 'Tap SPIN',
    waiting: 'Press \u2190 once here to continue',
    waitingTouch: 'Use the SPIN button below to continue',
    image: 'spin.png',
    imageTouch: 'spin-mobile.png',
  },
  {
    id: 'bonus',
    badge: 'Bonus stack',
    title: 'STACK UP, SPEED UP',
    body:
      'New cats drop onto your stack mid-run. Taller tower = trickier jumps, but each cat raises your speed bonus — keep stacking to push your score higher.',
    bodyTouch: 'More cats stack onto your run. Bigger bonus, trickier landings.',
    waitingTouch: 'Tap either button to start your run',
    infoOnly: true,
    image: 'fall.png',
  },
]

export default function TutorialOverlay({ active, isTouchDevice, onSkip, onComplete }) {
  if (!active) return null
  return (
    <TutorialContent
      isTouchDevice={isTouchDevice}
      onSkip={onSkip}
      onComplete={onComplete}
    />
  )
}

function TutorialContent({ isTouchDevice, onSkip, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepCompleted, setStepCompleted] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [pressedControl, setPressedControl] = useState(null)
  const grindTimeoutRef = useRef(0)
  const completingRef = useRef(false)
  const step = STEPS[stepIndex]

  const markStepDone = useCallback(() => {
    if (completingRef.current || stepCompleted) return
    setStepCompleted(true)
  }, [stepCompleted])

  const finishTutorial = useCallback((options = {}) => {
    if (completingRef.current) return
    completingRef.current = true
    window.clearTimeout(grindTimeoutRef.current)
    setIsHolding(false)
    setPressedControl(null)
    onComplete?.(options)
  }, [onComplete])

  const stopGrindHold = useCallback(() => {
    window.clearTimeout(grindTimeoutRef.current)
    setIsHolding(false)
  }, [])

  const startGrindHold = useCallback(() => {
    if (stepCompleted || step.id !== 'grind') return
    window.clearTimeout(grindTimeoutRef.current)
    setIsHolding(true)
    grindTimeoutRef.current = window.setTimeout(() => {
      if (completingRef.current) return
      setStepCompleted(true)
    }, GRIND_HOLD_MS)
  }, [step.id, stepCompleted])

  const handleTouchControlPress = useCallback((side) => {
    if (stepCompleted) return
    if (step.infoOnly) {
      const isLastStep = stepIndex >= STEPS.length - 1
      if (isLastStep) {
        finishTutorial({ fromGesture: true })
      } else {
        markStepDone()
      }
      return
    }
    if (step.id === 'jump' && side === 'right') {
      markStepDone()
      return
    }
    if (step.id === 'spin' && side === 'left') {
      markStepDone()
      return
    }
    if (step.id === 'grind' && side === 'right') {
      startGrindHold()
    }
  }, [finishTutorial, markStepDone, startGrindHold, step, stepCompleted, stepIndex])

  const handleTouchControlRelease = useCallback((side) => {
    if (step.id === 'grind' && side === 'right') stopGrindHold()
  }, [step.id, stopGrindHold])

  useEffect(() => () => {
    window.clearTimeout(grindTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (stepCompleted) return undefined

    const handleKeyDown = (event) => {
      if (event.repeat) return
      if (step.id === 'jump' && JUMP_KEY_CODES.has(event.code)) {
        markStepDone()
      } else if (step.id === 'spin' && SPIN_KEY_CODES.has(event.code)) {
        markStepDone()
      } else if (step.id === 'grind' && event.code === 'ArrowUp') {
        startGrindHold()
      } else if (step.infoOnly && (event.code === 'Enter' || event.code === 'NumpadEnter')) {
        markStepDone()
      }
    }

    const handleKeyUp = (event) => {
      if (step.id === 'grind' && event.code === 'ArrowUp') {
        stopGrindHold()
      }
    }

    const handleTouchStart = (event) => {
      if (!event.changedTouches || event.changedTouches.length === 0) return
      const touch = event.changedTouches[0]
      const side = touch.clientX < window.innerWidth / 2 ? 'left' : 'right'

      if (step.id === 'jump' && side === 'right') {
        markStepDone()
      } else if (step.id === 'spin' && side === 'left') {
        markStepDone()
      } else if (step.id === 'grind' && side === 'right') {
        startGrindHold()
      }
    }

    const handleTouchEnd = () => {
      if (step.id === 'grind') stopGrindHold()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    if (!isTouchDevice) {
      window.addEventListener('touchstart', handleTouchStart, { passive: true })
      window.addEventListener('touchend', handleTouchEnd, { passive: true })
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (!isTouchDevice) {
        window.removeEventListener('touchstart', handleTouchStart)
        window.removeEventListener('touchend', handleTouchEnd)
        window.removeEventListener('touchcancel', handleTouchEnd)
      }
      stopGrindHold()
    }
  }, [isTouchDevice, markStepDone, startGrindHold, step, stepCompleted, stopGrindHold])

  useEffect(() => {
    if (!stepCompleted) return undefined
    const timeout = window.setTimeout(() => {
      if (stepIndex < STEPS.length - 1) {
        setPressedControl(null)
        setStepIndex((prev) => prev + 1)
        setStepCompleted(false)
        setIsHolding(false)
      } else {
        finishTutorial()
      }
    }, 720)
    return () => window.clearTimeout(timeout)
  }, [finishTutorial, stepCompleted, stepIndex])

  const keyHint = step.infoOnly ? null : (isTouchDevice ? step.keyHintTouch : step.keyHintDesktop)
  const bodyText = isTouchDevice && step.bodyTouch ? step.bodyTouch : step.body
  const mobileActionLabel = step.infoOnly
    ? 'Tap Either Button'
    : keyHint
  const actionWaiting = step.infoOnly
    ? (isTouchDevice ? step.waitingTouch : null)
    : (isTouchDevice ? step.waitingTouch : step.waiting)
  const grindBarWidth = stepCompleted || isHolding ? '100%' : '0%'
  const grindBarTransition = isHolding
    ? `width ${GRIND_HOLD_MS}ms linear`
    : 'width 180ms ease-out'

  const safePad = 'max(0.5rem, env(safe-area-inset-top, 0px)) max(0.5rem, env(safe-area-inset-right, 0px)) max(0.5rem, env(safe-area-inset-bottom, 0px)) max(0.5rem, env(safe-area-inset-left, 0px))'
  const skipInsetTop = 'max(0.45rem, env(safe-area-inset-top, 0px))'
  const skipInsetRight = 'max(0.45rem, env(safe-area-inset-right, 0px))'
  const controlsBottomInset = 'max(0.9rem, calc(env(safe-area-inset-bottom, 0px) + 0.9rem))'
  const touchTap = isTouchDevice ? { minHeight: 44, minWidth: 44 } : {}

  const handleTouchButtonDown = (side) => (event) => {
    event.preventDefault()
    setPressedControl(side)
    handleTouchControlPress(side)
  }

  const handleTouchButtonUp = (side) => (event) => {
    event.preventDefault()
    setPressedControl((current) => (current === side ? null : current))
    handleTouchControlRelease(side)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: safePad,
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, rgba(5, 6, 14, 0.55), rgba(4, 4, 10, 0.78))',
        backdropFilter: 'blur(6px)',
        animation: 'tutorialBackdropIn 320ms ease-out both',
        overscrollBehavior: 'contain',
        touchAction: 'manipulation',
      }}
    >
      <button
        type="button"
        onClick={onSkip}
        style={{
          position: 'fixed',
          top: skipInsetTop,
          right: skipInsetRight,
          padding: isTouchDevice ? '0.65rem 1.15rem' : '0.55rem 1.1rem',
          borderRadius: '999px',
          border: '2px solid rgba(255, 255, 255, 0.22)',
          background: 'rgba(10, 12, 18, 0.72)',
          color: 'rgba(255, 255, 255, 0.85)',
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 900,
          fontSize: '0.72rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)',
          zIndex: 1301,
          WebkitTapHighlightColor: 'transparent',
          ...touchTap,
        }}
      >
        Skip
      </button>

      <div
        key={stepIndex}
        style={{
          width: isTouchDevice ? 'min(100%, 30rem)' : 'min(520px, calc(100vw - 0.75rem))',
          maxHeight: isTouchDevice
            ? 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 9.25rem)'
            : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.25rem)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isTouchDevice ? '0.55rem' : 'clamp(0.4rem, 2.2vmin, 1.15rem)',
          padding: isTouchDevice
            ? '0.8rem 0.8rem 1rem'
            : 'clamp(0.55rem, 2.8vmin, 2.25rem) clamp(0.65rem, 3vmin, 2.25rem)',
          borderRadius: 'clamp(16px, 4vmin, 28px)',
          background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.96), rgba(255, 160, 72, 0.96))',
          border: '3px solid rgba(255, 255, 255, 0.35)',
          boxShadow: '0 18px 60px rgba(255, 107, 53, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
          textAlign: 'center',
          animation: 'tutorialCardIn 420ms cubic-bezier(0.17, 0.9, 0.35, 1) both',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 900,
            fontSize: isTouchDevice ? '0.62rem' : 'clamp(0.62rem, 2vmin, 0.78rem)',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'rgba(255, 247, 213, 0.92)',
          }}
        >
          {step.badge}
        </div>

        <div
          style={{
            fontFamily: 'Knewave',
            fontSize: isTouchDevice ? 'clamp(1.18rem, 6vw, 2.05rem)' : 'clamp(1.35rem, 6.5vmin, 3.6rem)',
            lineHeight: 1.05,
            letterSpacing: '0.05em',
            color: '#fff7d5',
            textShadow: '0 3px 0 rgba(180, 68, 25, 0.6), 0 0 24px rgba(255, 209, 102, 0.35)',
          }}
        >
          {step.title}
        </div>

        {isTouchDevice && mobileActionLabel != null && !stepCompleted && (
          <div
            style={{
              width: '100%',
              padding: '0.58rem 0.75rem',
              borderRadius: '18px',
              background: 'rgba(10, 12, 18, 0.72)',
              border: '2px solid rgba(255, 255, 255, 0.24)',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
            }}
          >
            <div
              style={{
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 900,
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(255, 247, 213, 0.75)',
              }}
            >
              Do This Now
            </div>
            <div
              style={{
                marginTop: '0.18rem',
                fontFamily: 'Knewave',
                fontSize: '1.15rem',
                letterSpacing: '0.08em',
                color: '#fff7d5',
                textTransform: 'uppercase',
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
              }}
            >
              {mobileActionLabel}
            </div>
          </div>
        )}

        {(isTouchDevice && step.imageTouch) || step.image ? (
          <img
            src={`/images/${isTouchDevice && step.imageTouch ? step.imageTouch : step.image}`}
            alt={step.title}
            style={{
              width: '100%',
              maxWidth: '100%',
              height: 'auto',
              maxHeight: isTouchDevice ? 'min(24vh, 150px)' : 'min(34vmin, 42vh, 220px)',
              objectFit: 'contain',
              flexShrink: 0,
              order: isTouchDevice ? -1 : 0,
            }}
          />
        ) : null}

        <div
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 700,
            fontSize: isTouchDevice ? '0.83rem' : 'clamp(0.8rem, 2.8vmin, 1.05rem)',
            lineHeight: isTouchDevice ? 1.28 : 1.35,
            color: 'rgba(255, 255, 255, 0.92)',
            maxWidth: '36rem',
          }}
        >
          {bodyText}
        </div>

        {!isTouchDevice && !step.infoOnly && !stepCompleted && (
          <div
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 900,
              fontSize: '0.72rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(255, 247, 213, 0.95)',
              textShadow: '0 0 12px rgba(255, 209, 102, 0.35)',
            }}
          >
            Your turn — do it once to continue
          </div>
        )}

        {keyHint != null && (
          <>
            {!isTouchDevice && !stepCompleted && (
              <div
                style={{
                  fontFamily: 'Nunito, sans-serif',
                  fontWeight: 800,
                  fontSize: '0.68rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(255, 255, 255, 0.78)',
                }}
              >
                Do this now
              </div>
            )}
            <div
              style={{
                padding: 'clamp(0.45rem, 1.8vmin, 0.6rem) clamp(0.75rem, 2.5vmin, 1.1rem)',
                borderRadius: '999px',
                background: 'rgba(10, 12, 18, 0.55)',
                border: '2px solid rgba(255, 255, 255, 0.25)',
                fontFamily: 'Knewave',
                fontSize: 'clamp(0.78rem, 2.6vmin, 1.2rem)',
                letterSpacing: '0.1em',
                color: '#fff7d5',
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
                maxWidth: '100%',
                wordBreak: 'break-word',
              }}
            >
              {keyHint}
            </div>
          </>
        )}

        {step.id === 'grind' && (
          <div
            style={{
              width: '70%',
              height: '8px',
              borderRadius: '999px',
              background: 'rgba(10, 12, 18, 0.4)',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}
          >
            <div
              style={{
                width: grindBarWidth,
                height: '100%',
                background: 'linear-gradient(90deg, #7cf7ff, #ffd166)',
                transition: grindBarTransition,
              }}
            />
          </div>
        )}

        {step.infoOnly && !stepCompleted && !isTouchDevice && (
          <button
            type="button"
            onClick={() => {
              if (stepCompleted || completingRef.current) return
              setStepCompleted(true)
            }}
            style={{
              marginTop: '0.25rem',
              padding: '0.65rem 1.75rem',
              borderRadius: '999px',
              border: '3px solid rgba(255, 255, 255, 0.45)',
              background: 'rgba(10, 12, 18, 0.65)',
              color: '#fff7d5',
              fontFamily: 'Knewave',
              fontSize: 'clamp(0.9rem, 2.8vmin, 1.25rem)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              ...(isTouchDevice ? { minHeight: 48, minWidth: 120 } : {}),
            }}
          >
            Next
          </button>
        )}
        {(!step.infoOnly || stepCompleted) && (
          <div
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 900,
              fontSize: step.infoOnly || stepCompleted ? 'clamp(0.72rem, 2vmin, 0.82rem)' : 'clamp(0.75rem, 2.4vmin, 1rem)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: stepCompleted ? '#fff' : 'rgba(255, 255, 255, 0.95)',
              textShadow: stepCompleted
                ? '0 0 18px rgba(255, 255, 255, 0.6)'
                : '0 0 14px rgba(255, 247, 213, 0.35)',
              minHeight: '1.1rem',
              maxWidth: '26rem',
              lineHeight: 1.35,
            }}
          >
            {stepCompleted ? 'Nice!' : actionWaiting}
          </div>
        )}
      </div>

      {isTouchDevice && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1302,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: `0 max(1rem, calc(env(safe-area-inset-right, 0px) + 1rem)) ${controlsBottomInset} max(1rem, calc(env(safe-area-inset-left, 0px) + 1rem))`,
            pointerEvents: 'none',
          }}
        >
          <TutorialTouchButton
            side="left"
            glyph="↻"
            label="SPIN"
            pressed={pressedControl === 'left'}
            onPointerDown={handleTouchButtonDown('left')}
            onPointerUp={handleTouchButtonUp('left')}
            onPointerCancel={handleTouchButtonUp('left')}
          />
          <TutorialTouchButton
            side="right"
            glyph="↑"
            label="JUMP"
            pressed={pressedControl === 'right' || (step.id === 'grind' && isHolding)}
            onPointerDown={handleTouchButtonDown('right')}
            onPointerUp={handleTouchButtonUp('right')}
            onPointerCancel={handleTouchButtonUp('right')}
          />
        </div>
      )}
    </div>
  )
}

function TutorialTouchButton({
  side,
  glyph,
  label,
  pressed,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: '6.875rem',
        height: '6.875rem',
        borderRadius: '50%',
        background: pressed
          ? 'linear-gradient(135deg, rgba(255, 107, 53, 0.88), rgba(255, 180, 92, 0.88))'
          : 'linear-gradient(135deg, rgba(255, 107, 53, 0.38), rgba(255, 160, 72, 0.38))',
        border: pressed
          ? '2px solid rgba(255, 255, 255, 0.82)'
          : '2px solid rgba(255, 255, 255, 0.4)',
        boxShadow: pressed
          ? '0 10px 28px rgba(255, 107, 53, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.28)'
          : '0 6px 20px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.12rem',
        opacity: pressed ? 1 : 0.86,
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 120ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 120ms ease-out, background 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        alignSelf: side === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      <span style={{ fontFamily: 'Knewave', fontSize: '2.75rem', lineHeight: 1 }}>{glyph}</span>
      <span
        style={{
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 800,
          fontSize: '0.775rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </button>
  )
}
