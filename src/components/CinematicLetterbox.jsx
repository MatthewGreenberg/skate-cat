import { useEffect, useRef, useState } from 'react'

const BAR_HEIGHT_VH = 7
const TRANSITION = 'height 650ms cubic-bezier(0.65, 0, 0.35, 1)'

const barBase = {
  position: 'fixed',
  left: 0,
  right: 0,
  background: '#000',
  zIndex: 180,
  pointerEvents: 'none',
  transition: TRANSITION,
}

export default function CinematicLetterbox({ active }) {
  const [open, setOpen] = useState(false)
  const rafRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!active) {
      setOpen(false)
      return
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setOpen(true))
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  const height = open ? `${BAR_HEIGHT_VH}vh` : '0vh'
  return (
    <>
      <div style={{ ...barBase, top: 0, height }} />
      <div style={{ ...barBase, bottom: 0, height }} />
    </>
  )
}
