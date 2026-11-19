import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        input: process.env.NEXUS_SMOKE_BUILD
          ? { index: resolve('src/main/index.ts'), smoke: resolve('src/main/smoke.ts'), 'smoke-servers': resolve('src/main/smoke-servers.ts'), 'smoke-world': resolve('src/main/smoke-world.ts'), 'smoke-loaders': resolve('src/main/smoke-loaders.ts') }
          : { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react()],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
