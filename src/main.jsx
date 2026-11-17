import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lessy.css'
import App from './App.jsx'

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Sur le web, le service worker permet d'ouvrir l'application hors ligne.
// Dans l'application Android (Capacitor), les fichiers sont déjà sur le téléphone.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.Capacitor) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
