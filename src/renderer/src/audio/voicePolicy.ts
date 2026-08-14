export interface VoiceDescriptor {
  id: number
  midiNumber: number
  physicalKeyDown: boolean
  sustainedByPedal: boolean
  released: boolean
  startedAt: number
}

export interface VoicePedalState {
  physicalKeyDown: boolean
  sustainedByPedal: boolean
  released: boolean
}

export function createPedalVoiceState(): VoicePedalState {
  return { physicalKeyDown: false, sustainedByPedal: false, released: false }
}

export function pedalKeyDown(state: VoicePedalState): VoicePedalState {
  return { physicalKeyDown: true, sustainedByPedal: false, released: false }
}

export function pedalKeyUp(state: VoicePedalState, pedalDown: boolean): VoicePedalState {
  if (!state.physicalKeyDown || state.released) return state
  const next: VoicePedalState = { ...state, physicalKeyDown: false }
  if (pedalDown) {
    return { ...next, sustainedByPedal: true }
  }
  return { ...next, sustainedByPedal: false, released: true }
}

export function pedalPedalUp(state: VoicePedalState): VoicePedalState {
  if (state.physicalKeyDown) {
    // A physically held key must not be released by the pedal.
    return state
  }
  if (state.sustainedByPedal) {
    return { ...state, sustainedByPedal: false, released: true }
  }
  return state
}

export function pedalAllNotesOff(state: VoicePedalState): VoicePedalState {
  return { physicalKeyDown: false, sustainedByPedal: false, released: true }
}

export function findVoiceForNote(voices: VoiceDescriptor[], midiNumber: number): VoiceDescriptor | null {
  return voices.find((voice) => voice.midiNumber === midiNumber && !voice.released) ?? null
}

export function pickVoiceToSteal(
  voices: VoiceDescriptor[],
  maxPolyphony: number
): VoiceDescriptor | null {
  if (voices.length < maxPolyphony) {
    return null
  }

  const oldestReleased = [...voices]
    .filter((voice) => voice.released && !voice.sustainedByPedal)
    .sort((left, right) => left.startedAt - right.startedAt)[0]

  return oldestReleased ?? [...voices].sort((left, right) => left.startedAt - right.startedAt)[0] ?? null
}

export function collectSustainedVoices(voices: VoiceDescriptor[]): VoiceDescriptor[] {
  return voices.filter((voice) => voice.sustainedByPedal && !voice.physicalKeyDown && !voice.released)
}

export function countReleasedVoices(voices: VoiceDescriptor[]): number {
  return voices.filter((voice) => voice.released).length
}
