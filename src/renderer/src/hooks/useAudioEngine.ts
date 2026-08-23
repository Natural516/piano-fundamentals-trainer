import { usePianoAudio, type UsePianoAudioResult } from './usePianoAudio'

export type { UsePianoAudioResult }

/**
 * Compatibility entry point. The former local-monitoring toggle has been
 * replaced by the persistent audio mode (builtin / silent) plus a
 * dedicated piano volume, implemented by usePianoAudio.
 */
export function useAudioEngine(): UsePianoAudioResult {
  return usePianoAudio()
}
