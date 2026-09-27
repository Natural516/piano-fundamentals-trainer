import { Capacitor, registerPlugin } from '@capacitor/core'

export const APP_SOURCE_REPOSITORY_URL = 'https://github.com/Natural516/piano-fundamentals-trainer'

interface ExternalUrlPlugin {
  openSourceRepository(): Promise<void>
}

const NativeExternalUrl = registerPlugin<ExternalUrlPlugin>('ExternalUrl')

export async function openSourceRepository(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await NativeExternalUrl.openSourceRepository()
    return
  }

  window.open(APP_SOURCE_REPOSITORY_URL, '_blank', 'noopener,noreferrer')
}
