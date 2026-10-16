import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App.tsx'
import './styles/index.css'
import './styles/mobile.css'
import { registerServiceWorker } from './lib/serviceWorker'
import { installEnterToNextField } from './lib/enterToNextField'

registerServiceWorker()
installEnterToNextField()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
