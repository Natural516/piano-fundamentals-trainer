import { useCallback, useEffect, useRef, useState } from 'react'
import type { PianoAudioMode, PianoSamplerStatus } from '../audio/pianoAudioTypes'
import {
  readAudioMode,
  readPianoVolume,
  writeAudioMode,
  writePianoVolume
} from '../audio/audioModeSettings'
import { loadBundledPianoSamplePack } from '../audio/bundledPianoSamplePack'
import { getInternalPianoMidiAction } from '../audio/pianoMidiRouter'
import { PianoSampler } from '../audio/pianoSampler'
import { useMidiEventSubscription } from './useMidiEvents'

export interface UsePianoAudioResult {
  mode: PianoAudioMode
  setMode: (mode: PianoAudioMode) => void
  pianoVolume: number
  setPianoVolume: (volume: number) => void
  samplerStatus: PianoSamplerStatus
  enableAudio: () => Promise<void>
  testPlayChord: () => Promise<void>
  playNote: (midiNumber: number, velocity: number) => void
  stopNote: (midiNumber: number) => void
  setSustain: (down: boolean) => void
  stopAllNotes: () => void
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const audioWindow = window as Window & {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '无法读取内置钢琴采样'
}

export function usePianoAudio(): UsePianoAudioResult {
  const [mode, setModeState] = useState<PianoAudioMode>(() => readAudioMode())
  const [pianoVolume, setPianoVolumeState] = useState(() => readPianoVolume())
  const [samplerStatus, setSamplerStatus] = useState<PianoSamplerStatus>({
    state: 'idle',
    samplePackLoaded: false,
    sampleCount: 0,
    activeVoices: 0,
    message: mode === 'builtin' ? '正在准备内置钢琴' : '内置发声已关闭'
  })
  const audioContextRef = useRef<AudioContext | null>(null)
  const samplerRef = useRef<PianoSampler | null>(null)
  const samplerPromiseRef = useRef<Promise<PianoSampler | null> | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const volumeRef = useRef(pianoVolume)
  volumeRef.current = pianoVolume
  const noteGenerationRef = useRef(new Map<number, number>())
  const heldNotesRef = useRef(new Set<number>())
  const sustainDownRef = useRef(false)

  const ensureSampler = useCallback(async (): Promise<PianoSampler | null> => {
    if (samplerRef.current) return samplerRef.current
    if (samplerPromiseRef.current) return samplerPromiseRef.current

    const task = (async (): Promise<PianoSampler | null> => {
      const AudioContextConstructor = getAudioContextConstructor()
      if (!AudioContextConstructor) {
        setSamplerStatus({
          state: 'unsupported',
          samplePackLoaded: false,
          sampleCount: 0,
          activeVoices: 0,
          message: '当前环境不支持内置钢琴发声'
        })
        return null
      }

      const audioContext = new AudioContextConstructor()
      const sampler = new PianoSampler(audioContext, { volume: volumeRef.current })
      audioContextRef.current = audioContext

      try {
        await loadBundledPianoSamplePack(sampler, window.pianoApp?.pianoSamples)
        sampler.setSustain(sustainDownRef.current)
        samplerRef.current = sampler
        setSamplerStatus(sampler.status)
        return sampler
      } catch (error) {
        sampler.dispose()
        await audioContext.close().catch(() => undefined)
        audioContextRef.current = null
        setSamplerStatus({
          state: 'error',
          samplePackLoaded: false,
          sampleCount: 0,
          activeVoices: 0,
          message: `内置钢琴采样不可用：${getErrorMessage(error)}`
        })
        return null
      }
    })()

    samplerPromiseRef.current = task
    const sampler = await task
    if (samplerPromiseRef.current === task) samplerPromiseRef.current = null
    return sampler
  }, [])

  const enableAudio = useCallback(async (): Promise<void> => {
    if (modeRef.current !== 'builtin') return
    const sampler = await ensureSampler()
    if (!sampler) return
    await sampler.resume()
    setSamplerStatus(sampler.status)
  }, [ensureSampler])

  const clearPendingInput = useCallback((): void => {
    heldNotesRef.current.clear()
    sustainDownRef.current = false
    for (const [midiNumber, generation] of noteGenerationRef.current) {
      noteGenerationRef.current.set(midiNumber, generation + 1)
    }
  }, [])

  const stopAllNotes = useCallback((): void => {
    clearPendingInput()
    samplerRef.current?.panic()
    setSamplerStatus((current) => ({ ...current, activeVoices: 0 }))
  }, [clearPendingInput])

  const testPlayChord = useCallback(async (): Promise<void> => {
    if (modeRef.current !== 'builtin') return
    await enableAudio()
    const sampler = samplerRef.current
    if (!sampler || !sampler.status.samplePackLoaded) return

    const notes = [60, 64, 67]
    for (const midiNumber of notes) sampler.noteOn(midiNumber, 96)
    setSamplerStatus(sampler.status)
    window.setTimeout(() => {
      for (const midiNumber of notes) sampler.noteOff(midiNumber)
      setSamplerStatus(sampler.status)
    }, 700)
  }, [enableAudio])

  const playNote = useCallback((midiNumber: number, velocity: number): void => {
    if (modeRef.current !== 'builtin') return
    samplerRef.current?.noteOn(midiNumber, velocity)
  }, [])

  const stopNote = useCallback((midiNumber: number): void => {
    samplerRef.current?.noteOff(midiNumber)
  }, [])

  const setSustain = useCallback((down: boolean): void => {
    if (modeRef.current !== 'builtin') return
    sustainDownRef.current = down
    samplerRef.current?.setSustain(down)
  }, [])

  const setMode = useCallback((nextMode: PianoAudioMode): void => {
    modeRef.current = nextMode
    setModeState(nextMode)
    writeAudioMode(nextMode)
    if (nextMode === 'builtin') {
      setSamplerStatus((current) => samplerRef.current?.status ?? {
        ...current,
        state: 'idle',
        message: '正在准备内置钢琴'
      })
      void ensureSampler()
      return
    }

    stopAllNotes()
    setSamplerStatus((current) => ({
      ...current,
      state: 'idle',
      activeVoices: 0,
      message: '内置发声已关闭'
    }))
  }, [ensureSampler, stopAllNotes])

  const setPianoVolume = useCallback((nextVolume: number): void => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextVolume)))
    volumeRef.current = clamped
    setPianoVolumeState(clamped)
    writePianoVolume(clamped)
    samplerRef.current?.setVolume(clamped)
  }, [])

  useMidiEventSubscription((event) => {
    const action = getInternalPianoMidiAction(event, modeRef.current === 'builtin')
    if (!action) return

    if (action.type === 'noteOn') {
      const generation = (noteGenerationRef.current.get(action.midiNumber) ?? 0) + 1
      noteGenerationRef.current.set(action.midiNumber, generation)
      heldNotesRef.current.add(action.midiNumber)
      void ensureSampler().then(async (sampler) => {
        if (!sampler) return
        const resumed = await sampler.resume()
        if (
          !resumed
          || modeRef.current !== 'builtin'
          || noteGenerationRef.current.get(action.midiNumber) !== generation
          || !heldNotesRef.current.has(action.midiNumber)
        ) return
        sampler.setSustain(sustainDownRef.current)
        sampler.noteOn(action.midiNumber, action.velocity)
        setSamplerStatus(sampler.status)
      })
      return
    }

    if (action.type === 'noteOff') {
      heldNotesRef.current.delete(action.midiNumber)
      noteGenerationRef.current.set(
        action.midiNumber,
        (noteGenerationRef.current.get(action.midiNumber) ?? 0) + 1
      )
      samplerRef.current?.noteOff(action.midiNumber)
      return
    }

    if (action.type === 'sustain') {
      sustainDownRef.current = action.down
      samplerRef.current?.setSustain(action.down)
      return
    }

    stopAllNotes()
  })

  useEffect(() => {
    if (mode === 'builtin') void ensureSampler()
  }, [ensureSampler, mode])

  useEffect(() => {
    const resumeOnGesture = (): void => {
      if (modeRef.current === 'builtin') void enableAudio()
    }
    const safetyStop = (): void => stopAllNotes()
    const handleVisibilityChange = (): void => {
      if (document.hidden) safetyStop()
    }

    window.addEventListener('pointerdown', resumeOnGesture)
    window.addEventListener('keydown', resumeOnGesture)
    window.addEventListener('blur', safetyStop)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture)
      window.removeEventListener('keydown', resumeOnGesture)
      window.removeEventListener('blur', safetyStop)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enableAudio, stopAllNotes])

  useEffect(() => () => {
    clearPendingInput()
    samplerRef.current?.dispose()
    samplerRef.current = null
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
  }, [clearPendingInput])

  return {
    mode,
    setMode,
    pianoVolume,
    setPianoVolume,
    samplerStatus,
    enableAudio,
    testPlayChord,
    playNote,
    stopNote,
    setSustain,
    stopAllNotes
  }
}
