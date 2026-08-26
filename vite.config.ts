/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only bridge to the community API Worker: its ALLOWED_ORIGINS
    // allowlist rejects localhost, so the browser talks same-origin to Vite
    // and this proxy forwards without the localhost Origin header. Use
    // VITE_COMMUNITY_API_BASE="" (same-origin) in .env.local for dev.
    proxy: {
      '/api/proxy': {
        target: 'https://airlens.cloud',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
