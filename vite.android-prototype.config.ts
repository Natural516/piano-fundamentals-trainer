import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('prototype/android-tablet-v1'),
  base: './',
  define: {
    __UPDATE_MANIFEST_URL__: JSON.stringify(process.env.UPDATE_MANIFEST_URL?.trim() ?? '')
  },
  plugins: [react()],
  build: {
    outDir: resolve('dist/android-tablet-prototype'),
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0'
  }
})
