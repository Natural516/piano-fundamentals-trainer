import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLastMidiEventId } from '../midi/midiEventBus'
import type { MidiEventRecord } from '../types'
import {
  CHORD_INPUT_WINDOW_MS,
  CHORD_INVERSION_MODE_LABELS,
  CHORD_QUALITY_LABELS,
  CHORD_QUESTION_COUNTS,
  getChordTargets,
  getRandomChordTarget
} from '../utils/chordPatterns'
import { getSeventhChordTargets } from '../utils/chordDefinitions'
import { createProgressionTargets } from '../utils/chordProgressions'
import { CHORD_TRAINING_CONTENTS, getChordTrainingContent } from '../utils/chordTrainingContents'
import type {
  ChordFeedback,
  ChordInversionMode,
  ChordPracticeReport,
  ChordPracticeStatus,
  ChordQualityFilter,
  ChordQuestionCount,
  ChordTarget,
  ChordKeySignature,
  ChordTrainingContent,
  SeventhChordQualityFilter
} from '../utils/chordTypes'
import {
  createArpeggioFeedback,
  createChordFeedback,
  normalizeNotes
} from '../utils/chordFeedback'
import { useMetronome } from './useMetronome'
import { useMetronomeSound } from './useMetronomeSound'
import { normalizeMajorKeyId } from '../utils/musicKeySignatures'
import { useMidiEventSubscription } from './useMidiEvents'

interface UseChordPracticeResult {
  status: ChordPracticeStatus
  questionCount: ChordQuestionCount
  questionCountOptions: readonly ChordQuestionCount[]
  setQuestionCount: (questionCount: ChordQuestionCount) => void
  qualityFilter: ChordQualityFilter
  setQualityFilter: (qualityFilter: ChordQualityFilter) => void
  seventhQualityFilter: SeventhChordQualityFilter
  setSeventhQualityFilter: (qualityFilter: SeventhChordQualityFilter) => void
  inversionMode: ChordInversionMode
  setInversionMode: (inversionMode: ChordInversionMode) => void
  contents: ChordTrainingContent[]
  selectedContentId: string
  selectedContent: ChordTrainingContent
  setSelectedContentId: (contentId: string) => void
  keySignature: ChordKeySignature
  setKeySignature: (keySignature: ChordKeySignature) => void
  roundCount: number
  setRoundCount: (roundCount: number) => void
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
  isPaused: boolean
  isLocked: boolean
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  nextQuestion: () => void
}

const CHORD_ADVANCE_DELAY_MS = 500

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
  averageAttempts: 0,
  contentName: '调内自然三和弦',
  keySignature: 'C',
  roundCount: 1
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
  wrongNoteCount,
  contentName,
  keySignature,
  roundCount
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
  contentName: string
  keySignature: string
  roundCount: number
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
    averageAttempts: completedQuestions > 0 ? Math.round((totalAttempts / completedQuestions) * 10) / 10 : 0,
    contentName,
    keySignature,
    roundCount
  }
}

