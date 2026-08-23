export type PianoAudioMode = 'builtin' | 'silent'

export interface SampleAnchor {
  sample: string
  lokey: number
  hikey: number
  pitchKeycenter: number
  volume?: number
  loopMode?: 'no_loop' | 'continuous' | 'one_shot'
  loopStart?: number
  loopEnd?: number
}

export interface SamplePackManifest {
  id: string
  name: string
  attribution: string
  license: string
  baseUrl: string
  anchors: SampleAnchor[]
}

export interface SelectedSample {
  anchor: SampleAnchor
  playbackRate: number
}

export interface PianoSamplerStatus {
  state: 'idle' | 'ready' | 'suspended' | 'unsupported' | 'error'
  samplePackLoaded: boolean
  sampleCount: number
  activeVoices: number
  message: string
}

export const PIANO_AUDIO_MODE_LABELS: Record<PianoAudioMode, string> = {
  builtin: '内置钢琴',
  silent: '关闭'
}
