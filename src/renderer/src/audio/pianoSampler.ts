import { midiNumberToFrequency } from '../utils/audioNotes'
import { getVelocityGain, selectSampleAndRate } from './samplePackLoader'
import type { PianoSamplerStatus, SampleAnchor, SelectedSample } from './pianoAudioTypes'
import {
  collectSustainedVoices,
  pickVoiceToSteal,
  type VoiceDescriptor
} from './voicePolicy'

interface SamplerVoice {
  descriptor: VoiceDescriptor
  sources: Array<AudioBufferSourceNode | OscillatorNode>
  cleanupNodes: AudioNode[]
  release: (releaseMs: number) => void
  stopImmediate: () => void
}

interface FallbackVoice {
  sources: OscillatorNode[]
  gain: GainNode
  cleanupNodes: AudioNode[]
}

const DEFAULT_MAX_POLYPHONY = 64

export interface PianoSamplerOptions {
  maxPolyphony?: number
  volume?: number
}

function getVolumeGain(volume: number): number {
  const normalized = Math.min(1, Math.max(0, volume / 100))
  return normalized ** 1.65
}

function createFallbackVoice(
  audioContext: AudioContext,
  midiNumber: number,
  velocity: number
): FallbackVoice {
  const now = audioContext.currentTime
  const baseFrequency = midiNumberToFrequency(midiNumber)
  const velocityCurve = 0.2 + getVelocityGain(velocity) * 0.8
  const gain = audioContext.createGain()
  const filter = audioContext.createBiquadFilter()
  const attackEnd = now + 0.008
  const decayEnd = attackEnd + 0.32
  const naturalEnd = now + 4.8
  const peakGain = 0.8 * velocityCurve

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(peakGain, attackEnd)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.24), decayEnd)
  gain.gain.exponentialRampToValueAtTime(0.0006, naturalEnd)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(7600, Math.max(2400, baseFrequency * 9)), now)
  filter.frequency.exponentialRampToValueAtTime(Math.min(3600, Math.max(1100, baseFrequency * 3.4)), now + 0.7)
  filter.Q.setValueAtTime(0.5, now)
  filter.connect(gain)

  const partials: Array<{ type: OscillatorType; multiplier: number; detune: number; level: number }> = [
    { type: 'triangle', multiplier: 1, detune: -2, level: 0.78 },
    { type: 'sine', multiplier: 2, detune: 4, level: 0.18 },
    { type: 'sine', multiplier: 3, detune: -5, level: 0.06 },
    { type: 'triangle', multiplier: 4, detune: 2, level: 0.02 }
  ]
  const sources = partials.map((partial) => {
    const oscillator = audioContext.createOscillator()
    const partialGain = audioContext.createGain()
    oscillator.type = partial.type
    oscillator.frequency.setValueAtTime(baseFrequency * partial.multiplier, now)
    oscillator.detune.setValueAtTime(partial.detune, now)
    partialGain.gain.setValueAtTime(partial.level, now)
    oscillator.connect(partialGain)
    partialGain.connect(filter)
    oscillator.start(now)
    oscillator.stop(naturalEnd + 0.08)
    return oscillator
  })

  return {
    sources,
    gain,
    cleanupNodes: [filter, gain]
  }
}

/**
 * Web Audio piano voice engine.
 *
 * - Uses nearest sample anchors with playbackRate pitch shifting when a sample
 *   pack is loaded; otherwise falls back to a built-in synthesized voice.
 * - Supports polyphony, voice stealing, repeated-note retrigger, CC64 sustain
 *   and pedal release, per-note velocity gain, master piano volume and cleanup.
 */
export class PianoSampler {
  private readonly audioContext: AudioContext
  private readonly masterGain: GainNode
  private readonly maxPolyphony: number
  private voices = new Map<number, SamplerVoice>()
  private anchors: SampleAnchor[] = []
  private buffers = new Map<string, AudioBuffer>()
  private samplePackLoaded = false
  private nextVoiceId = 1
  private volume = 70