export function useChordPractice(): UseChordPracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [status, setStatus] = useState<ChordPracticeStatus>('idle')
  const [questionCount, setQuestionCountState] = useState<ChordQuestionCount>(20)
  const [qualityFilter, setQualityFilterState] = useState<ChordQualityFilter>('both')
  const [seventhQualityFilter, setSeventhQualityFilterState] = useState<SeventhChordQualityFilter>('all')
  const [inversionMode, setInversionModeState] = useState<ChordInversionMode>('root')
  const [selectedContentId, setSelectedContentIdState] = useState('triad-identification')
  const [keySignature, setKeySignatureState] = useState<ChordKeySignature>('C')
  const [roundCount, setRoundCountState] = useState(1)
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
  const [isPaused, setIsPaused] = useState(false)

  const currentTargetRef = useRef<ChordTarget | null>(null)
  const activePoolRef = useRef<ChordTarget[]>([])
  const activeSequenceRef = useRef<ChordTarget[]>([])
  const activeTargetCountRef = useRef<number>(questionCount)
  const arpeggioInputRef = useRef<number[]>([])
  const inputWindowTimerRef = useRef<number | null>(null)
  const advanceTimerRef = useRef<number | null>(null)
  const inputWindowDeadlineRef = useRef<number | null>(null)
  const inputWindowRemainingMsRef = useRef(CHORD_INPUT_WINDOW_MS)
  const advanceDeadlineRef = useRef<number | null>(null)
  const advanceRemainingMsRef = useRef(CHORD_ADVANCE_DELAY_MS)
  const inputWindowNotesRef = useRef<number[]>([])
  const isPausedRef = useRef(false)
  const statusRef = useRef(status)
  statusRef.current = status
  const isLockedRef = useRef(isLocked)
  isLockedRef.current = isLocked
  const practiceStartedAtRef = useRef<number | null>(null)
  const lastHandledEventIdRef = useRef<number | null>(null)
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

  const selectedContent = useMemo(() => getChordTrainingContent(selectedContentId), [selectedContentId])
  const chordPool = useMemo(() => {
    if (selectedContent.category === 'seventh') {
      return getSeventhChordTargets(inversionMode, seventhQualityFilter, keySignature)
    }
    if (selectedContent.progressionId) {
      return createProgressionTargets(selectedContent.progressionId, keySignature, selectedContent.inputStyle)
    }
    return getChordTargets(qualityFilter, inversionMode, keySignature)
  }, [inversionMode, keySignature, qualityFilter, selectedContent, seventhQualityFilter])

  const clearInputWindow = useCallback(() => {
    if (inputWindowTimerRef.current !== null) {
      window.clearTimeout(inputWindowTimerRef.current)
      inputWindowTimerRef.current = null
    }

    inputWindowDeadlineRef.current = null
    inputWindowRemainingMsRef.current = CHORD_INPUT_WINDOW_MS
    inputWindowNotesRef.current = []
    arpeggioInputRef.current = []
  }, [])

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }

    advanceDeadlineRef.current = null
    advanceRemainingMsRef.current = CHORD_ADVANCE_DELAY_MS
  }, [])

  const buildReport = useCallback(() => createReport({
    bestStreak: bestStreakRef.current,
    chordErrorCounts: chordErrorCountsRef.current,
    completedQuestions: completedQuestionsRef.current,
    correctCount: correctCountRef.current,
    extraCount: extraCountRef.current,
    missingCount: missingCountRef.current,
    noteMissingCounts: noteMissingCountsRef.current,
    questionCount: activeTargetCountRef.current,
    totalAttempts: totalAttemptsRef.current,
    wrongCount: wrongCountRef.current,
    wrongNoteCount: wrongNoteCountRef.current,
    contentName: selectedContent.name,
    keySignature,
    roundCount
  }), [keySignature, roundCount, selectedContent.name])

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
    isPausedRef.current = false
    setIsPaused(false)
    setIsLocked(false)
    setStatus('finished')
    setCurrentTarget(null)
    setReport(buildReport())
    metronome.stop()
  }, [buildReport, clearAdvanceTimer, clearInputWindow, metronome])

  const setNextTarget = useCallback(() => {
    const sequence = activeSequenceRef.current
    const nextTarget = sequence.length > 0
      ? sequence[completedQuestionsRef.current % sequence.length]
      : getRandomChordTarget(activePoolRef.current, currentTargetRef.current)
    currentTargetRef.current = nextTarget
    arpeggioInputRef.current = []
    currentHadErrorRef.current = false
    setCurrentTarget(nextTarget)
    setFeedback(null)
    setCurrentInputNotes([])
    setIsLocked(false)
  }, [])

  const scheduleNextTarget = useCallback((delayMs: number) => {
    clearAdvanceTimer()
    const safeDelayMs = Math.max(0, delayMs)
    advanceRemainingMsRef.current = safeDelayMs
    advanceDeadlineRef.current = Date.now() + safeDelayMs
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null
      advanceDeadlineRef.current = null

      if (isPausedRef.current) {
        advanceRemainingMsRef.current = 0
        return
      }

      advanceRemainingMsRef.current = CHORD_ADVANCE_DELAY_MS
      setNextTarget()
    }, safeDelayMs)
  }, [clearAdvanceTimer, setNextTarget])

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

      if (nextCompleted >= activeTargetCountRef.current) {
        finishPractice()
        return
      }

      if (!delayNext) {
        setNextTarget()
        return
      }

      setIsLocked(true)
      scheduleNextTarget(CHORD_ADVANCE_DELAY_MS)
    },
    [finishPractice, scheduleNextTarget, setNextTarget]
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
    inputWindowDeadlineRef.current = null

    if (isPausedRef.current) {
      return
    }

    inputWindowRemainingMsRef.current = CHORD_INPUT_WINDOW_MS
    const target = currentTargetRef.current

    if (!target || status !== 'running') {
      inputWindowNotesRef.current = []
      return
    }

    const inputNotes = normalizeNotes(inputWindowNotesRef.current)
    inputWindowNotesRef.current = []
    totalAttemptsRef.current += 1

    const nextFeedback = createChordFeedback(target, inputNotes)
    setFeedback(nextFeedback)
    setCurrentInputNotes(inputNotes)

    if (nextFeedback.type === 'correct') {
      completeQuestion(!currentHadErrorRef.current)
      return
    }

    recordFirstError(nextFeedback)
  }, [completeQuestion, recordFirstError, status])

  const scheduleInputWindow = useCallback((delayMs: number) => {
    if (inputWindowTimerRef.current !== null) return

    const safeDelayMs = Math.max(0, delayMs)
    inputWindowRemainingMsRef.current = safeDelayMs
    inputWindowDeadlineRef.current = Date.now() + safeDelayMs
    inputWindowTimerRef.current = window.setTimeout(evaluateInputWindow, safeDelayMs)
  }, [evaluateInputWindow])

  const setQuestionCount = useCallback((nextQuestionCount: ChordQuestionCount) => {
    if (status === 'running') return
    setQuestionCountState(nextQuestionCount)
  }, [status])

  const setQualityFilter = useCallback((nextQualityFilter: ChordQualityFilter) => {
    if (status === 'running') return
    setQualityFilterState(nextQualityFilter)
  }, [status])

  const setSeventhQualityFilter = useCallback((nextQualityFilter: SeventhChordQualityFilter) => {
    if (status === 'running') return
    setSeventhQualityFilterState(nextQualityFilter)
  }, [status])

  const setInversionMode = useCallback((nextInversionMode: ChordInversionMode) => {
    if (status === 'running') return
    setInversionModeState(nextInversionMode)
  }, [status])

  const setSelectedContentId = useCallback((nextContentId: string) => {
    if (status === 'running') return
    setSelectedContentIdState(getChordTrainingContent(nextContentId).id)
  }, [status])

  const setKeySignature = useCallback((nextKeySignature: ChordKeySignature) => {
    if (status === 'running') return
    setKeySignatureState(normalizeMajorKeyId(nextKeySignature))
  }, [status])

  const setRoundCount = useCallback((nextRoundCount: number) => {
    if (status === 'running') return
    setRoundCountState(Math.min(8, Math.max(1, Math.round(nextRoundCount))))
  }, [status])

  const setShowNoteNames = useCallback((nextShowNoteNames: boolean) => {
    setShowNoteNamesState(nextShowNoteNames)
  }, [])

  const setMetronomeEnabled = useCallback((nextEnabled: boolean) => {
    if (status === 'running') return
    setMetronomeEnabledState(nextEnabled)
  }, [status])

  const start = useCallback(() => {
    const nextPool = chordPool
    const isSequence = Boolean(selectedContent.progressionId)
    const nextSequence = isSequence ? nextPool : []
    const nextTargetCount = isSequence ? nextSequence.length * roundCount : questionCount

    clearInputWindow()
    clearAdvanceTimer()
    activePoolRef.current = nextPool
    activeSequenceRef.current = nextSequence
    activeTargetCountRef.current = nextTargetCount
    practiceStartedAtRef.current = Date.now()
    lastHandledEventIdRef.current = getLastMidiEventId()
    isPausedRef.current = false
    resetCounters()
    setStatus('running')
    setReport(null)
    setIsLocked(false)
    setIsPaused(false)

    if (metronomeEnabled) {
      void metronomeSound.prepare()
      metronome.restart()
    } else {
      metronome.stop()
    }

    const firstTarget = nextSequence[0] ?? getRandomChordTarget(nextPool)
    currentTargetRef.current = firstTarget
    setCurrentTarget(firstTarget)
    setFeedback(null)
    setCurrentInputNotes([])
  }, [
    clearAdvanceTimer,
    clearInputWindow,
    chordPool,
    metronome,
    metronomeEnabled,
    metronomeSound,
    questionCount,
    roundCount,
    selectedContent.progressionId,
    resetCounters
  ])

  const stop = useCallback(() => {
    clearInputWindow()
    clearAdvanceTimer()
    practiceStartedAtRef.current = null
    currentTargetRef.current = null
    activePoolRef.current = []
    activeSequenceRef.current = []
    isPausedRef.current = false
    setStatus('idle')
    setCurrentTarget(null)
    setFeedback(null)
    setCurrentInputNotes([])
    setIsLocked(false)
    setIsPaused(false)
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

  const pause = useCallback(() => {
    if (status !== 'running' || isPausedRef.current) return

    const now = Date.now()
    isPausedRef.current = true
    setIsPaused(true)

    if (inputWindowTimerRef.current !== null) {
      window.clearTimeout(inputWindowTimerRef.current)
      inputWindowTimerRef.current = null
      inputWindowRemainingMsRef.current = Math.max(0, (inputWindowDeadlineRef.current ?? now) - now)
      inputWindowDeadlineRef.current = null
    }

    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
      advanceRemainingMsRef.current = Math.max(0, (advanceDeadlineRef.current ?? now) - now)
      advanceDeadlineRef.current = null
    }

    if (metronomeEnabled && metronome.status === 'running') {
      metronome.pause()
    }
  }, [metronome, metronomeEnabled, status])

  const resume = useCallback(() => {
    if (status !== 'running' || !isPausedRef.current) return

    const inputWindowDelayMs = inputWindowRemainingMsRef.current
    const advanceDelayMs = advanceRemainingMsRef.current
    isPausedRef.current = false
    setIsPaused(false)
    lastHandledEventIdRef.current = getLastMidiEventId()

    if (inputWindowNotesRef.current.length > 0) {
      scheduleInputWindow(inputWindowDelayMs)
    }

    if (isLocked) {
      scheduleNextTarget(advanceDelayMs)
    }

    if (metronomeEnabled && metronome.status === 'paused') {
      metronome.start()
    }
  }, [isLocked, metronome, metronomeEnabled, scheduleInputWindow, scheduleNextTarget, status])

  useEffect(() => {
    return () => {
      clearInputWindow()
      clearAdvanceTimer()
    }
  }, [clearAdvanceTimer, clearInputWindow])

  const completeQuestionRef = useRef(completeQuestion)
  completeQuestionRef.current = completeQuestion
  const recordFirstErrorRef = useRef(recordFirstError)
  recordFirstErrorRef.current = recordFirstError
  const scheduleInputWindowRef = useRef(scheduleInputWindow)
  scheduleInputWindowRef.current = scheduleInputWindow

  const handleMidiEvent = useCallback((event: MidiEventRecord) => {
    if (event.type !== 'noteOn' || (event.velocity ?? 0) <= 0) {
      return
    }

    if (
      statusRef.current !== 'running' ||
      isPausedRef.current ||
      isLockedRef.current ||
      !currentTargetRef.current
    ) {
      return
    }

    if (practiceStartedAtRef.current !== null && event.timestamp < practiceStartedAtRef.current) {
      return
    }

    if (typeof event.midiNumber !== 'number') {
      return
    }

    if (lastHandledEventIdRef.current !== null && event.id <= lastHandledEventIdRef.current) {
      return
    }

    lastHandledEventIdRef.current = event.id

    const target = currentTargetRef.current
    if (target.inputStyle === 'arpeggio') {
      const sequence = target.sequenceNotes ?? target.notes
      const expectedNote = sequence[arpeggioInputRef.current.length]

      if (event.midiNumber !== expectedNote) {
        const nextFeedback = createArpeggioFeedback(target, [event.midiNumber], false)
        setFeedback(nextFeedback)
        setCurrentInputNotes([event.midiNumber])
        recordFirstErrorRef.current(nextFeedback)
        return
      }

      arpeggioInputRef.current = [...arpeggioInputRef.current, event.midiNumber]
      setCurrentInputNotes(arpeggioInputRef.current)
      setFeedback(null)

      if (arpeggioInputRef.current.length >= sequence.length) {
        totalAttemptsRef.current += 1
        setFeedback(createArpeggioFeedback(target, arpeggioInputRef.current, true))
        completeQuestionRef.current(!currentHadErrorRef.current)
      }
      return
    }

    inputWindowNotesRef.current = normalizeNotes([...inputWindowNotesRef.current, event.midiNumber])

    if (inputWindowTimerRef.current === null) {
      scheduleInputWindowRef.current(CHORD_INPUT_WINDOW_MS)
    }
  }, [])

  useMidiEventSubscription(handleMidiEvent)

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
    seventhQualityFilter,
    setSeventhQualityFilter,
    inversionMode,
    setInversionMode,
    contents: CHORD_TRAINING_CONTENTS,
    selectedContentId,
    selectedContent,
    setSelectedContentId,
    keySignature,
    setKeySignature,
    roundCount,
    setRoundCount,
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
    targetNotes: currentTarget?.inputStyle === 'arpeggio'
      ? [currentTarget.sequenceNotes?.[arpeggioInputRef.current.length] ?? currentTarget.notes[0]]
      : currentTarget?.notes ?? [],
    correctNotes,
    wrongNotes,
    isRunning: status === 'running',
    isPaused,
    isLocked,
    start,
    pause,
    resume,
    stop,
    nextQuestion
  }
}

export { CHORD_INVERSION_MODE_LABELS, CHORD_QUALITY_LABELS }
