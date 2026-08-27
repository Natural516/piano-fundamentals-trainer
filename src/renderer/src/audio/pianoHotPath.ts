import { PianoSampler } from './pianoSampler'

/**
 * Synchronous MIDI-to-voice path used only after the full sample pack has been
 * decoded and the one shared AudioContext is running. Returning false keeps all
 * loading/resume work on the separate cold path.
 */
export function triggerReadyPianoVoice(
  sampler: PianoSampler | null,
  midiNumber: number,
  velocity: number,
  diagnosticEventId?: number
): boolean {
  if (!sampler?.isReadyForImmediatePlay) return false
  return sampler.noteOn(midiNumber, velocity, diagnosticEventId)
}
