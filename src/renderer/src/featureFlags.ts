export const FEATURE_FLAGS = {
  FEATURE_EXPERIMENTAL_HARMONY_GENERATOR: false,
  FEATURE_AI_MUSIC_GENERATOR: false,
  FEATURE_SCORE_FOLLOWING: false
} as const

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS

export const EXPERIMENTAL_ACCESS_STORAGE_KEY = 'piano-trainer.experimental-access'

/**
 * Dev-only explicit experimental access. Normal users never see experimental
 * UI; a developer can opt in via a localStorage flag (documented in docs).
 */
export function isExperimentalAccessEnabled(storage: Pick<Storage, 'getItem'> = window.localStorage): boolean {
  try {
    return storage.getItem(EXPERIMENTAL_ACCESS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setExperimentalAccess(enabled: boolean, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    storage.setItem(EXPERIMENTAL_ACCESS_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Non-fatal.
  }
}

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[key]
}

export function isExperimentalFeatureVisible(key: FeatureFlagKey): boolean {
  return isFeatureEnabled(key) || isExperimentalAccessEnabled()
}