  constructor(audioContext: AudioContext, options: PianoSamplerOptions = {}) {
    this.audioContext = audioContext
    this.maxPolyphony = options.maxPolyphony ?? DEFAULT_MAX_POLYPHONY
    this.volume = options.volume ?? 70
    this.masterGain = audioContext.createGain()
    this.masterGain.gain.setValueAtTime(getVolumeGain(this.volume), audioContext.currentTime)
    this.masterGain.connect(audioContext.destination)
  }

  async loadSamplePack(anchors: SampleAnchor[], loadBuffer: (sample: string) => Promise<AudioBuffer>): Promise<number> {
    this.anchors = anchors
    this.buffers.clear()
    let loaded = 0

    for (const anchor of anchors) {
      if (this.buffers.has(anchor.sample)) {
        continue
      }

      try {
        const buffer = await loadBuffer(anchor.sample)
        this.buffers.set(anchor.sample, buffer)
        loaded += 1
      } catch {
        // Missing/unreadable sample files are skipped; anchors pointing to
        // them fall back to the synthesized voice.
      }
    }

    this.samplePackLoaded = loaded > 0
    return loaded
  }

  noteOn(midiNumber: number, velocity: number): void {
    const existing = this.voices.get(midiNumber)

    if (existing) {
      existing.stopImmediate()
      this.voices.delete(midiNumber)
    }

    const stealTarget = pickVoiceToSteal(
      [...this.voices.values()].map((voice) => voice.descriptor),
      this.maxPolyphony
    )

    if (stealTarget) {
      const voiceToSteal = this.voices.get(stealTarget.midiNumber)
      if (voiceToSteal) {
        voiceToSteal.stopImmediate()
        this.voices.delete(stealTarget.midiNumber)
      }
    }

    const descriptor: VoiceDescriptor = {
      id: this.nextVoiceId++,
      midiNumber,
      released: false,
      sustained: false,
      startedAt: this.audioContext.currentTime
    }
    const selected = selectSampleAndRate(this.anchors, midiNumber)

    if (selected && this.buffers.has(selected.anchor.sample)) {
      const voice = this.createSampleVoice(descriptor, selected, velocity)
      if (voice) {
        this.voices.set(midiNumber, voice)
      }
      return
    }

    const fallback = createFallbackVoice(this.audioContext, midiNumber, velocity)
    fallback.gain.connect(this.masterGain)
    const voice: SamplerVoice = {
      descriptor,
      sources: fallback.sources,
      cleanupNodes: fallback.cleanupNodes,
      release: (releaseMs) => {
        const now = this.audioContext.currentTime
        const releaseEnd = now + releaseMs / 1000
        fallback.gain.gain.cancelScheduledValues(now)
        fallback.gain.gain.setValueAtTime(Math.max(0.0001, fallback.gain.gain.value), now)
        fallback.gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)
        for (const source of fallback.sources) {
          try {
            source.stop(releaseEnd + 0.04)
          } catch {
            // Already stopped.
          }
        }
      },
      stopImmediate: () => {
        for (const source of fallback.sources) {
          try {
            source.stop()
          } catch {
            // Already stopped.
          }
        }
        for (const node of fallback.cleanupNodes) {
          try {
            node.disconnect()
          } catch {
            // Already disconnected.
          }
        }
      }
    }
    this.voices.set(midiNumber, voice)
  }

  noteOff(midiNumber: number): void {
    const voice = this.voices.get(midiNumber)
    if (!voice || voice.descriptor.released || voice.descriptor.sustained) return

    voice.descriptor.released = true
    voice.release(220)
    this.voices.delete(midiNumber)
  }

  setSustain(down: boolean): void {
    if (down) {
      for (const voice of this.voices.values()) {
        if (!voice.descriptor.released) {
          voice.descriptor.sustained = true
        }
      }
      return
    }

    const sustained = collectSustainedVoices([...this.voices.values()].map((voice) => voice.descriptor))
    for (const descriptor of sustained) {
      const voice = this.voices.get(descriptor.midiNumber)
      if (!voice) continue
      voice.descriptor.sustained = false
      voice.descriptor.released = true
      voice.release(260)
      this.voices.delete(descriptor.midiNumber)
    }
  }

  allNotesOff(): void {
    for (const voice of this.voices.values()) {
      voice.descriptor.released = true
      voice.release(180)
    }
    this.voices.clear()
  }

  setVolume(volume: number): void {
    this.volume = Math.min(100, Math.max(0, Math.round(volume)))
    this.masterGain.gain.setTargetAtTime(getVolumeGain(this.volume), this.audioContext.currentTime, 0.02)
  }

  get status(): PianoSamplerStatus {
    const contextState = this.audioContext.state

    return {
      state: contextState === 'running' ? 'ready' : contextState === 'suspended' ? 'suspended' : 'error',
      samplePackLoaded: this.samplePackLoaded,
      sampleCount: this.anchors.length,
      activeVoices: this.voices.size,
      message: this.samplePackLoaded
        ? `采样包已加载（${this.anchors.length} 个锚点）`
        : '未安装采样包，使用内置合成音色'
    }
  }

  async resume(): Promise<boolean> {
    try {
      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume()
      }
      return this.audioContext.state === 'running'
    } catch {
      return false
    }
  }

  decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.audioContext.decodeAudioData(arrayBuffer)
  }

  dispose(): void {
    for (const voice of this.voices.values()) {
      voice.stopImmediate()
    }
    this.voices.clear()
    this.buffers.clear()
    this.anchors = []
    this.samplePackLoaded = false
    try {
      this.masterGain.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  private createSampleVoice(
    descriptor: VoiceDescriptor,
    selected: SelectedSample,
    velocity: number
  ): SamplerVoice | null {
    const buffer = this.buffers.get(selected.anchor.sample)
    if (!buffer) return null

    const now = this.audioContext.currentTime
    const source = this.audioContext.createBufferSource()
    const gain = this.audioContext.createGain()
    const velocityCurve = 0.25 + getVelocityGain(velocity) * 0.75
    const peakGain = 0.9 * velocityCurve
    const attackEnd = now + 0.004
    const decayEnd = attackEnd + 0.5

    source.buffer = buffer
    source.playbackRate.setValueAtTime(selected.playbackRate, now)

    if (selected.anchor.loopMode === 'continuous' && buffer.duration > 0) {
      source.loop = true
      if (typeof selected.anchor.loopStart === 'number') {
        source.loopStart = selected.anchor.loopStart / buffer.sampleRate
      }
      if (typeof selected.anchor.loopEnd === 'number') {
        source.loopEnd = selected.anchor.loopEnd / buffer.sampleRate
      }
    }

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.32), decayEnd)
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 6)

    source.connect(gain)
    gain.connect(this.masterGain)
    source.start(now)

    const disconnectNodes = (): void => {
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        // Already disconnected.
      }
    }

    return {
      descriptor,
      sources: [source],
      cleanupNodes: [gain],
      release: (releaseMs) => {
        const releaseNow = this.audioContext.currentTime
        const releaseEnd = releaseNow + releaseMs / 1000
        gain.gain.cancelScheduledValues(releaseNow)
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), releaseNow)
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)
        try {
          source.stop(releaseEnd + 0.05)
        } catch {
          // Already stopped.
        }
        const timeout = window.setTimeout(disconnectNodes, releaseMs + 80)
        window.setTimeout(() => window.clearTimeout(timeout), releaseMs + 200)
      },
      stopImmediate: () => {
        try {
          source.stop()
        } catch {
          // Already stopped.
        }
        disconnectNodes()
      }
    }
  }
}
