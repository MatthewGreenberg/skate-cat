import { createRoot } from 'react-dom/client'
import { Leva } from 'leva'
import './index.css'
import App from './App.jsx'

const isDebugMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

createRoot(document.getElementById('root')).render(
  <>
    <App />
    {isDebugMode ? <Leva collapsed={false} /> : null}
  </>,
)
