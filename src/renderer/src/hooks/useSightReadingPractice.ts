import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import { midiNumberToNoteName } from '../utils/midiNotes'
import {
  CLEF_LABELS,
  RANGE_LABELS,
  getMostMissedNote,
  getRandomSightReadingNote,
  getSightReadingNotes,
  type SightReadingClef,
  type SightReadingClefMode,
  type SightReadingNote,
  type SightReadingRange
} from '../utils/sightReadingNotes'

export type SightReadingStatus = 'idle' | 'running' | 'finished'
export type SightReadingResult = 'correct' | 'wrong_note' | null
export type SightReadingQuestionCount = 10 | 20 | 50

export interface SightReadingClefStats {
  total: number
  correct: number
  wrong: number
  accuracy: number
}

export interface SightReadingReport {
  totalQuestions: number
  correct: number
  wrong: number
  accuracy: number
  bestStreak: number
  mostMissedNote: string
  errorCounts: Array<{ noteName: string; count: number }>
  clefMode: SightReadingClefMode
  range: SightReadingRange
  treble: SightReadingClefStats
  bass: SightReadingClefStats
}

export interface UseSightReadingPracticeResult {
  status: SightReadingStatus
  clefMode: SightReadingClefMode
  range: SightReadingRange
  questionCount: SightReadingQuestionCount
  showNoteName: boolean
  currentNote: SightReadingNote | null
  currentInput: string
  currentInputMidiNumber: number | null
  result: SightReadingResult
  completedQuestions: number
  correctCount: number
  wrongCount: number
  currentStreak: number
  bestStreak: number
  accuracy: number
  availableNotes: SightReadingNote[]
  report: SightReadingReport | null
  setClefMode: (clefMode: SightReadingClefMode) => void
  setRange: (range: SightReadingRange) => void
  setQuestionCount: (questionCount: SightReadingQuestionCount) => void
  setShowNoteName: (showNoteName: boolean) => void
  start: () => void
  reset: () => void
  nextQuestion: () => void
}

const CLEFS: SightReadingClef[] = ['treble', 'bass']

