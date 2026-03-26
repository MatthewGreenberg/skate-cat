import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Leva } from 'leva'
import './index.css'
import App from './App.jsx'

const isDebugMode = new URLSearchParams(window.location.search).has('debug')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Leva hidden={!isDebugMode} collapsed={false} />
  </StrictMode>,
)
