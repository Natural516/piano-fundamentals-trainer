import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import { midiNumberToNoteName } from '../utils/midiNotes'
import {
  CLEF_LABELS,
  RANGE_LABELS,
  STAFF_MODE_LABELS,
  createShuffledSightReadingBag,
  getMostMissedNote,
  getSightReadingNotes,
  type SightReadingClef,
  type SightReadingNote,
  type SightReadingRange,
  type SightReadingStaffMode
} from '../utils/sightReadingNotes'
import {
  SightReadingSessionCore,
  getSightReadingReactionSummary,
  type SightReadingOutcomeRecord,
  type SightReadingSessionCounters
} from '../utils/sightReadingSession'
import {
  readSightReadingSettings,
  writeSightReadingSettings,
  type SightReadingQuestionCount,
  type SightReadingSettings
} from '../utils/sightReadingSettings'

export type SightReadingStatus = 'idle' | 'running' | 'finished'
export type SightReadingResult = 'correct' | 'wrong_note' | 'timeout' | null

export interface SightReadingClefStats {
  total: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
}

export interface SightReadingReport {
  totalQuestions: number
  completedQuestions: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
  bestStreak: number
  mostWrongNote: string
  mostTimedOutNote: string
  weakestNote: string
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
  wrongNoteCounts: Array<{ noteName: string; count: number }>
  timeoutNoteCounts: Array<{ noteName: string; count: number }>
  staffMode: SightReadingStaffMode
  range: SightReadingRange
  answerTimeLimitSeconds: number
  treble: SightReadingClefStats
  bass: SightReadingClefStats
}

export interface UseSightReadingPracticeResult {
  status: SightReadingStatus
  staffMode: SightReadingStaffMode
  range: SightReadingRange
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
  setStaffMode: (staffMode: SightReadingStaffMode) => void
  setRange: (range: SightReadingRange) => void
  setQuestionCount: (questionCount: SightReadingQuestionCount) => void
  setAnswerTimeLimitSeconds: (seconds: number) => void
  setShowNoteName: (showNoteName: boolean) => void
  start: () => void
  reset: () => void
  pause: () => void
  resume: () => void
}

const QUESTION_DISPLAY_DELAY_MS = 32
const FEEDBACK_DURATION_MS = 350

function calculateAccuracy(correct: number, completed: number): number {
  return completed > 0 ? Math.round((correct / completed) * 100) : 0
}

function calculateClefStats(
  clef: SightReadingClef,
  counters: SightReadingSessionCounters
): SightReadingClefStats {
  const total = counters.clefTotals[clef]
  const correct = counters.clefCorrect[clef]

  return {
    total,
    correct,
    wrong: counters.clefWrong[clef],
    timeout: counters.clefTimeout[clef],
    accuracy: calculateAccuracy(correct, total)
  }
}

function createReport(
  settings: SightReadingSettings,
  counters: SightReadingSessionCounters,
  notes: SightReadingNote[]
): SightReadingReport {
  const uniqueNotes = Array.from(new Map(notes.map((note) => [note.midiNumber, note])).values())
  const reactionSummary = getSightReadingReactionSummary(counters.reactionTimes)
  const weakestNoteCounts = Object.fromEntries(uniqueNotes.map((note) => [
    note.midiNumber,
    (counters.wrongNoteCounts[note.midiNumber] ?? 0) + (counters.timeoutNoteCounts[note.midiNumber] ?? 0)
  ]))

  return {
    totalQuestions: settings.questionCount,
    completedQuestions: counters.completed,
    correct: counters.correct,
    wrong: counters.wrong,
    timeout: counters.timeout,
    accuracy: calculateAccuracy(counters.correct, counters.completed),
    bestStreak: counters.bestStreak,
    mostWrongNote: getMostMissedNote(counters.wrongNoteCounts),
    mostTimedOutNote: getMostMissedNote(counters.timeoutNoteCounts),
    weakestNote: getMostMissedNote(weakestNoteCounts),
    ...reactionSummary,
    wrongNoteCounts: uniqueNotes.map((note) => ({
      noteName: note.noteName,
      count: counters.wrongNoteCounts[note.midiNumber] ?? 0
    })),
    timeoutNoteCounts: uniqueNotes.map((note) => ({
      noteName: note.noteName,
      count: counters.timeoutNoteCounts[note.midiNumber] ?? 0
    })),
    staffMode: settings.staffMode,
    range: settings.range,
    answerTimeLimitSeconds: settings.answerTimeLimitSeconds,
    treble: calculateClefStats('treble', counters),
    bass: calculateClefStats('bass', counters)
  }
}

