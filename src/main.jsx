import { createRoot } from 'react-dom/client'
import { Leva } from 'leva'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'

const isDebugMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')
const root = createRoot(document.getElementById('root'))

if (typeof window !== 'undefined') {
  const preventGesture = (event) => event.preventDefault()
  window.addEventListener('gesturestart', preventGesture, { passive: false })
  window.addEventListener('gesturechange', preventGesture, { passive: false })
  window.addEventListener('gestureend', preventGesture, { passive: false })
  document.addEventListener('dblclick', preventGesture, { passive: false })
}

async function waitForBootFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return

  const fontLoads = [
    document.fonts.load('1em "Knewave"'),
    document.fonts.load('700 1em "Nunito"'),
    document.fonts.load('900 1em "Nunito"'),
  ]

  await Promise.race([
    Promise.all(fontLoads),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ])
}

void waitForBootFonts().finally(() => {
  root.render(
    <>
      <App />
      <Analytics />
      {isDebugMode ? <Leva oneLineLabels collapsed={false} /> : null}
    </>,
  )
})
