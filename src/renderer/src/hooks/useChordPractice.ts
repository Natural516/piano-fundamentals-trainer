import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import { midiNumberToNoteName } from '../utils/midiNotes'
import {
  CHORD_INPUT_WINDOW_MS,
  CHORD_INVERSION_MODE_LABELS,
  CHORD_QUALITY_LABELS,
  CHORD_QUESTION_COUNTS,
  getChordTargets,
  getRandomChordTarget
} from '../utils/chordPatterns'
import type {
  ChordFeedback,
  ChordInversionMode,
  ChordJudgementType,
  ChordPracticeReport,
  ChordPracticeStatus,
  ChordQualityFilter,
  ChordQuestionCount,
  ChordTarget
} from '../utils/chordTypes'
import { useMetronome } from './useMetronome'
import { useMetronomeSound } from './useMetronomeSound'

interface UseChordPracticeResult {
  status: ChordPracticeStatus
  questionCount: ChordQuestionCount
  questionCountOptions: readonly ChordQuestionCount[]
  setQuestionCount: (questionCount: ChordQuestionCount) => void
  qualityFilter: ChordQualityFilter
  setQualityFilter: (qualityFilter: ChordQualityFilter) => void
  inversionMode: ChordInversionMode
  setInversionMode: (inversionMode: ChordInversionMode) => void
  showNoteNames: boolean
  setShowNoteNames: (showNoteNames: boolean) => void
  metronomeEnabled: boolean
  setMetronomeEnabled: (enabled: boolean) => void
  metronome: ReturnType<typeof useMetronome>
  metronomeSound: ReturnType<typeof useMetronomeSound>
  chordPool: ChordTarget[]
  currentTarget: ChordTarget | null
  feedback: ChordFeedback | null
  currentInputNotes: number[]
  completedQuestions: number
  correctCount: number
  wrongCount: number
  currentStreak: number
  bestStreak: number
  report: ChordPracticeReport
  targetNotes: number[]
  correctNotes: number[]
  wrongNotes: number[]
  isRunning: boolean
  isLocked: boolean
  start: () => void
  stop: () => void
  nextQuestion: () => void
}

const EMPTY_REPORT: ChordPracticeReport = {
  totalQuestions: 0,
  correct: 0,
  wrong: 0,
  missingNote: 0,
  extraNote: 0,
  wrongNote: 0,
  accuracy: 0,
  bestStreak: 0,
  mostMissedChord: '暂无',
  mostMissedNote: '暂无',
  averageAttempts: 0
}

function normalizeNotes(notes: number[]): number[] {
  return Array.from(new Set(notes)).sort((left, right) => left - right)
}

function getMissingNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const inputSet = new Set(inputNotes)
  return expectedNotes.filter((note) => !inputSet.has(note))
}

function getExtraNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const expectedSet = new Set(expectedNotes)
  return inputNotes.filter((note) => !expectedSet.has(note))
}

function getJudgementType(missingNotes: number[], extraNotes: number[]): ChordJudgementType {
  if (missingNotes.length === 0 && extraNotes.length === 0) {
    return 'correct'
  }

  if (missingNotes.length > 0 && extraNotes.length > 0) {
    return 'wrong_note'
  }

  if (missingNotes.length > 0) {
    return 'missing_note'
  }

  return 'extra_note'
}

function createFeedback(target: ChordTarget, inputNotes: number[]): ChordFeedback {
  const expectedNotes = normalizeNotes(target.notes)
  const cleanInputNotes = normalizeNotes(inputNotes)
  const missingNotes = getMissingNotes(expectedNotes, cleanInputNotes)
  const extraNotes = getExtraNotes(expectedNotes, cleanInputNotes)
  const type = getJudgementType(missingNotes, extraNotes)
  const missingText = missingNotes.length > 0 ? `缺少 ${missingNotes.map(midiNumberToNoteName).join(' / ')}` : ''
  const extraText = extraNotes.length > 0 ? `多出 ${extraNotes.map(midiNumberToNoteName).join(' / ')}` : ''
  const message = type === 'correct'
    ? '正确'
    : [missingText, extraText].filter(Boolean).join('，')

  return {
    type,
    target,
    inputNotes: cleanInputNotes,
    inputNoteNames: cleanInputNotes.map(midiNumberToNoteName),
    missingNotes,
    missingNoteNames: missingNotes.map(midiNumberToNoteName),
    extraNotes,
    extraNoteNames: extraNotes.map(midiNumberToNoteName),
    message
  }
}

