import { useEffect, useState } from 'react'

const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function detectTouchDevice() {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
}

function detectPortrait() {
  if (typeof window === 'undefined') return false
  if (hasMatchMedia) {
    return window.matchMedia('(orientation: portrait)').matches
  }
  return window.innerHeight > window.innerWidth
}

export default function useOrientation() {
  const [isPortrait, setIsPortrait] = useState(detectPortrait)
  const [isTouchDevice] = useState(detectTouchDevice)

  useEffect(() => {
    const update = () => setIsPortrait(detectPortrait())
    const mq = hasMatchMedia ? window.matchMedia('(orientation: portrait)') : null
    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', update)
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(update)
      }
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', update)
        } else if (typeof mq.removeListener === 'function') {
          mq.removeListener(update)
        }
      }
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return {
    isPortrait,
    isTouchDevice,
    shouldBlock: isTouchDevice && isPortrait,
  }
}
