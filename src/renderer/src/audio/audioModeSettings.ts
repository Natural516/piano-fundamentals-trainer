import type { PianoAudioMode } from './pianoAudioTypes'

export const PIANO_AUDIO_MODE_STORAGE_KEY = 'piano-audio-mode.v1'
export const PIANO_VOLUME_STORAGE_KEY = 'piano-volume.v1'

const VALID_MODES: PianoAudioMode[] = ['builtin', 'silent']

export function sanitizeAudioMode(value: unknown): PianoAudioMode {
  if (value === 'external') return 'silent'
  return VALID_MODES.includes(value as PianoAudioMode) ? (value as PianoAudioMode) : 'builtin'
}

export function readAudioMode(storage: Pick<Storage, 'getItem'> = window.localStorage): PianoAudioMode {
  try {
    return sanitizeAudioMode(storage.getItem(PIANO_AUDIO_MODE_STORAGE_KEY))
  } catch {
    return 'builtin'
  }
}

export function writeAudioMode(mode: PianoAudioMode, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem(PIANO_AUDIO_MODE_STORAGE_KEY, sanitizeAudioMode(mode))
    return true
  } catch {
    return false
  }
}

export function readPianoVolume(storage: Pick<Storage, 'getItem'> = window.localStorage): number {
  try {
    const rawValue = storage.getItem(PIANO_VOLUME_STORAGE_KEY)
    if (rawValue === null) return 70
    const value = Number(rawValue)
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 70
  } catch {
    return 70
  }
}

export function writePianoVolume(volume: number, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem(PIANO_VOLUME_STORAGE_KEY, String(clampVolume(volume)))
    return true
  } catch {
    return false
  }
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)))
}
