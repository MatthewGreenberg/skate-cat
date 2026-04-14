import { useEffect, useRef, useState } from 'react'

const BAR_HEIGHT_VH = 7
const ENTER_DURATION_MS = 1200
const ENTER_DELAY_MS = 250
const EXIT_DURATION_MS = 850
const ENTER_EASE = 'cubic-bezier(0.25, 0.46, 0.2, 1)'
const EXIT_EASE = 'cubic-bezier(0.5, 0, 0.75, 0)'

const barBase = {
  position: 'fixed',
  left: 0,
  right: 0,
  height: `${BAR_HEIGHT_VH}vh`,
  background: '#000',
  zIndex: 180,
  pointerEvents: 'none',
  willChange: 'transform',
  backfaceVisibility: 'hidden',
}

export default function CinematicLetterbox({ active }) {
  const [open, setOpen] = useState(false)
  const rafRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setOpen(active))
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  const duration = open ? ENTER_DURATION_MS : EXIT_DURATION_MS
  const delay = open ? ENTER_DELAY_MS : 0
  const ease = open ? ENTER_EASE : EXIT_EASE
  const transition = `transform ${duration}ms ${ease} ${delay}ms`
  const topTransform = open ? 'translate3d(0, 0, 0)' : 'translate3d(0, -100%, 0)'
  const bottomTransform = open ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)'

  return (
    <>
      <div style={{ ...barBase, top: 0, transform: topTransform, transition }} />
      <div style={{ ...barBase, bottom: 0, transform: bottomTransform, transition }} />
    </>
  )
}
