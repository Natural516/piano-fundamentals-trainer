import { useCallback, useEffect, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import { midiNumberToFrequency, normalizeMidiVelocity } from '../utils/audioNotes'

type AudioStatus = 'idle' | 'ready' | 'suspended' | 'unsupported' | 'error'

interface PianoVoice {
  sources: Array<OscillatorNode | AudioBufferSourceNode>
  filter: BiquadFilterNode
  toneGain: GainNode
  hammerGain: GainNode
  cleanupNodes: AudioNode[]
}

function disconnectVoice(voice: PianoVoice): void {
  for (const source of voice.sources) {
    try {
      source.disconnect()
    } catch {
      // A source may already be disconnected after its natural decay.
    }
  }

  for (const node of voice.cleanupNodes) {
    try {
      node.disconnect()
    } catch {
      // Disconnect is idempotent for most nodes, but guard older Chromium builds.
    }
  }
}

export interface UseAudioEngineResult {
  localMonitoringEnabled: boolean
  volume: number
  audioStatus: AudioStatus
  audioMessage: string
  setLocalMonitoringEnabled: (enabled: boolean) => Promise<void>
  setVolume: (volume: number) => void
  stopAllNotes: () => void
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  const audioWindow = window as Window & {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }

  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null
}

function getVolumeGain(volume: number): number {
  const normalizedVolume = Math.min(1, Math.max(0, volume / 100))
  return normalizedVolume ** 1.65
}

function createHammerNoise(audioContext: AudioContext, duration: number): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * duration))
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / frameCount
    const envelope = (1 - progress) ** 3
    data[index] = (Math.random() * 2 - 1) * envelope
  }

  return buffer
}

function createPianoVoice(audioContext: AudioContext, midiNumber: number, velocity: number, output: AudioNode): PianoVoice {
  const now = audioContext.currentTime
  const baseFrequency = midiNumberToFrequency(midiNumber)
  const normalizedVelocity = Math.max(0.05, normalizeMidiVelocity(velocity))
  const velocityCurve = 0.22 + normalizedVelocity * 0.78
  const toneGain = audioContext.createGain()
  const filter = audioContext.createBiquadFilter()
  const hammerGain = audioContext.createGain()
  const hammerFilter = audioContext.createBiquadFilter()
  const hammerNoise = audioContext.createBufferSource()

  const attackEnd = now + 0.008
  const decayEnd = attackEnd + 0.34
  const bodyEnd = now + 2.8
  const naturalEnd = now + 5.2
  const peakGain = 0.82 * velocityCurve
  const sustainGain = 0.18 * velocityCurve

  toneGain.gain.setValueAtTime(0.0001, now)
  toneGain.gain.linearRampToValueAtTime(peakGain, attackEnd)
  toneGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainGain), decayEnd)
  toneGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainGain * 0.32), bodyEnd)
  toneGain.gain.exponentialRampToValueAtTime(0.0007, naturalEnd)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(7800, Math.max(2600, baseFrequency * 10)), now)
  filter.frequency.exponentialRampToValueAtTime(Math.min(4200, Math.max(1200, baseFrequency * 4.2)), now + 0.18)
  filter.frequency.exponentialRampToValueAtTime(Math.min(2600, Math.max(850, baseFrequency * 2.8)), now + 1.25)
  filter.Q.setValueAtTime(0.55, now)

  filter.connect(toneGain)
  toneGain.connect(output)

  const oscillatorSettings = [
    { type: 'triangle' as OscillatorType, frequencyMultiplier: 1, detune: -2, gain: 0.74 },
    { type: 'sine' as OscillatorType, frequencyMultiplier: 2, detune: 4, gain: 0.2 },
    { type: 'sine' as OscillatorType, frequencyMultiplier: 3, detune: -5, gain: 0.075 },
    { type: 'triangle' as OscillatorType, frequencyMultiplier: 4, detune: 2, gain: 0.025 }
  ]

  const cleanupNodes: AudioNode[] = [filter, toneGain, hammerFilter, hammerGain]
  const oscillators = oscillatorSettings.map((setting) => {
    const oscillator = audioContext.createOscillator()
    const partialGain = audioContext.createGain()

    oscillator.type = setting.type
    oscillator.frequency.setValueAtTime(baseFrequency * setting.frequencyMultiplier, now)
    oscillator.detune.setValueAtTime(setting.detune, now)
    partialGain.gain.setValueAtTime(setting.gain, now)

    oscillator.connect(partialGain)
    partialGain.connect(filter)
    oscillator.start(now)
    oscillator.stop(naturalEnd + 0.08)
    cleanupNodes.push(partialGain)

    return oscillator
  })

  hammerNoise.buffer = createHammerNoise(audioContext, 0.035)
  hammerFilter.type = 'bandpass'
  hammerFilter.frequency.setValueAtTime(Math.min(5200, Math.max(1400, baseFrequency * 11)), now)
  hammerFilter.Q.setValueAtTime(1.1, now)
  hammerGain.gain.setValueAtTime(0.16 * velocityCurve, now)
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
  hammerNoise.connect(hammerFilter)
  hammerFilter.connect(hammerGain)
  hammerGain.connect(output)
  hammerNoise.start(now)
  hammerNoise.stop(now + 0.04)

  return {
    sources: [...oscillators, hammerNoise],
    filter,
    toneGain,
    hammerGain,
    cleanupNodes
  }
}
function releaseVoice(
  audioContext: AudioContext,
  voice: PianoVoice,
  scheduleCleanup: (callback: () => void, delayMs: number) => void
): void {
  const now = audioContext.currentTime
  const releaseEnd = now + 0.38

  voice.toneGain.gain.cancelScheduledValues(now)
  voice.toneGain.gain.setValueAtTime(Math.max(0.0001, voice.toneGain.gain.value), now)
  voice.toneGain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)

  voice.hammerGain.gain.cancelScheduledValues(now)
  voice.hammerGain.gain.setValueAtTime(0.0001, now)

  for (const source of voice.sources) {
    try {
      source.stop(releaseEnd + 0.04)
    } catch {
      // Some short hammer sources may have already stopped before noteOff.
    }
  }

  scheduleCleanup(() => disconnectVoice(voice), 560)
}


