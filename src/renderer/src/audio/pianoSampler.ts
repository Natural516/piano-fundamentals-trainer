import { getVelocityGain, selectSampleAndRate } from './samplePackLoader'
import type { PianoSamplerStatus, SampleAnchor, SelectedSample } from './pianoAudioTypes'
import {
  pickVoiceToSteal,
  pedalAllNotesOff,
  pedalKeyDown,
  pedalKeyUp,
  pedalPedalUp,
  type VoiceDescriptor
} from './voicePolicy'

interface SamplerVoice {
  descriptor: VoiceDescriptor
  release: (releaseMs: number) => void
  stopImmediate: () => void
}

const DEFAULT_MAX_POLYPHONY = 64
const NOTE_RELEASE_MS = 1_000
const PEDAL_RELEASE_MS = 1_100
const ALL_NOTES_RELEASE_MS = 120

export interface PianoSamplerOptions {
  maxPolyphony?: number
  volume?: number
}

function getVolumeGain(volume: number): number {
  const normalized = Math.min(1, Math.max(0, volume / 100))
  return normalized ** 1.65
}

function getDecibelGain(decibels: number | undefined): number {
  return typeof decibels === 'number' ? 10 ** (decibels / 20) : 1
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '未知采样读取错误'
}

/**
 * Web Audio sample-only piano voice engine.
 *
 * Sample selection follows the migrated Salamander/Yamaha C5 anchor map.
 * Every key press owns a distinct voice ID, so repeated notes and chords do
 * not overwrite one another. CC64 only delays release; it never becomes a
 * training fact source. Missing assets remain an explicit error and never
 * fall back to a synthesized instrument.
 */
export class PianoSampler {
  private readonly audioContext: AudioContext
  private readonly masterGain: GainNode
  private readonly maxPolyphony: number
  private voices = new Map<number, SamplerVoice>()
  private anchors: SampleAnchor[] = []
  private buffers = new Map<string, AudioBuffer>()
  private samplePackLoaded = false
  private loadError: string | null = null
  private nextVoiceId = 1
  private volume = 70
  private pedalDown = false

  constructor(audioContext: AudioContext, options: PianoSamplerOptions = {}) {
    this.audioContext = audioContext
    this.maxPolyphony = options.maxPolyphony ?? DEFAULT_MAX_POLYPHONY
    this.volume = options.volume ?? 70
    this.masterGain = audioContext.createGain()
    this.masterGain.gain.setValueAtTime(getVolumeGain(this.volume), audioContext.currentTime)
    this.masterGain.connect(audioContext.destination)
  }

  async loadSamplePack(
    anchors: SampleAnchor[],
    loadBuffer: (sample: string) => Promise<AudioBuffer>
  ): Promise<number> {
    this.panic()
    this.anchors = []
    this.buffers.clear()
    this.samplePackLoaded = false
    this.loadError = null

    const uniqueSamples = [...new Set(anchors.map((anchor) => anchor.sample).filter(Boolean))]
    if (anchors.length === 0 || uniqueSamples.length === 0) {
      this.loadError = '采样清单为空'
      throw new Error(this.loadError)
    }

    try {
      const loadedBuffers = await Promise.all(uniqueSamples.map(async (sample) => ({
        sample,
        buffer: await loadBuffer(sample)
      })))
      for (const { sample, buffer } of loadedBuffers) this.buffers.set(sample, buffer)
      this.anchors = [...anchors]
      this.samplePackLoaded = true
      return loadedBuffers.length
    } catch (error) {
      this.anchors = []
      this.buffers.clear()
      this.loadError = getErrorMessage(error)
      throw new Error(this.loadError)
    }
  }

  noteOn(midiNumber: number, velocity: number): boolean {
    if (!this.samplePackLoaded || velocity <= 0) {
      if (velocity <= 0) this.noteOff(midiNumber)
      return false
    }

    const selected = selectSampleAndRate(this.anchors, midiNumber)
    if (!selected || !this.buffers.has(selected.anchor.sample)) {
      this.loadError = `缺少音符 ${midiNumber} 对应的内置钢琴采样`
      return false
    }

    const stealTarget = pickVoiceToSteal(
      [...this.voices.values()].map((voice) => voice.descriptor),
      this.maxPolyphony
    )
    if (stealTarget) {
      const voiceToSteal = this.voices.get(stealTarget.id)
      voiceToSteal?.stopImmediate()
      this.voices.delete(stealTarget.id)
    }

    const descriptor: VoiceDescriptor = {
      id: this.nextVoiceId++,
      midiNumber,
      ...pedalKeyDown({ physicalKeyDown: false, sustainedByPedal: false, released: false }),
      startedAt: this.audioContext.currentTime
    }
    const voice = this.createSampleVoice(descriptor, selected, velocity)
    if (!voice) return false
    this.voices.set(descriptor.id, voice)
    return true
  }

