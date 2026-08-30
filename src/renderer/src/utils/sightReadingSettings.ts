export * from '../../../sightReading/sightReadingSettings'
import {
  createSightReadingSettingsStore,
  DEFAULT_SIGHT_READING_SETTINGS,
  type SightReadingSettings
} from '../../../sightReading/sightReadingSettings'

// Desktop-only storage boundary; the shared module never reads browser globals.
export function readSightReadingSettings(): SightReadingSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SIGHT_READING_SETTINGS }
  try {
    const result = createSightReadingSettingsStore(window.localStorage, DEFAULT_SIGHT_READING_SETTINGS).read()
    if (!result.success) console.warn('[sight-reading] 读取练习设置失败，已使用默认设置。', result.error)
    return result.settings
  } catch (error) {
    console.warn('[sight-reading] 读取练习设置失败，已使用默认设置。', error)
    return { ...DEFAULT_SIGHT_READING_SETTINGS }
  }
}

export function writeSightReadingSettings(settings: SightReadingSettings): boolean {
  if (typeof window === 'undefined') return false
  try {
    const result = createSightReadingSettingsStore(window.localStorage, DEFAULT_SIGHT_READING_SETTINGS).write(settings)
    if (!result.success) console.warn('[sight-reading] 保存练习设置失败。', result.error)
    return result.success
  } catch (error) {
    console.warn('[sight-reading] 保存练习设置失败。', error)
    return false
  }
}
