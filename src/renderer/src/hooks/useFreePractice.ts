import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendRecordedEvent,
  createRecordingSession,
  getPlaybackDurationMs,
  PlaybackCursorCore,
  summarizeRecording,
  type RecordingSession,
  type RecordingStats
} from '../midi/midiRecording'
import { useMidiEventSubscription } from './useMidiEvents'

export type FreePracticeStatus = 'idle' | 'recording' | 'paused' | 'finished'

export interface FreePracticeAudioAdapter {
  playNote: (midiNumber: number, velocity: number) => void
  stopNote: (midiNumber: number) => void
  setSustain: (down: boolean) => void
}

export interface UseFreePracticeResult {
  status: FreePracticeStatus
  isRecording: boolean
  isPaused: boolean
  session: RecordingSession | null
  stats: RecordingStats | null
  start: () => void
  pause: () => void
  resume: () => void
  finish: () => void
  reset: () => void
  playback: {
    isPlaying: boolean
    speed: number
    setSpeed: (speed: number) => void
    durationMs: number
    positionMs: number
    play: () => void
    pause: () => void
    replay: () => void
    seek: (positionMs: number) => void
  }
  notes: string
  setNotes: (text: string) => void
}

export function useFreePractice(audio: FreePracticeAudioAdapter): UseFreePracticeResult {
  const [status, setStatus] = useState<FreePracticeStatus>('idle')
  const [stats, setStats] = useState<RecordingStats | null>(null)
  const [notes, setNotesState] = useState('')
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)

  const statusRef = useRef(status)
  statusRef.current = status
  const sessionRef = useRef<RecordingSession | null>(null)
  const playbackCursorRef = useRef<PlaybackCursorCore | null>(null)
  const playbackTimerRef = useRef<number | null>(null)
  const playbackBaseTimeRef = useRef(0)
  const playbackBasePositionRef = useRef(0)
  const speedRef = useRef(1)
  speedRef.current = playbackSpeed
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying

  const start = useCallback(() => {
    sessionRef.current = createRecordingSession(Date.now())
    setStats(null)
    setNotesState('')
    setPositionMs(0)
    setDurationMs(0)
    setStatus('recording')
  }, [])

  const pause = useCallback(() => {
    if (statusRef.current !== 'recording') return
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    setStatus('recording')
  }, [])

  const finish = useCallback(() => {
    const session = sessionRef.current
    if (!session || statusRef.current === 'idle' || statusRef.current === 'finished') return

    const endedAt = Date.now()
    setStats(summarizeRecording(session, endedAt))
    setDurationMs(getPlaybackDurationMs(session.events))
    playbackCursorRef.current = new PlaybackCursorCore(session.events)
    setPositionMs(0)
    setStatus('finished')
  }, [])

  const reset = useCallback(() => {
    sessionRef.current = null
    playbackCursorRef.current = null
    setStats(null)
    setNotesState('')
    setPositionMs(0)
    setDurationMs(0)
    setStatus('idle')
  }, [])

  useMidiEventSubscription((event) => {
    if (statusRef.current !== 'recording' || !sessionRef.current) return
    appendRecordedEvent(sessionRef.current, event)
  })

  const stopPlaybackLoop = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const pausePlayback = useCallback(() => {
    stopPlaybackLoop()
  }, [stopPlaybackLoop])

  const seek = useCallback((targetMs: number) => {
    const cursor = playbackCursorRef.current
    if (!cursor) return

    const clamped = Math.min(cursor.durationMs, Math.max(0, targetMs))
    cursor.seek(clamped)
    setPositionMs(clamped)

    if (isPlayingRef.current) {
      playbackBaseTimeRef.current = performance.now()
      playbackBasePositionRef.current = clamped
    }
  }, [])

  const play = useCallback(() => {
    const cursor = playbackCursorRef.current
    if (!cursor) return

    if (cursor.isFinished()) {
      cursor.seek(0)
      setPositionMs(0)
    }

    playbackBaseTimeRef.current = performance.now()
    playbackBasePositionRef.current = cursor.position
    setIsPlaying(true)

    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current)
    }

    playbackTimerRef.current = window.setInterval(() => {
      const cursorActive = playbackCursorRef.current
      if (!cursorActive) return

      const elapsedMs = performance.now() - playbackBaseTimeRef.current
      const targetPosition = playbackBasePositionRef.current + elapsedMs * speedRef.current
      const actions = cursorActive.advanceTo(targetPosition)

      for (const action of actions) {
        if (action.type === 'noteOn' && typeof action.midiNumber === 'number') {
          audio.playNote(action.midiNumber, action.velocity ?? 0)
        } else if (action.type === 'noteOff' && typeof action.midiNumber === 'number') {
          audio.stopNote(action.midiNumber)
        } else if (action.type === 'controlChange' && typeof action.sustainPedalDown === 'boolean') {
          audio.setSustain(action.sustainPedalDown)
        }
      }

      setPositionMs(cursorActive.position)

      if (cursorActive.isFinished()) {
        audio.setSustain(false)
        stopPlaybackLoop()
      }
    }, 40)
  }, [audio, stopPlaybackLoop])

  const replay = useCallback(() => {
    const cursor = playbackCursorRef.current
    if (!cursor) return
    cursor.seek(0)
    setPositionMs(0)
    play()
  }, [play])

  const setSpeed = useCallback((nextSpeed: number) => {
    const clamped = Math.min(4, Math.max(0.25, nextSpeed))
    const cursor = playbackCursorRef.current
    if (isPlayingRef.current && cursor) {
      playbackBaseTimeRef.current = performance.now()
      playbackBasePositionRef.current = cursor.position
    }
    setPlaybackSpeed(clamped)
  }, [])

  useEffect(() => {
    return () => {
      if (playbackTimerRef.current !== null) {
        window.clearInterval(playbackTimerRef.current)
      }
      audio.setSustain(false)
    }
  }, [audio])

  return {
    status,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    session: sessionRef.current,
    stats,
    start,
    pause,
    resume,
    finish,
    reset,
    playback: {
      isPlaying,
      speed: playbackSpeed,
      setSpeed,
      durationMs,
      positionMs,
      play,
      pause: pausePlayback,
      replay,
      seek
    },
    notes,
    setNotes: setNotesState
  }
}