  noteOff(midiNumber: number): void {
    const matchingVoices = [...this.voices.values()]
      .filter((candidate) => (
        candidate.descriptor.midiNumber === midiNumber
        && candidate.descriptor.physicalKeyDown
        && !candidate.descriptor.released
      ))
    for (const voice of matchingVoices) {
      const next = pedalKeyUp(voice.descriptor, this.pedalDown)
      voice.descriptor = { ...voice.descriptor, ...next }
      if (next.released) voice.release(NOTE_RELEASE_MS)
    }
  }

  setSustain(down: boolean): void {
    if (this.pedalDown === down) return
    this.pedalDown = down
    if (down) return

    for (const voice of [...this.voices.values()]) {
      const next = pedalPedalUp(voice.descriptor)
      voice.descriptor = { ...voice.descriptor, ...next }
      if (next.released) voice.release(PEDAL_RELEASE_MS)
    }
  }

  allNotesOff(): void {
    this.pedalDown = false
    for (const voice of [...this.voices.values()]) {
      const next = pedalAllNotesOff(voice.descriptor)
      voice.descriptor = { ...voice.descriptor, ...next }
      voice.release(ALL_NOTES_RELEASE_MS)
    }
  }

  panic(): void {
    this.pedalDown = false
    for (const voice of [...this.voices.values()]) voice.stopImmediate()
    this.voices.clear()
  }

  get isPedalDown(): boolean {
    return this.pedalDown
  }

  setVolume(volume: number): void {
    this.volume = Math.min(100, Math.max(0, Math.round(volume)))
    this.masterGain.gain.setTargetAtTime(getVolumeGain(this.volume), this.audioContext.currentTime, 0.02)
  }

  get status(): PianoSamplerStatus {
    if (this.loadError) {
      return {
        state: 'error',
        samplePackLoaded: false,
        sampleCount: 0,
        activeVoices: this.voices.size,
        message: `内置钢琴采样不可用：${this.loadError}`
      }
    }

    const contextState = this.audioContext.state
    return {
      state: this.samplePackLoaded
        ? (contextState === 'running' ? 'ready' : 'suspended')
        : 'idle',
      samplePackLoaded: this.samplePackLoaded,
      sampleCount: this.buffers.size,
      activeVoices: this.voices.size,
      message: this.samplePackLoaded ? '内置钢琴已就绪' : '内置钢琴采样尚未加载'
    }
  }

  async resume(): Promise<boolean> {
    try {
      if (this.audioContext.state !== 'running') await this.audioContext.resume()
      return this.audioContext.state === 'running'
    } catch {
      return false
    }
  }

  decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.audioContext.decodeAudioData(arrayBuffer)
  }

  dispose(): void {
    this.panic()
    this.buffers.clear()
    this.anchors = []
    this.samplePackLoaded = false
    this.loadError = null
    try {
      this.masterGain.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  private finishVoice(voiceId: number): void {
    this.voices.delete(voiceId)
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
    const peakGain = getVelocityGain(velocity) * getDecibelGain(selected.anchor.volume)
    let disconnected = false
    let releaseStarted = false

    source.buffer = buffer
    source.playbackRate.setValueAtTime(selected.playbackRate, now)
    source.connect(gain)
    gain.connect(this.masterGain)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain), now + 0.003)

    const disconnect = (): void => {
      if (disconnected) return
      disconnected = true
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        // Already disconnected.
      }
      this.finishVoice(descriptor.id)
    }

    source.onended = disconnect
    source.start(now)

    return {
      descriptor,
      release: (releaseMs) => {
        if (releaseStarted) return
        releaseStarted = true
        const releaseNow = this.audioContext.currentTime
        const releaseEnd = releaseNow + releaseMs / 1000
        gain.gain.cancelScheduledValues(releaseNow)
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), releaseNow)
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)
        try {
          source.stop(releaseEnd + 0.03)
        } catch {
          disconnect()
        }
      },
      stopImmediate: () => {
        try {
          source.stop()
        } catch {
          // Already stopped.
        }
        disconnect()
      }
    }
  }
}