function getTopEntryLabel(entries: Map<string, number>): string {
  const topEntry = [...entries.entries()].sort((left, right) => right[1] - left[1])[0]
  return topEntry ? topEntry[0] : '暂无'
}

function createReport({
  bestStreak,
  chordErrorCounts,
  completedQuestions,
  correctCount,
  extraCount,
  missingCount,
  noteMissingCounts,
  questionCount,
  totalAttempts,
  wrongCount,
  wrongNoteCount
}: {
  bestStreak: number
  chordErrorCounts: Map<string, number>
  completedQuestions: number
  correctCount: number
  extraCount: number
  missingCount: number
  noteMissingCounts: Map<string, number>
  questionCount: number
  totalAttempts: number
  wrongCount: number
  wrongNoteCount: number
}): ChordPracticeReport {
  return {
    totalQuestions: questionCount,
    correct: correctCount,
    wrong: wrongCount,
    missingNote: missingCount,
    extraNote: extraCount,
    wrongNote: wrongNoteCount,
    accuracy: questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0,
    bestStreak,
    mostMissedChord: getTopEntryLabel(chordErrorCounts),
    mostMissedNote: getTopEntryLabel(noteMissingCounts),
    averageAttempts: completedQuestions > 0 ? Math.round((totalAttempts / completedQuestions) * 10) / 10 : 0
  }
}

