import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendRecordedEvent,
  createRecordingSnapshotFact,
  createRecordingSession,
  getPlaybackDurationMs,
  PlaybackCursorCore,
  summarizeRecording,
  type RecordingSession,
  type RecordingStats
} from '../midi/midiRecording'
import { createFreePracticeRecordV2 } from '../records/freePracticeRecord'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import { practiceSessionRepository } from '../records/practiceSessionRepository'
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
  saveError: string
  start: () => boolean
  pause: () => boolean
  resume: () => boolean
  interruptDevice: () => boolean
  finish: () => boolean
  retrySave: () => boolean
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
  const [saveError, setSaveError] = useState('')

  const statusRef = useRef(status)
  statusRef.current = status
  const sessionRef = useRef<RecordingSession | null>(null)
  const notesRef = useRef('')
  const persistedSessionIdRef = useRef('')
  const finalRecordRef = useRef<ReturnType<typeof createFreePracticeRecordV2> | null>(null)
  const finalSnapshotRef = useRef<ReturnType<typeof createRecordingSnapshotFact> | null>(null)
  const interruptedRef = useRef(false)
  const playbackCursorRef = useRef<PlaybackCursorCore | null>(null)
  const playbackTimerRef = useRef<number | null>(null)
  const playbackBaseTimeRef = useRef(0)
  const playbackBasePositionRef = useRef(0)
  const speedRef = useRef(1)
  speedRef.current = playbackSpeed
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying

  const start = useCallback(() => {
    const now = Date.now()
    const session = createRecordingSession(now)
    const started = practiceSessionRepository.start({
      practiceType: 'free-practice',
      exerciseId: 'free-play',
      mode: 'free-play'
    }, session.id, new Date(now))
    if (!started.success) {
      setSaveError(`无法创建自由练习恢复点：${started.error ?? started.reason ?? '请检查本地存储权限'}`)
      return false
    }

    sessionRef.current = session
    persistedSessionIdRef.current = ''
    finalRecordRef.current = null
    finalSnapshotRef.current = null
    interruptedRef.current = false
    setStats(null)
    setNotesState('')
    notesRef.current = ''
    setPositionMs(0)
    setDurationMs(0)
    setSaveError('')
    statusRef.current = 'recording'
    setStatus('recording')
    return true
  }, [])

  const pause = useCallback(() => {
    const session = sessionRef.current
    if (statusRef.current !== 'recording' || !session) return false
    const snapshot = createRecordingSnapshotFact(session, Date.now(), notesRef.current)
    const checkpoint = practiceSessionRepository.pause(session.id, [snapshot])
    interruptedRef.current = false
    statusRef.current = 'paused'
    setStatus('paused')
    if (!checkpoint.success) {
      setSaveError('练习已暂停，但恢复草稿保存失败。')
      return false
    }
    setSaveError('')
    return true
  }, [])

  const resume = useCallback(() => {
    const session = sessionRef.current
    if (statusRef.current !== 'paused' || !session) return false
    const snapshot = createRecordingSnapshotFact(session, Date.now(), notesRef.current)
    const resumed = practiceSessionRepository.checkpoint(session.id, {
      state: 'ACTIVE',
      completionState: null,
      interruptionReason: null,
      facts: [snapshot]
    })
    if (!resumed.success) {
      setSaveError('练习仍保持暂停：恢复草稿状态更新失败。')
      return false
    }
    interruptedRef.current = false
    setSaveError('')
    statusRef.current = 'recording'
    setStatus('recording')
    return true
  }, [])

  const interruptDevice = useCallback(() => {
    const session = sessionRef.current
    if (!session || statusRef.current !== 'recording') return false
    const snapshot = createRecordingSnapshotFact(session, Date.now(), notesRef.current)
    const interrupted = practiceSessionRepository.interruptDevice(session.id, [snapshot])
    interruptedRef.current = true
    statusRef.current = 'paused'
    setStatus('paused')
    if (!interrupted.success) {
      setSaveError('MIDI 已断开，练习已暂停，但恢复草稿保存失败。')
      return false
    }
    setSaveError('')
    return true
  }, [])

  const persistAndCommit = useCallback((record: ReturnType<typeof createFreePracticeRecordV2>): boolean => {
    if (persistedSessionIdRef.current !== record.sessionId) {
      const saved = practiceRecordRepository.addResult(record)
      if (!saved.success) {
        setSaveError('练习已完成，但记录保存失败；恢复草稿已保留。')
        return false
      }
      persistedSessionIdRef.current = record.sessionId ?? record.id
    }

    const committed = practiceSessionRepository.commit(record.sessionId ?? record.id)
    if (!committed.success) {
      setSaveError('练习记录已保存，但恢复草稿提交失败；草稿仍可重试。')
      return false
    }
    setSaveError('')
    return true
  }, [])

  const finish = useCallback(() => {
    const session = sessionRef.current
    if (!session || statusRef.current === 'idle') return false

    if (statusRef.current === 'finished') {
      const record = finalRecordRef.current
      const snapshot = finalSnapshotRef.current
      if (!record || !snapshot) return false
      const finished = practiceSessionRepository.finish(session.id, 'completed', [snapshot], new Date(record.endedAt))
      if (!finished.success) {
        setSaveError('练习已完成，但恢复草稿更新失败；请重试保存。')
        return false
      }
      return persistAndCommit(record)
    }

    const endedAt = Date.now()
    const nextStats = summarizeRecording(session, endedAt)
    const snapshot = createRecordingSnapshotFact(session, endedAt, notesRef.current)
    const record = createFreePracticeRecordV2({
      sessionId: session.id,
      startedAt: new Date(session.startedAtMs).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      stats: nextStats,
      notes: notesRef.current,
      facts: [snapshot],
      completionState: 'completed'
    })
    finalRecordRef.current = record
    finalSnapshotRef.current = snapshot
    setStats(nextStats)
    setDurationMs(getPlaybackDurationMs(session.events))
    playbackCursorRef.current = new PlaybackCursorCore(session.events)
    setPositionMs(0)
    statusRef.current = 'finished'
    setStatus('finished')

    const finished = practiceSessionRepository.finish(session.id, 'completed', [snapshot], new Date(endedAt))
    if (!finished.success) {
      setSaveError('练习已完成，但恢复草稿更新失败；请重试保存。')
      return false
    }
    return persistAndCommit(record)
  }, [persistAndCommit])

  const reset = useCallback(() => {
    sessionRef.current = null
    persistedSessionIdRef.current = ''
    finalRecordRef.current = null
    finalSnapshotRef.current = null
    interruptedRef.current = false
    playbackCursorRef.current = null
    setStats(null)
    setNotesState('')
    setPositionMs(0)
    setDurationMs(0)
    setSaveError('')
    statusRef.current = 'idle'
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
      const session = sessionRef.current
      if (!session || persistedSessionIdRef.current === session.id) return
      const snapshot = createRecordingSnapshotFact(session, Date.now(), notesRef.current)
      const currentStatus = statusRef.current
      practiceSessionRepository.checkpoint(session.id, {
        facts: [snapshot],
        state: currentStatus === 'finished'
          ? 'COMPLETED'
          : interruptedRef.current
            ? 'INTERRUPTED'
            : currentStatus === 'paused'
              ? 'PAUSED'
              : 'ACTIVE',
        completionState: currentStatus === 'finished'
          ? 'completed'
          : interruptedRef.current
            ? 'interrupted_device'
            : null,
        interruptionReason: interruptedRef.current
          ? 'midi_device_disconnected'
          : currentStatus === 'finished'
            ? null
            : 'application_closed_before_commit'
      })
    }
  }, [audio.setSustain])

  const setNotes = useCallback((text: string) => {
    notesRef.current = text
    setNotesState(text)
  }, [])

  return {
    status,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    session: sessionRef.current,
    stats,
    saveError,
    start,
    pause,
    resume,
    interruptDevice,
    finish,
    retrySave: finish,
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
    setNotes
  }
}
