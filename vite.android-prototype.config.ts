import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const updaterProperties = readFileSync(resolve('android/updater.properties'), 'utf8')
const productionManifestUrl = updaterProperties.match(/^manifestUrl=(.+)$/m)?.[1]?.trim() ?? ''
if (!productionManifestUrl || new URL(productionManifestUrl).protocol !== 'https:') {
  throw new Error('android/updater.properties must define a valid HTTPS manifestUrl')
}

export default defineConfig(({ mode }) => {
  const updateManifestUrl = mode === 'android-release'
    ? productionManifestUrl
    : process.env.UPDATE_MANIFEST_URL?.trim() ?? ''

  return {
    root: resolve('prototype/android-tablet-v1'),
    base: './',
    define: {
      __UPDATE_MANIFEST_URL__: JSON.stringify(updateManifestUrl)
    },
    plugins: [react()],
    build: {
      outDir: resolve('dist/android-tablet-prototype'),
      emptyOutDir: true
    },
    server: {
      host: '0.0.0.0'
    }
  }
})
