import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server proxies /api to the Express server so `npm run dev` and the
// deployed app behave the same way. Run both in a Codespace:
//   terminal 1: npm run dev:server
//   terminal 2: npm run dev
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    // The deployment package is a zip of dist/ plus the server. Keeping the
    // output flat and unhashed is not worth it, hashed assets cache correctly.
    emptyOutDir: true,
  },
})