export function useSightReadingPractice(latestMidiEvent: MidiEventRecord | null): UseSightReadingPracticeResult {
  const initialSettingsRef = useRef<SightReadingSettings | null>(null)
  if (initialSettingsRef.current === null) initialSettingsRef.current = readSightReadingSettings()

  const [settings, setSettings] = useState<SightReadingSettings>(initialSettingsRef.current)
  const [status, setStatus] = useState<SightReadingStatus>('idle')
  const [isPaused, setIsPaused] = useState(false)
  const [currentNote, setCurrentNote] = useState<SightReadingNote | null>(null)
  const [currentInput, setCurrentInput] = useState('')
  const [currentInputMidiNumber, setCurrentInputMidiNumber] = useState<number | null>(null)
  const [result, setResult] = useState<SightReadingResult>(null)
  const [completedQuestions, setCompletedQuestions] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [timeoutCount, setTimeoutCount] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [report, setReport] = useState<SightReadingReport | null>(null)

  const latestMidiEventRef = useRef(latestMidiEvent)
  const statusRef = useRef<SightReadingStatus>('idle')
  const manualPauseRef = useRef(false)
  const advanceDeadlineRef = useRef<number | null>(null)
  const remainingAdvanceMsRef = useRef(0)
  const displayTimerRef = useRef<number | null>(null)
  const questionTimerRef = useRef<number | null>(null)
  const advanceTimerRef = useRef<number | null>(null)
  const activeSettingsRef = useRef<SightReadingSettings>(initialSettingsRef.current)
  const activeNotesRef = useRef<SightReadingNote[]>(getSightReadingNotes(initialSettingsRef.current))
  const sessionRef = useRef(new SightReadingSessionCore(activeNotesRef.current))
  const bagRef = useRef<SightReadingNote[]>([])
  const previousMidiNumberRef = useRef<number | null>(null)
  const applyOutcomeRef = useRef<(record: SightReadingOutcomeRecord) => void>(() => undefined)

  latestMidiEventRef.current = latestMidiEvent

  const availableNotes = useMemo(
    () => getSightReadingNotes({ staffMode: settings.staffMode, range: settings.range }),
    [settings.range, settings.staffMode]
  )
  const accuracy = useMemo(
    () => calculateAccuracy(correctCount, completedQuestions),
    [completedQuestions, correctCount]
  )

  const clearDisplayTimer = useCallback(() => {
    if (displayTimerRef.current !== null) {
      window.clearTimeout(displayTimerRef.current)
      displayTimerRef.current = null
    }
  }, [])

  const clearQuestionTimer = useCallback(() => {
    if (questionTimerRef.current !== null) {
      window.clearTimeout(questionTimerRef.current)
      questionTimerRef.current = null
    }
  }, [])

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }, [])

  const clearAllTimers = useCallback(() => {
    clearDisplayTimer()
    clearQuestionTimer()
    clearAdvanceTimer()
  }, [clearAdvanceTimer, clearDisplayTimer, clearQuestionTimer])

  const syncCounters = useCallback((counters: SightReadingSessionCounters) => {
    setCompletedQuestions(counters.completed)
    setCorrectCount(counters.correct)
    setWrongCount(counters.wrong)
    setTimeoutCount(counters.timeout)
    setCurrentStreak(counters.currentStreak)
    setBestStreak(counters.bestStreak)
  }, [])

  const finishPractice = useCallback(() => {
    clearAllTimers()
    const counters = sessionRef.current.counters
    sessionRef.current.finish()
    statusRef.current = 'finished'
    setIsPaused(false)
    setStatus('finished')
    setCurrentNote(null)
    setReport(createReport(activeSettingsRef.current, counters, activeNotesRef.current))
  }, [clearAllTimers])

  const takeNextNote = useCallback((): SightReadingNote => {
    if (bagRef.current.length === 0) {
      bagRef.current = createShuffledSightReadingBag(activeNotesRef.current, previousMidiNumberRef.current)
    }

    const nextNote = bagRef.current.shift() ?? activeNotesRef.current[0]
    previousMidiNumberRef.current = nextNote.midiNumber
    return nextNote
  }, [])

  const scheduleQuestionTimeout = useCallback((delayMs: number) => {
    clearQuestionTimer()
    const safeDelay = Math.max(0, delayMs)
    sessionRef.current.questionDeadlineMs = Date.now() + safeDelay
    sessionRef.current.remainingQuestionMs = safeDelay
    questionTimerRef.current = window.setTimeout(() => {
      questionTimerRef.current = null
      if (statusRef.current !== 'running') return
      const outcome = sessionRef.current.recordTimeout()
      if (outcome) applyOutcomeRef.current(outcome)
    }, safeDelay)
  }, [clearQuestionTimer])

  const unlockQuestion = useCallback(() => {
    displayTimerRef.current = null
    const session = sessionRef.current
    if (statusRef.current !== 'running' || session.paused || session.phase !== 'display') return

    const now = Date.now()
    const timeLimitMs = activeSettingsRef.current.answerTimeLimitSeconds * 1000
    session.unlockQuestion(now, latestMidiEventRef.current?.id ?? null, timeLimitMs)
    scheduleQuestionTimeout(timeLimitMs)
  }, [scheduleQuestionTimeout])

  const displayNextQuestion = useCallback(() => {
    clearDisplayTimer()
    clearQuestionTimer()
    const nextNote = takeNextNote()

    sessionRef.current.beginQuestion(nextNote)
    setCurrentNote(nextNote)
    setCurrentInput('')
    setCurrentInputMidiNumber(null)
    setResult(null)
    displayTimerRef.current = window.setTimeout(unlockQuestion, QUESTION_DISPLAY_DELAY_MS)
  }, [clearDisplayTimer, clearQuestionTimer, takeNextNote, unlockQuestion])

  const applyOutcome = useCallback((record: SightReadingOutcomeRecord) => {
    clearQuestionTimer()
    const counters = sessionRef.current.counters
    const inputName = record.inputName || (
      record.inputMidiNumber !== null ? midiNumberToNoteName(record.inputMidiNumber) : ''
    )

    setResult(record.outcome)
    setCurrentInput(inputName)
    setCurrentInputMidiNumber(record.inputMidiNumber)
    syncCounters(counters)

    clearAdvanceTimer()
    remainingAdvanceMsRef.current = FEEDBACK_DURATION_MS
    advanceDeadlineRef.current = Date.now() + FEEDBACK_DURATION_MS
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null
      const session = sessionRef.current
      if (statusRef.current !== 'running' || session.paused) return
      const action = session.completeFeedback(activeSettingsRef.current.questionCount)
      if (action === 'finish') finishPractice()
      else if (action === 'next') displayNextQuestion()
    }, FEEDBACK_DURATION_MS)
  }, [clearAdvanceTimer, clearQuestionTimer, displayNextQuestion, finishPractice, syncCounters])

  applyOutcomeRef.current = applyOutcome

  const pauseInternal = useCallback(() => {
    const session = sessionRef.current
    if (statusRef.current !== 'running' || session.paused) return

    const now = Date.now()
    session.pause(now)
    setIsPaused(true)

    if (session.phase === 'display') {
      clearDisplayTimer()
    } else if (session.phase === 'answering') {
      clearQuestionTimer()
    } else if (session.phase === 'feedback') {
      remainingAdvanceMsRef.current = Math.max(0, (advanceDeadlineRef.current ?? now) - now)
      clearAdvanceTimer()
    }
  }, [clearAdvanceTimer, clearDisplayTimer, clearQuestionTimer])

  const resumeInternal = useCallback(() => {
    const session = sessionRef.current
    if (statusRef.current !== 'running' || !session.paused || manualPauseRef.current) return

    const now = Date.now()
    session.resume(now, latestMidiEventRef.current?.id ?? null)
    setIsPaused(false)

    if (session.phase === 'display') {
      displayTimerRef.current = window.setTimeout(unlockQuestion, QUESTION_DISPLAY_DELAY_MS)
      return
    }

    if (session.phase === 'answering') {
      scheduleQuestionTimeout(session.remainingQuestionMs)
      return
    }

    if (session.phase === 'feedback') {
      const delay = Math.max(0, remainingAdvanceMsRef.current)
      advanceDeadlineRef.current = now + delay
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        const activeSession = sessionRef.current
        if (statusRef.current !== 'running' || activeSession.paused) return
        const action = activeSession.completeFeedback(activeSettingsRef.current.questionCount)
        if (action === 'finish') finishPractice()
        else if (action === 'next') displayNextQuestion()
      }, delay)
    }
  }, [displayNextQuestion, finishPractice, scheduleQuestionTimeout, unlockQuestion])

  const pause = useCallback(() => {
    manualPauseRef.current = true
    pauseInternal()
  }, [pauseInternal])

  const resume = useCallback(() => {
    manualPauseRef.current = false
    if (!document.hidden && document.hasFocus()) resumeInternal()
  }, [resumeInternal])

  const reset = useCallback(() => {
    clearAllTimers()
    const notes = getSightReadingNotes({ staffMode: settings.staffMode, range: settings.range })

    statusRef.current = 'idle'
    manualPauseRef.current = false
    sessionRef.current = new SightReadingSessionCore(notes)
    bagRef.current = []
    previousMidiNumberRef.current = null
    setStatus('idle')
    setIsPaused(false)
    setCurrentNote(null)
    setCurrentInput('')
    setCurrentInputMidiNumber(null)
    setResult(null)
    setReport(null)
    syncCounters(sessionRef.current.counters)
  }, [clearAllTimers, settings.range, settings.staffMode, syncCounters])

  const start = useCallback(() => {
    clearAllTimers()
    const activeSettings = { ...settings }
    const notes = getSightReadingNotes({ staffMode: activeSettings.staffMode, range: activeSettings.range })

    activeSettingsRef.current = activeSettings
    activeNotesRef.current = notes
    sessionRef.current = new SightReadingSessionCore(notes)
    bagRef.current = []
    previousMidiNumberRef.current = null
    sessionRef.current.start(Date.now(), latestMidiEventRef.current?.id ?? null)
    statusRef.current = 'running'
    manualPauseRef.current = false
    setStatus('running')
    setIsPaused(false)
    setReport(null)
    syncCounters(sessionRef.current.counters)
    displayNextQuestion()
  }, [clearAllTimers, displayNextQuestion, settings, syncCounters])

  const updateSetting = useCallback(<Key extends keyof SightReadingSettings>(
    key: Key,
    value: SightReadingSettings[Key]
  ) => {
    if (statusRef.current === 'running') return
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  useEffect(() => {
    writeSightReadingSettings(settings)
  }, [settings])

  useEffect(() => {
    const handleBlur = (): void => pauseInternal()
    const handleFocus = (): void => {
      if (!document.hidden) resumeInternal()
    }
    const handleVisibilityChange = (): void => {
      if (document.hidden) pauseInternal()
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
  }, [pauseInternal, resumeInternal])

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  useEffect(() => {
    if (status !== 'running' || isPaused || !latestMidiEvent) return

    const outcome = sessionRef.current.processMidiEvent(latestMidiEvent)
    if (outcome) applyOutcome(outcome)
  }, [applyOutcome, isPaused, latestMidiEvent, status])

  return {
    status,
    staffMode: settings.staffMode,
    range: settings.range,
    questionCount: settings.questionCount,
    answerTimeLimitSeconds: settings.answerTimeLimitSeconds,
    showNoteName: settings.noteNameVisible,
    isPaused,
    currentNote,
    currentInput,
    currentInputMidiNumber,
    result,
    completedQuestions,
    correctCount,
    wrongCount,
    timeoutCount,
    currentStreak,
    bestStreak,
    accuracy,
    availableNotes,
    report,
    setStaffMode: (value) => updateSetting('staffMode', value),
    setRange: (value) => updateSetting('range', value),
    setQuestionCount: (value) => updateSetting('questionCount', value),
    setAnswerTimeLimitSeconds: (value) => {
      if (Number.isInteger(value) && value >= 1 && value <= 60) updateSetting('answerTimeLimitSeconds', value)
    },
    setShowNoteName: (value) => updateSetting('noteNameVisible', value),
    start,
    reset,
    pause,
    resume
  }
}

export { CLEF_LABELS, RANGE_LABELS, STAFF_MODE_LABELS }
export type { SightReadingQuestionCount, SightReadingRange, SightReadingStaffMode }