export function useAudioEngine(latestEvent: MidiEventRecord | null): UseAudioEngineResult {
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Map<number, PianoVoice>>(new Map())
  const cleanupTimersRef = useRef<Set<number>>(new Set())
  const lastEventKeyRef = useRef('')
  const [localMonitoringEnabled, setLocalMonitoringEnabledState] = useState(false)
  const [volume, setVolumeState] = useState(70)
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle')
  const [audioMessage, setAudioMessage] = useState('')

  const scheduleCleanup = useCallback((callback: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      cleanupTimersRef.current.delete(timerId)
      callback()
    }, delayMs)

    cleanupTimersRef.current.add(timerId)
  }, [])

  const ensureAudioContext = useCallback(async () => {
    const AudioContextConstructor = getAudioContextConstructor()

    if (!AudioContextConstructor) {
      setAudioStatus('unsupported')
      setAudioMessage('当前环境不支持 Web Audio API，无法启用本地监听。')
      return null
    }

    if (!audioContextRef.current) {
      const audioContext = new AudioContextConstructor()
      const masterGain = audioContext.createGain()
      const compressor = audioContext.createDynamicsCompressor()

      compressor.threshold.setValueAtTime(-18, audioContext.currentTime)
      compressor.knee.setValueAtTime(18, audioContext.currentTime)
      compressor.ratio.setValueAtTime(5, audioContext.currentTime)
      compressor.attack.setValueAtTime(0.004, audioContext.currentTime)
      compressor.release.setValueAtTime(0.18, audioContext.currentTime)

      masterGain.gain.setValueAtTime(getVolumeGain(volume), audioContext.currentTime)
      masterGain.connect(compressor)
      compressor.connect(audioContext.destination)

      audioContextRef.current = audioContext
      masterGainRef.current = masterGain
    }

    try {
      if (audioContextRef.current.state !== 'running') {
        await audioContextRef.current.resume()
      }

      setAudioStatus(audioContextRef.current.state === 'running' ? 'ready' : 'suspended')
      setAudioMessage('')
      return audioContextRef.current
    } catch {
      setAudioStatus('error')
      setAudioMessage('音频上下文启动失败，请在页面内再次点击启用本地监听。')
      return null
    }
  }, [volume])

  const stopNote = useCallback((midiNumber: number) => {
    const audioContext = audioContextRef.current
    const voice = voicesRef.current.get(midiNumber)

    if (!audioContext || !voice) {
      return
    }

    releaseVoice(audioContext, voice, scheduleCleanup)
    voicesRef.current.delete(midiNumber)
  }, [scheduleCleanup])

  const playNote = useCallback(
    async (midiNumber: number, velocity: number) => {
      if (!localMonitoringEnabled) {
        return
      }

      const audioContext = await ensureAudioContext()
      const output = masterGainRef.current

      if (!audioContext || !output) {
        return
      }

      stopNote(midiNumber)
      voicesRef.current.set(midiNumber, createPianoVoice(audioContext, midiNumber, velocity, output))
    },
    [ensureAudioContext, localMonitoringEnabled, stopNote]
  )

  const stopAllNotes = useCallback(() => {
    const audioContext = audioContextRef.current

    if (!audioContext) {
      voicesRef.current.clear()
      return
    }

    for (const voice of voicesRef.current.values()) {
      releaseVoice(audioContext, voice, scheduleCleanup)
    }

    voicesRef.current.clear()
  }, [scheduleCleanup])

  const setLocalMonitoringEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        setLocalMonitoringEnabledState(false)
        stopAllNotes()
        setAudioStatus(audioContextRef.current?.state === 'running' ? 'ready' : 'idle')
        return
      }

      const audioContext = await ensureAudioContext()

      if (!audioContext) {
        setLocalMonitoringEnabledState(false)
        return
      }

      setLocalMonitoringEnabledState(true)
    },
    [ensureAudioContext, stopAllNotes]
  )

  const setVolume = useCallback((nextVolume: number) => {
    const clampedVolume = Math.min(100, Math.max(0, Math.round(nextVolume)))
    setVolumeState(clampedVolume)

    const audioContext = audioContextRef.current
    const masterGain = masterGainRef.current

    if (audioContext && masterGain) {
      masterGain.gain.setTargetAtTime(getVolumeGain(clampedVolume), audioContext.currentTime, 0.02)
    }
  }, [])

  useEffect(() => {
    if (!latestEvent) {
      return
    }

    const eventKey = String(latestEvent.timestamp) + '-' + latestEvent.type + '-' + String(latestEvent.midiNumber) + '-' + String(latestEvent.velocity) + '-' + latestEvent.deviceName

    if (lastEventKeyRef.current === eventKey) {
      return
    }

    lastEventKeyRef.current = eventKey

    if (latestEvent.type === 'noteOn' && typeof latestEvent.midiNumber === 'number') {
      void playNote(latestEvent.midiNumber, latestEvent.velocity ?? 0)
    } else if (latestEvent.type === 'noteOff' && typeof latestEvent.midiNumber === 'number') {
      stopNote(latestEvent.midiNumber)
    }
  }, [latestEvent, playNote, stopNote])

  useEffect(() => {
    if (!localMonitoringEnabled) {
      stopAllNotes()
    }
  }, [localMonitoringEnabled, stopAllNotes])

  useEffect(() => {
    return () => {
      for (const timerId of cleanupTimersRef.current) {
        window.clearTimeout(timerId)
      }
      cleanupTimersRef.current.clear()

      for (const voice of voicesRef.current.values()) {
        for (const source of voice.sources) {
          try {
            source.stop()
          } catch {
            // The source may already have reached its scheduled natural end.
          }
        }
        disconnectVoice(voice)
      }
      voicesRef.current.clear()
      audioContextRef.current?.close().catch(() => undefined)
    }
  }, [])

  return {
    localMonitoringEnabled,
    volume,
    audioStatus,
    audioMessage,
    setLocalMonitoringEnabled,
    setVolume,
    stopAllNotes
  }
}
