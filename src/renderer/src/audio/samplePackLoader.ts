import type { SampleAnchor, SelectedSample } from './pianoAudioTypes'

/**
 * Minimal SFZ subset parser used to index sample packs such as
 * Salamander Grand Piano V2 (CC BY 3.0). Header-less anchors plus common
 * key/loop/volume opcodes are supported; unknown opcodes are ignored.
 */
export function parseSfz(sfzText: string): SampleAnchor[] {
  const anchors: SampleAnchor[] = []
  const groupDefaults: Partial<SampleAnchor> = {}
  let current: Partial<SampleAnchor> | null = null

  const lines = sfzText.split(/\r?\n/)

  const flushRegion = (): void => {
    if (current && typeof current.sample === 'string') {
      anchors.push(finalizeAnchor({ ...groupDefaults, ...current }))
    }
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    if (line.startsWith('//')) {
      continue
    }

    if (line.startsWith('<region>')) {
      flushRegion()
      current = {}
    } else if (line.startsWith('<group>')) {
      flushRegion()
      current = null
    }

    const opcodePattern = /([a-zA-Z_]+)=([^\s>]+)/g
    let opcodeMatch: RegExpExecArray | null

    while ((opcodeMatch = opcodePattern.exec(line)) !== null) {
      const key = opcodeMatch[1].toLowerCase()
      const value = opcodeMatch[2].trim()
      const numericValue = Number(value)
      const target = current ?? groupDefaults

      switch (key) {
        case 'sample':
          target.sample = value
          break
        case 'lokey':
          if (Number.isFinite(numericValue)) target.lokey = numericValue
          break
        case 'hikey':
          if (Number.isFinite(numericValue)) target.hikey = numericValue
          break
        case 'pitch_keycenter':
          if (Number.isFinite(numericValue)) target.pitchKeycenter = numericValue
          break
        case 'volume':
          if (Number.isFinite(numericValue)) target.volume = numericValue
          break
        case 'loop_mode':
          if (value === 'loop_continuous' || value === 'continuous') target.loopMode = 'continuous'
          else if (value === 'no_loop' || value === 'one_shot') {
            target.loopMode = value === 'one_shot' ? 'one_shot' : 'no_loop'
          }
          break
        case 'loop_start':
          if (Number.isFinite(numericValue)) target.loopStart = numericValue
          break
        case 'loop_end':
          if (Number.isFinite(numericValue)) target.loopEnd = numericValue
          break
        default:
          break
      }
    }
  }

  flushRegion()
  return anchors
}

function finalizeAnchor(partial: Partial<SampleAnchor>): SampleAnchor {
  const keycenter = partial.pitchKeycenter ?? 60

  return {
    sample: partial.sample ?? '',
    lokey: partial.lokey ?? keycenter,
    hikey: partial.hikey ?? keycenter,
    pitchKeycenter: keycenter,
    volume: partial.volume,
    loopMode: partial.loopMode,
    loopStart: partial.loopStart,
    loopEnd: partial.loopEnd
  }
}

export function computePlaybackRate(anchor: SampleAnchor, midiNumber: number): number {
  return 2 ** ((midiNumber - anchor.pitchKeycenter) / 12)
}

export function selectSampleAndRate(anchors: SampleAnchor[], midiNumber: number): SelectedSample | null {
  if (anchors.length === 0) {
    return null
  }

  const containing = anchors
    .filter((anchor) => midiNumber >= anchor.lokey && midiNumber <= anchor.hikey)
    .sort((left, right) => Math.abs(left.pitchKeycenter - midiNumber) - Math.abs(right.pitchKeycenter - midiNumber))

  const best = containing[0] ?? anchors
    .map((anchor) => ({ anchor, distance: Math.abs(anchor.pitchKeycenter - midiNumber) }))
    .sort((left, right) => left.distance - right.distance)[0]?.anchor

  if (!best) {
    return null
  }

  return {
    anchor: best,
    playbackRate: computePlaybackRate(best, midiNumber)
  }
}

export function getVelocityGain(velocity: number): number {
  if (!Number.isFinite(velocity) || velocity <= 0) return 0
  const normalized = Math.min(1, velocity / 127)
  return Math.max(0.05, normalized)
}

export function clampPianoVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)))
}
