import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App.tsx'
import './styles/index.css'
import './styles/mobile.css'
import { registerServiceWorker } from './lib/serviceWorker'
import { installEnterToNextField } from './lib/enterToNextField'

registerServiceWorker()
installEnterToNextField()

// After a new version goes live, a page opened before it still asks for the
// old code files (their names change with every build), and opening a screen
// that was not loaded yet fails. The page then reloads once to get the new
// version; if it still fails within a minute, the error is shown instead of
// reloading again and again.
const RELOADED_KEY = 'acifac.reloadedForNewVersion'
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_KEY) || 0)
    if (Date.now() - last < 60000) return
    window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
