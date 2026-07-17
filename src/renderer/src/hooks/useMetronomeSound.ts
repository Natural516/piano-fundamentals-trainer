import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseMetronomeResult } from './useMetronome'

type MetronomeSoundStatus = 'idle' | 'ready' | 'unsupported' | 'error'

export interface UseMetronomeSoundResult {
  enabled: boolean
  volume: number
  status: MetronomeSoundStatus
  setEnabled: (enabled: boolean) => Promise<void>
  setVolume: (volume: number) => void
  prepare: () => Promise<void>
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
  return normalizedVolume ** 1.35
}

export function useMetronomeSound(metronome: UseMetronomeResult): UseMetronomeSoundResult {
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastBeatIndexRef = useRef(-1)
  const lastElapsedMsRef = useRef(0)
  const volumeRef = useRef(70)
  const [enabled, setEnabledState] = useState(true)
  const [volume, setVolumeState] = useState(70)
  const [status, setStatus] = useState<MetronomeSoundStatus>('idle')

  const ensureAudioContext = useCallback(async () => {
    const AudioContextConstructor = getAudioContextConstructor()

    if (!AudioContextConstructor) {
      setStatus('unsupported')
      return null
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor()
    }

    try {
      if (audioContextRef.current.state !== 'running') {
        await audioContextRef.current.resume()
      }

      setStatus(audioContextRef.current.state === 'running' ? 'ready' : 'idle')
      return audioContextRef.current
    } catch {
      setStatus('error')
      return null
    }
  }, [])

  const playClick = useCallback(
    async (isStrongBeat: boolean) => {
      if (!enabled) {
        return
      }

      const audioContext = await ensureAudioContext()

      if (!audioContext || audioContext.state !== 'running') {
        return
      }

      const now = audioContext.currentTime
      const duration = isStrongBeat ? 0.07 : 0.055
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const filter = audioContext.createBiquadFilter()
      const baseGain = getVolumeGain(volumeRef.current)
      const peakGain = baseGain * (isStrongBeat ? 0.34 : 0.22)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(isStrongBeat ? 1200 : 820, now)

      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(isStrongBeat ? 1500 : 950, now)
      filter.Q.setValueAtTime(1.2, now)

      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(now)
      oscillator.stop(now + duration + 0.012)

      oscillator.onended = () => {
        oscillator.disconnect()
        filter.disconnect()
        gain.disconnect()
      }
    },
    [enabled, ensureAudioContext]
  )

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      setEnabledState(nextEnabled)

      if (nextEnabled) {
        await ensureAudioContext()
      }
    },
    [ensureAudioContext]
  )

  const setVolume = useCallback((nextVolume: number) => {
    const clampedVolume = Math.min(100, Math.max(0, Math.round(nextVolume)))
    volumeRef.current = clampedVolume
    setVolumeState(clampedVolume)
  }, [])

  const prepare = useCallback(async () => {
    if (enabled) {
      await ensureAudioContext()
    }
  }, [enabled, ensureAudioContext])

  useEffect(() => {
    if (metronome.status !== 'running') {
      lastBeatIndexRef.current = -1
      lastElapsedMsRef.current = metronome.elapsedMs
      return
    }

    if (metronome.elapsedMs + 5 < lastElapsedMsRef.current) {
      lastBeatIndexRef.current = -1
    }

    lastElapsedMsRef.current = metronome.elapsedMs

    const beatIndex = Math.floor(metronome.elapsedMs / metronome.beatDurationMs)

    if (beatIndex < 0 || beatIndex === lastBeatIndexRef.current) {
      return
    }

    lastBeatIndexRef.current = beatIndex
    void playClick(beatIndex % metronome.beatsPerMeasure === 0)
  }, [
    metronome.beatDurationMs,
    metronome.beatsPerMeasure,
    metronome.elapsedMs,
    metronome.status,
    playClick
  ])

  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(() => undefined)
    }
  }, [])

  return {
    enabled,
    volume,
    status,
    setEnabled,
    setVolume,
    prepare
  }
}
