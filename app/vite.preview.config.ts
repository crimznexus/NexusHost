// Runs the renderer alone in a normal browser with the mock backend (src/renderer/src/lib/mock.ts),
// for visual QA without Electron:  npx vite --config vite.preview.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared'), '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
