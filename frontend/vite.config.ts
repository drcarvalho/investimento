import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://icons.brapi.dev https://brapi.dev data:; connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 ws://localhost:* ws://127.0.0.1:*; object-src 'none'; base-uri 'self';"

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
          {
            name: 'inject-dev-csp',
            transformIndexHtml() {
              return [
                {
                  tag: 'meta',
                  attrs: { 'http-equiv': 'Content-Security-Policy', content: DEV_CSP },
                  injectTo: 'head-prepend',
                },
              ]
            },
          },
        ]
      : []),
  ],
  server: {
    port: 3000,
    open: true,
  },
}))
