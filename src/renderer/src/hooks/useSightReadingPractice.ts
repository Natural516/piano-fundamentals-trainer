import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SightReadingController } from '../../../sightReading/controller'
import type { SightReadingReport } from '../../../sightReading/report'
import { getLastMidiEventId } from '../midi/midiEventBus'
import {
  CLEF_LABELS, STAFF_MODE_LABELS, getSightReadingNotes,
  type SightReadingNote, type SightReadingStaffMode
} from '../utils/sightReadingNotes'
import {
  SIGHT_READING_ANSWER_TIMEOUT_MS, readSightReadingSettings, writeSightReadingSettings,
  type SightReadingNoteCount, type SightReadingNotePoolMode,
  type SightReadingQuestionCount, type SightReadingSettings
} from '../utils/sightReadingSettings'
import type { MajorKeyId } from '../utils/musicKeySignatures'
import { useMidiEventSubscription, useMidiPanicSubscription } from './useMidiEvents'

export type { SightReadingReport, SightReadingClefStats } from '../../../sightReading/report'
export type SightReadingStatus = 'idle' | 'running' | 'finished'
export type SightReadingResult = 'correct' | 'wrong_note' | 'timeout' | null

export interface UseSightReadingPracticeResult {
  status: SightReadingStatus
  staffMode: SightReadingStaffMode
  noteCount: SightReadingNoteCount
  keySignature: MajorKeyId
  notePoolMode: SightReadingNotePoolMode
  questionCount: SightReadingQuestionCount
  answerTimeLimitSeconds: number
  showNoteName: boolean
  isPaused: boolean
  currentNote: SightReadingNote | null
  currentInput: string
  currentInputMidiNumber: number | null
  result: SightReadingResult
  completedQuestions: number
  correctCount: number
  wrongCount: number
  timeoutCount: number
  currentStreak: number
  bestStreak: number
  accuracy: number
  availableNotes: SightReadingNote[]
  report: SightReadingReport | null
  settingsSaveError: string
  getRemainingTimeMs: () => number
  setStaffMode: (staffMode: SightReadingStaffMode) => void
  setKeySignature: (keySignature: MajorKeyId) => void
  setNotePoolMode: (notePoolMode: SightReadingNotePoolMode) => void
  setQuestionCount: (questionCount: SightReadingQuestionCount) => void
  setShowNoteName: (showNoteName: boolean) => void
  start: () => void
  reset: () => void
  pause: () => void
  resume: () => void
}

/** Desktop adapter: browser timing/storage, React subscription and legacy Stop policy. */
export function useSightReadingPractice(): UseSightReadingPracticeResult {
  const [settings, setSettings] = useState<SightReadingSettings>(readSightReadingSettings)
  const [settingsSaveError, setSettingsSaveError] = useState('')
  const manualPauseRef = useRef(false)
  const controllerRef = useRef<SightReadingController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new SightReadingController(settings, {
      clock: { now: () => Date.now() },
      scheduler: {
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        cancel: (id) => window.clearTimeout(id)
      },
      random: () => Math.random(),
      readMidiWatermark: getLastMidiEventId
    })
  }
  const controller = controllerRef.current
  const [state, setState] = useState(() => controller.snapshot)
  const availableNotes = useMemo(() => getSightReadingNotes({
    staffMode: settings.staffMode,
    keySignature: settings.keySignature,
    notePoolMode: settings.notePoolMode
  }), [settings.staffMode, settings.keySignature, settings.notePoolMode])

  // Preserve the desktop report shape as well as its completed-only lifetime.
  const report = useMemo(() => {
    if (!state.report) return null
    const { completionState: _completionState, partialEvidence: _partialEvidence, ...desktopReport } = state.report
    return desktopReport
  }, [state.report])

  useEffect(() => {
    const unsubscribe = controller.subscribe(() => setState(controller.snapshot))
    return () => { unsubscribe(); controller.dispose() }
  }, [controller])

  const pause = useCallback(() => {
    manualPauseRef.current = true
    controller.pause()
  }, [controller])
  const resumeInternal = useCallback(() => {
    if (!manualPauseRef.current) controller.resume()
  }, [controller])
  const resume = useCallback(() => {
    manualPauseRef.current = false
    if (!document.hidden && document.hasFocus()) resumeInternal()
  }, [resumeInternal])
  const start = useCallback(() => {
    manualPauseRef.current = false
    controller.start(settings)
  }, [controller, settings])
  const reset = useCallback(() => {
    manualPauseRef.current = false
    // Legacy desktop early Stop deliberately discards partial counters/reports.
    // Android will explicitly use controller.stop() when integrated in a later phase.
    controller.reset(settings)
  }, [controller, settings])
  const getRemainingTimeMs = useCallback(() => controller.getRemainingTimeMs(), [controller])
  const updateSetting = useCallback(<Key extends keyof SightReadingSettings>(key: Key, value: SightReadingSettings[Key]) => {
    if (controller.snapshot.status === 'running') return
    setSettings((current) => ({ ...current, [key]: value }))
  }, [controller])

  useEffect(() => {
    setSettingsSaveError(writeSightReadingSettings(settings) ? '' : '识谱设置保存失败，请检查本地存储权限。')
  }, [settings])

  useEffect(() => {
    const handleBlur = (): void => controller.pause()
    const handleFocus = (): void => { if (!document.hidden) resumeInternal() }
    const handleVisibilityChange = (): void => {
      if (document.hidden) controller.pause()
      else if (document.hasFocus()) resumeInternal()
    }
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [controller, resumeInternal])

  useMidiEventSubscription((event) => controller.handleMidi(event))
  useMidiPanicSubscription(() => controller.panic())

  return {
    ...state,
    status: state.status === 'stopped' ? 'finished' : state.status,
    report,
    staffMode: settings.staffMode,
    noteCount: settings.noteCount,
    keySignature: settings.keySignature,
    notePoolMode: settings.notePoolMode,
    questionCount: settings.questionCount,
    answerTimeLimitSeconds: SIGHT_READING_ANSWER_TIMEOUT_MS / 1000,
    showNoteName: settings.noteNameVisible,
    availableNotes, settingsSaveError, getRemainingTimeMs,
    setStaffMode: (value) => updateSetting('staffMode', value),
    setKeySignature: (value) => updateSetting('keySignature', value),
    setNotePoolMode: (value) => updateSetting('notePoolMode', value),
    setQuestionCount: (value) => updateSetting('questionCount', value),
    setShowNoteName: (value) => updateSetting('noteNameVisible', value),
    start, reset, pause, resume
  }
}

export { CLEF_LABELS, STAFF_MODE_LABELS }
export type { MajorKeyId, SightReadingNoteCount, SightReadingNotePoolMode, SightReadingQuestionCount, SightReadingStaffMode }
