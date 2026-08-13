export interface VoiceDescriptor {
  id: number
  midiNumber: number
  released: boolean
  sustained: boolean
  startedAt: number
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
    .filter((voice) => voice.released && !voice.sustained)
    .sort((left, right) => left.startedAt - right.startedAt)[0]

  return oldestReleased ?? [...voices].sort((left, right) => left.startedAt - right.startedAt)[0] ?? null
}

export function collectSustainedVoices(voices: VoiceDescriptor[]): VoiceDescriptor[] {
  return voices.filter((voice) => voice.sustained)
}

export function countReleasedVoices(voices: VoiceDescriptor[]): number {
  return voices.filter((voice) => voice.released).length
}
