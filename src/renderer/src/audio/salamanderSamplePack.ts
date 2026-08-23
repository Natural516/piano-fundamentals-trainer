import type { SampleAnchor, SamplePackManifest } from './pianoAudioTypes'

export const SALAMANDER_SAMPLE_ASSET_ROOT = 'salamander'
export const SALAMANDER_SAMPLE_BYTES = 6_941_896

const SAMPLE_CENTERS: ReadonlyArray<readonly [string, number]> = [
  ['A0', 21],
  ['C1', 24], ['Ds1', 27], ['Fs1', 30], ['A1', 33],
  ['C2', 36], ['Ds2', 39], ['Fs2', 42], ['A2', 45],
  ['C3', 48], ['Ds3', 51], ['Fs3', 54], ['A3', 57],
  ['C4', 60], ['Ds4', 63], ['Fs4', 66], ['A4', 69],
  ['C5', 72], ['Ds5', 75], ['Fs5', 78], ['A5', 81],
  ['C6', 84], ['Ds6', 87], ['Fs6', 90], ['A6', 93],
  ['C7', 96], ['Ds7', 99], ['Fs7', 102], ['A7', 105],
  ['C8', 108]
]

export const SALAMANDER_SAMPLE_ANCHORS: SampleAnchor[] = SAMPLE_CENTERS.map(([name, midiNumber]) => ({
  sample: `${name}.ogg`,
  lokey: midiNumber,
  hikey: midiNumber,
  pitchKeycenter: midiNumber,
  loopMode: 'no_loop'
}))

export const SALAMANDER_SAMPLE_PACK: SamplePackManifest = {
  id: 'salamander-grand-piano-v2-yamaha-c5',
  name: 'Salamander Grand Piano V2 / Yamaha C5',
  attribution: 'Recorded by Alexander Holm',
  license: 'CC BY 3.0',
  baseUrl: SALAMANDER_SAMPLE_ASSET_ROOT,
  anchors: SALAMANDER_SAMPLE_ANCHORS
}
