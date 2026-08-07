import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// The plain <script> vite-plugin-pwa injects into index.html only calls
// navigator.serviceWorker.register() — it has no update logic at all, since
// registerType: 'autoUpdate' only wires up automatic skipWaiting+reload
// through this virtual module, and only for the injectManifest strategy
// (which this app uses, for the push-notification listeners in sw.ts). Without
// this, a Capacitor WebView keeps its old worker active indefinitely — there's
// no browser tab to close to let the new one take over — so every future
// build would silently never reach an installed app.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