function calculateAccuracy(correct: number, wrong: number): number {
  const total = correct + wrong
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

function calculateClefAccuracy(stats: Omit<SightReadingClefStats, 'accuracy'>): SightReadingClefStats {
  return {
    ...stats,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
  }
}

function createClefCounter(): Record<SightReadingClef, number> {
  return {
    treble: 0,
    bass: 0
  }
}

function createEmptyErrorCounts(notes: SightReadingNote[]): Record<number, number> {
  return Object.fromEntries(Array.from(new Set(notes.map((note) => note.midiNumber))).map((midiNumber) => [midiNumber, 0]))
}

function createReport({
  bestStreak,
  clefCorrect,
  clefMode,
  clefTotals,
  clefWrong,
  correct,
  errorCounts,
  notes,
  questionCount,
  range,
  wrong
}: {
  bestStreak: number
  clefCorrect: Record<SightReadingClef, number>
  clefMode: SightReadingClefMode
  clefTotals: Record<SightReadingClef, number>
  clefWrong: Record<SightReadingClef, number>
  correct: number
  errorCounts: Record<number, number>
  notes: SightReadingNote[]
  questionCount: number
  range: SightReadingRange
  wrong: number
}): SightReadingReport {
  const uniqueNotes = Array.from(new Map(notes.map((note) => [note.midiNumber, note])).values())

  return {
    totalQuestions: questionCount,
    correct,
    wrong,
    accuracy: calculateAccuracy(correct, wrong),
    bestStreak,
    mostMissedNote: getMostMissedNote(errorCounts),
    errorCounts: uniqueNotes.map((note) => ({
      noteName: note.noteName,
      count: errorCounts[note.midiNumber] ?? 0
    })),
    clefMode,
    range,
    treble: calculateClefAccuracy({
      total: clefTotals.treble,
      correct: clefCorrect.treble,
      wrong: clefWrong.treble
    }),
    bass: calculateClefAccuracy({
      total: clefTotals.bass,
      correct: clefCorrect.bass,
      wrong: clefWrong.bass
    })
  }
}

export function useSightReadingPractice(latestMidiEvent: MidiEventRecord | null): UseSightReadingPracticeResult {
  const [status, setStatus] = useState<SightReadingStatus>('idle')
  const [clefMode, setClefModeState] = useState<SightReadingClefMode>('treble')
  const [range, setRangeState] = useState<SightReadingRange>('basic')
  const [questionCount, setQuestionCountState] = useState<SightReadingQuestionCount>(20)
  const [showNoteName, setShowNoteName] = useState(true)
  const [currentNote, setCurrentNote] = useState<SightReadingNote | null>(null)
  const [currentInput, setCurrentInput] = useState('')
  const [currentInputMidiNumber, setCurrentInputMidiNumber] = useState<number | null>(null)
  const [result, setResult] = useState<SightReadingResult>(null)
  const [completedQuestions, setCompletedQuestions] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [report, setReport] = useState<SightReadingReport | null>(null)

  const lastHandledEventRef = useRef<number | null>(null)
  const practiceStartedAtRef = useRef<number | null>(null)
  const isAdvancingRef = useRef(false)
  const currentHadErrorRef = useRef(false)
  const nextTimerRef = useRef<number | null>(null)
  const activeClefModeRef = useRef<SightReadingClefMode>('treble')
  const activeRangeRef = useRef<SightReadingRange>('basic')
  const activeNotesRef = useRef<SightReadingNote[]>(getSightReadingNotes({ clefMode: 'treble', range: 'basic' }))
  const completedQuestionsRef = useRef(0)
  const correctCountRef = useRef(0)
  const wrongCountRef = useRef(0)
  const currentStreakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const errorCountsRef = useRef<Record<number, number>>(createEmptyErrorCounts(activeNotesRef.current))
  const clefTotalsRef = useRef<Record<SightReadingClef, number>>(createClefCounter())
  const clefCorrectRef = useRef<Record<SightReadingClef, number>>(createClefCounter())
  const clefWrongRef = useRef<Record<SightReadingClef, number>>(createClefCounter())

  const availableNotes = useMemo(() => getSightReadingNotes({ clefMode, range }), [clefMode, range])
  const accuracy = useMemo(() => calculateAccuracy(correctCount, wrongCount), [correctCount, wrongCount])

  const clearNextTimer = useCallback(() => {
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current)
      nextTimerRef.current = null
    }
  }, [])

  const resetCounters = useCallback((notes: SightReadingNote[]) => {
    const nextErrorCounts = createEmptyErrorCounts(notes)

    completedQuestionsRef.current = 0
    correctCountRef.current = 0
    wrongCountRef.current = 0
    currentStreakRef.current = 0
    bestStreakRef.current = 0
    errorCountsRef.current = nextErrorCounts
    clefTotalsRef.current = createClefCounter()
    clefCorrectRef.current = createClefCounter()
    clefWrongRef.current = createClefCounter()

    setCompletedQuestions(0)
    setCorrectCount(0)
    setWrongCount(0)
    setCurrentStreak(0)
    setBestStreak(0)
  }, [])

  const finishPractice = useCallback(
    (nextCorrect: number, nextWrong: number, nextBestStreak: number, nextErrorCounts: Record<number, number>) => {
      clearNextTimer()
      isAdvancingRef.current = false
      practiceStartedAtRef.current = null
      setStatus('finished')
      setCurrentNote(null)
      setResult(null)
      setCurrentInput('')
      setCurrentInputMidiNumber(null)
      setReport(
        createReport({
          bestStreak: nextBestStreak,
          clefCorrect: clefCorrectRef.current,
          clefMode: activeClefModeRef.current,
          clefTotals: clefTotalsRef.current,
          clefWrong: clefWrongRef.current,
          correct: nextCorrect,
          errorCounts: nextErrorCounts,
          notes: activeNotesRef.current,
          questionCount,
          range: activeRangeRef.current,
          wrong: nextWrong
        })
      )
    },
    [clearNextTimer, questionCount]
  )

  const generateNextQuestion = useCallback(() => {
    setCurrentNote((previousNote) =>
      getRandomSightReadingNote(
        {
          clefMode: activeClefModeRef.current,
          range: activeRangeRef.current
        },
        previousNote
      )
    )
    setCurrentInput('')
    setCurrentInputMidiNumber(null)
    setResult(null)
    isAdvancingRef.current = false
    currentHadErrorRef.current = false
  }, [])

  const completeCurrentQuestion = useCallback((note: SightReadingNote, firstTryCorrect: boolean) => {
    const nextCompleted = completedQuestionsRef.current + 1
    completedQuestionsRef.current = nextCompleted
    clefTotalsRef.current = {
      ...clefTotalsRef.current,
      [note.clef]: clefTotalsRef.current[note.clef] + 1
    }
    setCompletedQuestions(nextCompleted)

    if (firstTryCorrect) {
      const nextCorrect = correctCountRef.current + 1
      const nextStreak = currentStreakRef.current + 1
      const nextBestStreak = Math.max(bestStreakRef.current, nextStreak)

      correctCountRef.current = nextCorrect
      currentStreakRef.current = nextStreak
      bestStreakRef.current = nextBestStreak
      clefCorrectRef.current = {
        ...clefCorrectRef.current,
        [note.clef]: clefCorrectRef.current[note.clef] + 1
      }

      setCorrectCount(nextCorrect)
      setCurrentStreak(nextStreak)
      setBestStreak(nextBestStreak)
    } else {
      currentStreakRef.current = 0
      setCurrentStreak(0)
    }

    return nextCompleted
  }, [])

  const nextQuestion = useCallback(() => {
    clearNextTimer()
    isAdvancingRef.current = false
    if (status !== 'running' || !currentNote) {
      return
    }

    if (currentHadErrorRef.current) {
      const nextCompleted = completeCurrentQuestion(currentNote, false)

      if (nextCompleted >= questionCount) {
        finishPractice(correctCountRef.current, wrongCountRef.current, bestStreakRef.current, errorCountsRef.current)
        return
      }
    }

    generateNextQuestion()
  }, [
    clearNextTimer,
    completeCurrentQuestion,
    currentNote,
    finishPractice,
    generateNextQuestion,
    questionCount,
    status
  ])

  const reset = useCallback(() => {
    clearNextTimer()
    isAdvancingRef.current = false
    practiceStartedAtRef.current = null
    currentHadErrorRef.current = false
    lastHandledEventRef.current = null
    setStatus('idle')
    setCurrentNote(null)
    setCurrentInput('')
    setCurrentInputMidiNumber(null)
    setResult(null)
    resetCounters(getSightReadingNotes({ clefMode, range }))
    setReport(null)
  }, [clearNextTimer, clefMode, range, resetCounters])

  const start = useCallback(() => {
    const nextNotes = getSightReadingNotes({ clefMode, range })

    clearNextTimer()
    isAdvancingRef.current = false
    practiceStartedAtRef.current = Date.now()
    activeClefModeRef.current = clefMode
    activeRangeRef.current = range
    activeNotesRef.current = nextNotes
    currentHadErrorRef.current = false
    lastHandledEventRef.current = null
    setStatus('running')
    setCurrentInput('')
    setCurrentInputMidiNumber(null)
    setResult(null)
    resetCounters(nextNotes)
    setReport(null)
    setCurrentNote(getRandomSightReadingNote({ clefMode, range }))
  }, [clearNextTimer, clefMode, range, resetCounters])

  const setClefMode = useCallback(
    (nextClefMode: SightReadingClefMode) => {
      if (status === 'running') {
        return
      }

      setClefModeState(nextClefMode)
    },
    [status]
  )

  const setRange = useCallback(
    (nextRange: SightReadingRange) => {
      if (status === 'running') {
        return
      }

      setRangeState(nextRange)
    },
    [status]
  )

  const setQuestionCount = useCallback(
    (nextQuestionCount: SightReadingQuestionCount) => {
      if (status === 'running') {
        return
      }

      setQuestionCountState(nextQuestionCount)
    },
    [status]
  )

  const setShowNoteNameValue = useCallback((nextShowNoteName: boolean) => {
    setShowNoteName(nextShowNoteName)
  }, [])

  useEffect(() => {
    return () => {
      clearNextTimer()
    }
  }, [clearNextTimer])

  useEffect(() => {
    if (status !== 'running' || !currentNote || !latestMidiEvent || latestMidiEvent.type !== 'noteOn') {
      return
    }

    if (isAdvancingRef.current) {
      return
    }

    if (practiceStartedAtRef.current !== null && latestMidiEvent.timestamp < practiceStartedAtRef.current) {
      return
    }

    if (typeof latestMidiEvent.midiNumber !== 'number') {
      return
    }

    if (lastHandledEventRef.current === latestMidiEvent.timestamp) {
      return
    }

    lastHandledEventRef.current = latestMidiEvent.timestamp

    const inputName = latestMidiEvent.noteName || midiNumberToNoteName(latestMidiEvent.midiNumber)

    setCurrentInput(inputName)
    setCurrentInputMidiNumber(latestMidiEvent.midiNumber)

    if (latestMidiEvent.midiNumber !== currentNote.midiNumber) {
      setResult('wrong_note')

      if (!currentHadErrorRef.current) {
        currentHadErrorRef.current = true
        const nextWrong = wrongCountRef.current + 1
        const nextErrorCounts = {
          ...errorCountsRef.current,
          [currentNote.midiNumber]: (errorCountsRef.current[currentNote.midiNumber] ?? 0) + 1
        }

        wrongCountRef.current = nextWrong
        currentStreakRef.current = 0
        errorCountsRef.current = nextErrorCounts
        clefWrongRef.current = {
          ...clefWrongRef.current,
          [currentNote.clef]: clefWrongRef.current[currentNote.clef] + 1
        }
        setWrongCount(nextWrong)
        setCurrentStreak(0)
      }

      return
    }

    setResult('correct')

    const nextCompleted = completeCurrentQuestion(currentNote, !currentHadErrorRef.current)

    if (nextCompleted >= questionCount) {
      finishPractice(correctCountRef.current, wrongCountRef.current, bestStreakRef.current, errorCountsRef.current)
      return
    }

    isAdvancingRef.current = true
    clearNextTimer()
    nextTimerRef.current = window.setTimeout(() => {
      isAdvancingRef.current = false
      generateNextQuestion()
    }, 500)
  }, [
    clearNextTimer,
    completeCurrentQuestion,
    currentNote,
    finishPractice,
    generateNextQuestion,
    latestMidiEvent,
    questionCount,
    status
  ])

  return {
    status,
    clefMode,
    range,
    questionCount,
    showNoteName,
    currentNote,
    currentInput,
    currentInputMidiNumber,
    result,
    completedQuestions,
    correctCount,
    wrongCount,
    currentStreak,
    bestStreak,
    accuracy,
    availableNotes,
    report,
    setClefMode,
    setRange,
    setQuestionCount,
    setShowNoteName: setShowNoteNameValue,
    start,
    reset,
    nextQuestion
  }
}

export { CLEF_LABELS, RANGE_LABELS }
export type { SightReadingClefMode, SightReadingRange }
