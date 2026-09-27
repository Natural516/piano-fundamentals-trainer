import { createReadStream, readFileSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const updaterProperties = readFileSync(resolve('android/updater.properties'), 'utf8')
const versionProperties = readFileSync(resolve('android/version.properties'), 'utf8')
const productionManifestUrl = updaterProperties.match(/^manifestUrl=(.+)$/m)?.[1]?.trim() ?? ''
const androidVersionCode = Number(versionProperties.match(/^versionCode=(\d+)$/m)?.[1])
const androidVersionName = versionProperties.match(/^versionName=(.+)$/m)?.[1]?.trim() ?? ''
if (!productionManifestUrl || new URL(productionManifestUrl).protocol !== 'https:') {
  throw new Error('android/updater.properties must define a valid HTTPS manifestUrl')
}
if (!Number.isSafeInteger(androidVersionCode) || androidVersionCode < 1 || !androidVersionName) {
  throw new Error('android/version.properties must define valid versionCode and versionName values')
}

export default defineConfig(({ mode }) => {
  const isQaBuild = mode === 'android-qa'
  const updateManifestUrl = mode === 'android-release'
    ? productionManifestUrl
    : process.env.UPDATE_MANIFEST_URL?.trim() ?? ''

  return {
    root: resolve('prototype/android-tablet-v1'),
    base: './',
    define: {
      __QA_BUILD__: JSON.stringify(isQaBuild),
      __ANDROID_VERSION_CODE__: JSON.stringify(androidVersionCode),
      __ANDROID_VERSION_NAME__: JSON.stringify(androidVersionName),
      __UPDATE_MANIFEST_URL__: JSON.stringify(updateManifestUrl)
    },
    plugins: [
      react(),
      {
        name: 'external-theme-source-test-server',
        apply: 'serve',
        configureServer(server) {
          const sourceRoot = resolve('theme-packages/bocchi')
          server.middlewares.use('/__theme_source__/bocchi', (request, response, next) => {
            try {
              const relative = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/+/, '')
              const absolute = resolve(sourceRoot, relative)
              if (absolute !== sourceRoot && !absolute.startsWith(`${sourceRoot}${sep}`)) { response.statusCode = 403; response.end(); return }
              if (!statSync(absolute).isFile()) { next(); return }
              const mime = { '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(absolute).toLowerCase()]
              if (mime) response.setHeader('Content-Type', mime)
              response.setHeader('Cache-Control', 'no-store')
              createReadStream(absolute).pipe(response)
            } catch { next() }
          })
        }
      }
    ],
    build: {
      outDir: resolve('dist/android-tablet-prototype'),
      emptyOutDir: true
    },
    server: {
      host: '0.0.0.0'
    }
  }
})
