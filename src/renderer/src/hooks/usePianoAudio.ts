import { useCallback, useEffect, useRef, useState } from 'react'
import type { PianoAudioMode, PianoSamplerStatus } from '../audio/pianoAudioTypes'
import {
  readAudioMode,
  readPianoVolume,
  writeAudioMode,
  writePianoVolume
} from '../audio/audioModeSettings'
import { PianoSampler } from '../audio/pianoSampler'
import { parseSfz } from '../audio/samplePackLoader'
import { useMidiEventSubscription } from './useMidiEvents'

export const SAMPLE_PACK_BASE_URL = 'assets/samples/salamander'

export interface UsePianoAudioResult {
  mode: PianoAudioMode
  setMode: (mode: PianoAudioMode) => void
  pianoVolume: number
  setPianoVolume: (volume: number) => void
  samplerStatus: PianoSamplerStatus
  enableAudio: () => Promise<void>
  testPlayChord: () => Promise<void>
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

async function loadBundledSamplePack(sampler: PianoSampler): Promise<number> {
  try {
    const sfzResponse = await fetch(`${SAMPLE_PACK_BASE_URL}/SalamanderGrandPianoV2.sfz`)
    if (!sfzResponse.ok) {
      return 0
    }

    const sfzText = await sfzResponse.text()
    const anchors = parseSfz(sfzText)

    if (anchors.length === 0) {
      return 0
    }

    return sampler.loadSamplePack(anchors, async (sample) => {
      const response = await fetch(`${SAMPLE_PACK_BASE_URL}/${encodeURI(sample)}`)
      if (!response.ok) {
        throw new Error(`missing sample: ${sample}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return sampler.decodeAudioData(arrayBuffer)
    })
  } catch {
    return 0
  }
}

export function usePianoAudio(): UsePianoAudioResult {
  const [mode, setModeState] = useState<PianoAudioMode>(() => readAudioMode())
  const [pianoVolume, setPianoVolumeState] = useState(() => readPianoVolume())
  const [samplerStatus, setSamplerStatus] = useState<PianoSamplerStatus>({
    state: 'idle',
    samplePackLoaded: false,
    sampleCount: 0,
    activeVoices: 0,
    message: '音频未初始化'
  })
  const audioContextRef = useRef<AudioContext | null>(null)
  const samplerRef = useRef<PianoSampler | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const volumeRef = useRef(pianoVolume)
  volumeRef.current = pianoVolume
  const enabledRef = useRef(false)

  const ensureSampler = useCallback(async (): Promise<PianoSampler | null> => {
    if (samplerRef.current) {
      return samplerRef.current
    }

    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      setSamplerStatus({
        state: 'unsupported',
        samplePackLoaded: false,
        sampleCount: 0,
        activeVoices: 0,
        message: '当前环境不支持 Web Audio API'
      })
      return null
    }

    const audioContext = new AudioContextConstructor()
    const sampler = new PianoSampler(audioContext, { volume: volumeRef.current })
    audioContextRef.current = audioContext
    samplerRef.current = sampler
    const loadedCount = await loadBundledSamplePack(sampler)

    setSamplerStatus(sampler.status)
    void loadedCount
    return sampler
  }, [])

  const enableAudio = useCallback(async () => {
    const sampler = await ensureSampler()
    if (!sampler) return

    const resumed = await sampler.resume()
    enabledRef.current = resumed
    setSamplerStatus(sampler.status)
  }, [ensureSampler])

  const stopAllNotes = useCallback(() => {
    samplerRef.current?.allNotesOff()
    setSamplerStatus((current) => ({ ...current, activeVoices: 0 }))
  }, [])

  const testPlayChord = useCallback(async () => {
    await enableAudio()
    const sampler = samplerRef.current
    if (!sampler) return

    const notes = [60, 64, 67]
    for (const midiNumber of notes) {
      sampler.noteOn(midiNumber, 96)
    }
    setSamplerStatus(sampler.status)

    window.setTimeout(() => {
      for (const midiNumber of notes) {
        sampler.noteOff(midiNumber)
      }
      setSamplerStatus(sampler.status)
    }, 700)
  }, [enableAudio])

  const setMode = useCallback((nextMode: PianoAudioMode) => {
    setModeState(nextMode)
    writeAudioMode(nextMode)
    if (nextMode !== 'builtin') {
      stopAllNotes()
    }
  }, [stopAllNotes])

  const setPianoVolume = useCallback((nextVolume: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextVolume)))
    setPianoVolumeState(clamped)
    writePianoVolume(clamped)
    samplerRef.current?.setVolume(clamped)
  }, [])

  useMidiEventSubscription((event) => {
    if (modeRef.current !== 'builtin') {
      return
    }

    if (event.type === 'noteOn' && typeof event.midiNumber === 'number') {
      const midiNumber = event.midiNumber
      const velocity = event.velocity ?? 0
      void enableAudio().then(() => {
        samplerRef.current?.noteOn(midiNumber, velocity)
      })
    } else if (event.type === 'noteOff' && typeof event.midiNumber === 'number') {
      samplerRef.current?.noteOff(event.midiNumber)
    } else if (event.type === 'controlChange' && event.controllerNumber === 64) {
      samplerRef.current?.setSustain(Boolean(event.sustainPedalDown))
    }
  })

  useEffect(() => {
    const resumeOnGesture = (): void => {
      if (modeRef.current === 'builtin') {
        void enableAudio()
      }
    }

    window.addEventListener('pointerdown', resumeOnGesture)
    window.addEventListener('keydown', resumeOnGesture)
    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture)
      window.removeEventListener('keydown', resumeOnGesture)
    }
  }, [enableAudio])

  useEffect(() => {
    return () => {
      samplerRef.current?.dispose()
      samplerRef.current = null
      audioContextRef.current?.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }, [])

  return {
    mode,
    setMode,
    pianoVolume,
    setPianoVolume,
    samplerStatus,
    enableAudio,
    testPlayChord,
    stopAllNotes
  }
}
