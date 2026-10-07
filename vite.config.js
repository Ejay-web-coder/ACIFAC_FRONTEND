import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const refused = (error) => error?.code === 'ECONNREFUSED' || (error?.errors ?? []).some((item) => item?.code === 'ECONNREFUSED')

// The /api proxy to the backend. While the backend restarts (a backend file
// was saved) nothing listens on its port for a moment. Instead of a 502 and a
// stack trace, the app is told the request never reached the backend
// (X-Backend-Unavailable), so it waits and sends it again (src/lib/api.ts).
export function apiProxy(target) {
  let lastNotice = 0
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      const emit = proxy.emit.bind(proxy)
      proxy.emit = (event, error, req, res, ...rest) => {
        if (event !== 'error' || !refused(error) || typeof res?.writeHead !== 'function') return emit(event, error, req, res, ...rest)
        if (!res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json', 'X-Backend-Unavailable': '1' })
          res.end(JSON.stringify({ message: 'The ACIFAC server is restarting. Please try again in a moment.' }))
        }
        if (Date.now() - lastNotice > 5000) {
          lastNotice = Date.now()
          console.log(`[api] The backend at ${target} is not answering yet (starting or restarting); the app will try again.`)
        }
        return true
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': apiProxy('http://localhost:4000'),
    },
  },
  build: {
    cssMinify: true,
    chunkSizeWarningLimit: 500,
  },
})