export function useChordPractice(latestMidiEvent: MidiEventRecord | null): UseChordPracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [status, setStatus] = useState<ChordPracticeStatus>('idle')
  const [questionCount, setQuestionCountState] = useState<ChordQuestionCount>(20)
  const [qualityFilter, setQualityFilterState] = useState<ChordQualityFilter>('both')
  const [inversionMode, setInversionModeState] = useState<ChordInversionMode>('root')
  const [showNoteNames, setShowNoteNamesState] = useState(true)
  const [metronomeEnabled, setMetronomeEnabledState] = useState(false)
  const [currentTarget, setCurrentTarget] = useState<ChordTarget | null>(null)
  const [feedback, setFeedback] = useState<ChordFeedback | null>(null)
  const [currentInputNotes, setCurrentInputNotes] = useState<number[]>([])
  const [completedQuestions, setCompletedQuestions] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [report, setReport] = useState<ChordPracticeReport | null>(null)
  const [isLocked, setIsLocked] = useState(false)

  const currentTargetRef = useRef<ChordTarget | null>(null)
  const activePoolRef = useRef<ChordTarget[]>([])
  const inputWindowTimerRef = useRef<number | null>(null)
  const advanceTimerRef = useRef<number | null>(null)
  const inputWindowNotesRef = useRef<number[]>([])
  const practiceStartedAtRef = useRef<number | null>(null)
  const lastHandledEventKeyRef = useRef('')
  const currentHadErrorRef = useRef(false)
  const completedQuestionsRef = useRef(0)
  const correctCountRef = useRef(0)
  const wrongCountRef = useRef(0)
  const missingCountRef = useRef(0)
  const extraCountRef = useRef(0)
  const wrongNoteCountRef = useRef(0)
  const currentStreakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const totalAttemptsRef = useRef(0)
  const chordErrorCountsRef = useRef<Map<string, number>>(new Map())
  const noteMissingCountsRef = useRef<Map<string, number>>(new Map())

  const chordPool = useMemo(
    () => getChordTargets(qualityFilter, inversionMode),
    [inversionMode, qualityFilter]
  )

  const clearInputWindow = useCallback(() => {
    if (inputWindowTimerRef.current !== null) {
      window.clearTimeout(inputWindowTimerRef.current)
      inputWindowTimerRef.current = null
    }

    inputWindowNotesRef.current = []
  }, [])

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }, [])

  const buildReport = useCallback(() => createReport({
    bestStreak: bestStreakRef.current,
    chordErrorCounts: chordErrorCountsRef.current,
    completedQuestions: completedQuestionsRef.current,
    correctCount: correctCountRef.current,
    extraCount: extraCountRef.current,
    missingCount: missingCountRef.current,
    noteMissingCounts: noteMissingCountsRef.current,
    questionCount,
    totalAttempts: totalAttemptsRef.current,
    wrongCount: wrongCountRef.current,
    wrongNoteCount: wrongNoteCountRef.current
  }), [questionCount])

  const resetCounters = useCallback(() => {
    completedQuestionsRef.current = 0
    correctCountRef.current = 0
    wrongCountRef.current = 0
    missingCountRef.current = 0
    extraCountRef.current = 0
    wrongNoteCountRef.current = 0
    currentStreakRef.current = 0
    bestStreakRef.current = 0
    totalAttemptsRef.current = 0
    chordErrorCountsRef.current = new Map()
    noteMissingCountsRef.current = new Map()
    currentHadErrorRef.current = false
    setCompletedQuestions(0)
    setCorrectCount(0)
    setWrongCount(0)
    setCurrentStreak(0)
    setBestStreak(0)
  }, [])

  const finishPractice = useCallback(() => {
    clearInputWindow()
    clearAdvanceTimer()
    practiceStartedAtRef.current = null
    currentTargetRef.current = null
    setIsLocked(false)
    setStatus('finished')
    setCurrentTarget(null)
    setReport(buildReport())
    metronome.stop()
  }, [buildReport, clearAdvanceTimer, clearInputWindow, metronome])

  const setNextTarget = useCallback(() => {
    const nextTarget = getRandomChordTarget(activePoolRef.current, currentTargetRef.current)
    currentTargetRef.current = nextTarget
    currentHadErrorRef.current = false
    setCurrentTarget(nextTarget)
    setFeedback(null)
    setCurrentInputNotes([])
    setIsLocked(false)
  }, [])

  const completeQuestion = useCallback(
    (firstTryCorrect: boolean, delayNext = true) => {
      const nextCompleted = completedQuestionsRef.current + 1
      completedQuestionsRef.current = nextCompleted
      setCompletedQuestions(nextCompleted)

      if (firstTryCorrect) {
        const nextCorrect = correctCountRef.current + 1
        const nextStreak = currentStreakRef.current + 1
        const nextBestStreak = Math.max(bestStreakRef.current, nextStreak)

        correctCountRef.current = nextCorrect
        currentStreakRef.current = nextStreak
        bestStreakRef.current = nextBestStreak
        setCorrectCount(nextCorrect)
        setCurrentStreak(nextStreak)
        setBestStreak(nextBestStreak)
      } else {
        currentStreakRef.current = 0
        setCurrentStreak(0)
      }

      if (nextCompleted >= questionCount) {
        finishPractice()
        return
      }

      if (!delayNext) {
        setNextTarget()
        return
      }

      setIsLocked(true)
      clearAdvanceTimer()
      advanceTimerRef.current = window.setTimeout(() => {
        setNextTarget()
      }, 500)
    },
    [clearAdvanceTimer, finishPractice, questionCount, setNextTarget]
  )

  const recordFirstError = useCallback((nextFeedback: ChordFeedback) => {
    if (currentHadErrorRef.current) {
      return
    }

    currentHadErrorRef.current = true
    wrongCountRef.current += 1
    currentStreakRef.current = 0
    chordErrorCountsRef.current.set(
      nextFeedback.target.label,
      (chordErrorCountsRef.current.get(nextFeedback.target.label) ?? 0) + 1
    )

    if (nextFeedback.type === 'missing_note') missingCountRef.current += 1
    if (nextFeedback.type === 'extra_note') extraCountRef.current += 1
    if (nextFeedback.type === 'wrong_note') wrongNoteCountRef.current += 1

    for (const noteName of nextFeedback.missingNoteNames) {
      noteMissingCountsRef.current.set(noteName, (noteMissingCountsRef.current.get(noteName) ?? 0) + 1)
    }

    setWrongCount(wrongCountRef.current)
    setCurrentStreak(0)
  }, [])

  const evaluateInputWindow = useCallback(() => {
    inputWindowTimerRef.current = null
    const target = currentTargetRef.current

    if (!target || status !== 'running') {
      inputWindowNotesRef.current = []
      return
    }

    const inputNotes = normalizeNotes(inputWindowNotesRef.current)
    inputWindowNotesRef.current = []
    totalAttemptsRef.current += 1

    const nextFeedback = createFeedback(target, inputNotes)
    setFeedback(nextFeedback)
    setCurrentInputNotes(inputNotes)

    if (nextFeedback.type === 'correct') {
      completeQuestion(!currentHadErrorRef.current)
      return
    }

    recordFirstError(nextFeedback)
  }, [completeQuestion, recordFirstError, status])

  const setQuestionCount = useCallback((nextQuestionCount: ChordQuestionCount) => {
    if (status === 'running') return
    setQuestionCountState(nextQuestionCount)
  }, [status])

  const setQualityFilter = useCallback((nextQualityFilter: ChordQualityFilter) => {
    if (status === 'running') return
    setQualityFilterState(nextQualityFilter)
  }, [status])

  const setInversionMode = useCallback((nextInversionMode: ChordInversionMode) => {
    if (status === 'running') return
    setInversionModeState(nextInversionMode)
  }, [status])

  const setShowNoteNames = useCallback((nextShowNoteNames: boolean) => {
    setShowNoteNamesState(nextShowNoteNames)
  }, [])

  const setMetronomeEnabled = useCallback((nextEnabled: boolean) => {
    if (status === 'running') return
    setMetronomeEnabledState(nextEnabled)
  }, [status])

  const start = useCallback(() => {
    const nextPool = getChordTargets(qualityFilter, inversionMode)

    clearInputWindow()
    clearAdvanceTimer()
    activePoolRef.current = nextPool
    practiceStartedAtRef.current = Date.now()
    lastHandledEventKeyRef.current = ''
    resetCounters()
    setStatus('running')
    setReport(null)
    setIsLocked(false)

    if (metronomeEnabled) {
      void metronomeSound.prepare()
      metronome.restart()
    } else {
      metronome.stop()
    }

    const firstTarget = getRandomChordTarget(nextPool)
    currentTargetRef.current = firstTarget
    setCurrentTarget(firstTarget)
    setFeedback(null)
    setCurrentInputNotes([])
  }, [
    clearAdvanceTimer,
    clearInputWindow,
    inversionMode,
    metronome,
    metronomeEnabled,
    metronomeSound,
    qualityFilter,
    resetCounters
  ])

  const stop = useCallback(() => {
    clearInputWindow()
    clearAdvanceTimer()
    practiceStartedAtRef.current = null
    currentTargetRef.current = null
    activePoolRef.current = []
    setStatus('idle')
    setCurrentTarget(null)
    setFeedback(null)
    setCurrentInputNotes([])
    setIsLocked(false)
    setReport(null)
    resetCounters()
    metronome.stop()
  }, [clearAdvanceTimer, clearInputWindow, metronome, resetCounters])

  const nextQuestion = useCallback(() => {
    if (status !== 'running' || !currentTargetRef.current || !currentHadErrorRef.current) {
      return
    }

    clearInputWindow()
    completeQuestion(false, false)
  }, [clearInputWindow, completeQuestion, status])

  useEffect(() => {
    return () => {
      clearInputWindow()
      clearAdvanceTimer()
    }
  }, [clearAdvanceTimer, clearInputWindow])

  useEffect(() => {
    if (!latestMidiEvent || latestMidiEvent.type !== 'noteOn' || (latestMidiEvent.velocity ?? 0) <= 0) {
      return
    }

    if (status !== 'running' || isLocked || !currentTargetRef.current) {
      return
    }

    if (practiceStartedAtRef.current !== null && latestMidiEvent.timestamp < practiceStartedAtRef.current) {
      return
    }

    if (typeof latestMidiEvent.midiNumber !== 'number') {
      return
    }

    const eventKey = `${latestMidiEvent.timestamp}-${latestMidiEvent.type}-${latestMidiEvent.midiNumber}-${latestMidiEvent.velocity}-${latestMidiEvent.deviceName}`

    if (lastHandledEventKeyRef.current === eventKey) {
      return
    }

    lastHandledEventKeyRef.current = eventKey

    inputWindowNotesRef.current = normalizeNotes([...inputWindowNotesRef.current, latestMidiEvent.midiNumber])

    if (inputWindowTimerRef.current === null) {
      inputWindowTimerRef.current = window.setTimeout(evaluateInputWindow, CHORD_INPUT_WINDOW_MS)
    }
  }, [evaluateInputWindow, isLocked, latestMidiEvent, status])

  const activeReport = report ?? (status === 'running' ? buildReport() : EMPTY_REPORT)
  const correctNotes = feedback?.type === 'correct' ? feedback.target.notes : []
  const wrongNotes = feedback && feedback.type !== 'correct' ? feedback.inputNotes : []

  return {
    status,
    questionCount,
    questionCountOptions: CHORD_QUESTION_COUNTS,
    setQuestionCount,
    qualityFilter,
    setQualityFilter,
    inversionMode,
    setInversionMode,
    showNoteNames,
    setShowNoteNames,
    metronomeEnabled,
    setMetronomeEnabled,
    metronome,
    metronomeSound,
    chordPool,
    currentTarget,
    feedback,
    currentInputNotes,
    completedQuestions,
    correctCount,
    wrongCount,
    currentStreak,
    bestStreak,
    report: activeReport,
    targetNotes: currentTarget?.notes ?? [],
    correctNotes,
    wrongNotes,
    isRunning: status === 'running',
    isLocked,
    start,
    stop,
    nextQuestion
  }
}

export { CHORD_INVERSION_MODE_LABELS, CHORD_QUALITY_LABELS }
