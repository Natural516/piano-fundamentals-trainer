import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChordV2Difficulty, ChordV2InversionMode, ChordV2JudgeMode, ChordV2Quality, ChordV2Texture, VoicingSpec } from '../chordV2/chordV2Types'
import { CHORD_V2_DIFFICULTY_QUALITIES, type ChordV2Result } from '../chordV2/chordV2Types'
import { getChordV2Identity, formatChordSymbol } from '../chordV2/chordIdentity'
import { createArpeggioSequence, judgeVoicing, normalizeNotes, ArpeggioStateMachine, createDefaultVoicing } from '../chordV2/voicing'
import { pickBassConstraint, validateVoicing } from '../chordV2/chordValidator'
import { useMidiEventSubscription } from './useMidiEvents'

type ChordV2Status = 'idle' | 'running' | 'finished'
type ChordV2FeedbackType = 'correct' | 'wrong' | 'missing' | 'extra' | 'wrong_bass' | null

interface ChordV2Question {
  id: string
  symbol: string
  identity: ReturnType<typeof getChordV2Identity>
  voicing: VoicingSpec
  judgeMode: ChordV2JudgeMode
  texture: ChordV2Texture
  arpeggioSequence: number[] | null
}

interface ChordV2Feedback {
  type: ChordV2FeedbackType
  message: string
  missingNotes: number[]
  extraNotes: number[]
}

export interface ChordV2Report {
  totalQuestions: number
  correct: number
  wrong: number
  missing: number
  extra: number
  wrongBass: number
  accuracy: number
}

export interface UseChordV2PracticeResult {
  status: ChordV2Status
  questionCount: number
  setQuestionCount: (count: number) => void
  judgeMode: ChordV2JudgeMode
  setJudgeMode: (mode: ChordV2JudgeMode) => void
  inversionMode: ChordV2InversionMode
  setInversionMode: (mode: ChordV2InversionMode) => void
  texture: ChordV2Texture
  setTexture: (texture: ChordV2Texture) => void
  spacing: 'close' | 'open'
  setSpacing: (spacing: 'close' | 'open') => void
  difficulty: ChordV2Difficulty
  setDifficulty: (difficulty: ChordV2Difficulty) => void
  currentQuestion: ChordV2Question | null
  feedback: ChordV2Feedback | null
  inputNotes: number[]
  completedQuestions: number
  report: ChordV2Report
  isRunning: boolean
  start: () => void
  stop: () => void
  nextQuestion: () => void
}

const BLOCK_WINDOW_MS = 150
const ADVANCE_DELAY_MS = 600

function pickRandom<T>(items: T[], random = Math.random): T {
  return items[Math.floor(random() * items.length)]
}

function createQuestion(
  difficulty: ChordV2Difficulty,
  judgeMode: ChordV2JudgeMode,
  inversionMode: ChordV2InversionMode,
  texture: ChordV2Texture,
  spacing: 'close' | 'open',
  index: number
): ChordV2Question {
  const quality = pickRandom(CHORD_V2_DIFFICULTY_QUALITIES[difficulty])
  const root = Math.floor(Math.random() * 12)
  const identity = getChordV2Identity(root, quality)
  const bassConstraint = judgeMode === 'inversion'
    ? pickBassConstraint(root, quality, inversionMode)
    : root
  const registerLowest = judgeMode === 'identity' ? 48 + Math.floor(Math.random() * 12) : 48
  const voicing = createDefaultVoicing(identity, {
    registerLowest,
    registerHighest: 84,
    bassConstraint,
    spacing
  })
  const activeTexture = texture === 'composite' ? (index % 2 === 0 ? 'block' : 'arpeggio') : texture

  return {
    id: `chord-v2-${index}-${root}-${quality}`,
    symbol: formatChordSymbol(root, quality, judgeMode === 'inversion' ? bassConstraint : undefined),
    identity,
    voicing,
    judgeMode,
    texture: activeTexture,
    arpeggioSequence: activeTexture === 'arpeggio'
      ? createArpeggioSequence(voicing, 'up')
      : null
  }
}

/**
 * Fail-closed question creation: every voicing must pass the Chord Identity
 * validator before entering UI/playback/judgment. If generation fails after
 * retries, a deterministic root-position close voicing is used instead of
 * ever presenting an invalid target.
 */
function createValidatedQuestion(
  difficulty: ChordV2Difficulty,
  judgeMode: ChordV2JudgeMode,
  inversionMode: ChordV2InversionMode,
  texture: ChordV2Texture,
  spacing: 'close' | 'open',
  index: number
): ChordV2Question {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const question = createQuestion(difficulty, judgeMode, inversionMode, texture, spacing, index)
    if (validateVoicing(question.identity, question.voicing).valid) {
      return question
    }
  }

  const quality = (CHORD_V2_DIFFICULTY_QUALITIES[difficulty] ?? ['major'])[0]
  const identity = getChordV2Identity(0, quality)
  const voicing = createDefaultVoicing(identity, {
    registerLowest: 48,
    registerHighest: 84,
    bassConstraint: 0,
    spacing: 'close'
  })
  return {
    id: `chord-v2-${index}-0-${quality}`,
    symbol: formatChordSymbol(0, quality),
    identity,
    voicing,
    judgeMode,
    texture: texture === 'composite' ? 'block' : texture,
    arpeggioSequence: null
  }
}

function createFeedback(result: ChordV2Result, symbol: string, mode: ChordV2JudgeMode): ChordV2Feedback {
  if (result.judgement === 'correct') {
    return { type: 'correct', message: '正确', missingNotes: [], extraNotes: [] }
  }
  if (result.judgement === 'wrong_bass') {
    return { type: 'wrong_bass', message: '最低音与目标转位不一致', missingNotes: result.missingNotes, extraNotes: result.extraNotes }
  }
  if (result.judgement === 'missing') {
    return { type: 'missing', message: `缺少音级：${result.missingNotes.join(', ')}`, missingNotes: result.missingNotes, extraNotes: result.extraNotes }
  }
  if (result.judgement === 'extra') {
    return { type: 'extra', message: `多出音级：${result.extraNotes.join(', ')}`, missingNotes: result.missingNotes, extraNotes: result.extraNotes }
  }
  return { type: 'wrong', message: `${symbol} 音级不完整且有多余音`, missingNotes: result.missingNotes, extraNotes: result.extraNotes }
}

export function useChordV2Practice(): UseChordV2PracticeResult {
  const [status, setStatus] = useState<ChordV2Status>('idle')
  const [questionCount, setQuestionCountState] = useState(20)
  const [judgeMode, setJudgeModeState] = useState<ChordV2JudgeMode>('identity')
  const [inversionMode, setInversionModeState] = useState<ChordV2InversionMode>('all')
  const [texture, setTextureState] = useState<ChordV2Texture>('block')
  const [spacing, setSpacingState] = useState<'close' | 'open'>('close')
  const [difficulty, setDifficultyState] = useState<ChordV2Difficulty>(1)
  const [currentQuestion, setCurrentQuestion] = useState<ChordV2Question | null>(null)
  const [feedback, setFeedback] = useState<ChordV2Feedback | null>(null)
  const [inputNotes, setInputNotes] = useState<number[]>([])
  const [completedQuestions, setCompletedQuestions] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [missingCount, setMissingCount] = useState(0)
  const [extraCount, setExtraCount] = useState(0)
  const [wrongBassCount, setWrongBassCount] = useState(0)

  const statusRef = useRef(status)
  statusRef.current = status
  const questionIndexRef = useRef(0)
  const blockNotesRef = useRef<number[]>([])
  const blockTimerRef = useRef<number | null>(null)
  const advanceTimerRef = useRef<number | null>(null)
  const arpeggioMachineRef = useRef<ArpeggioStateMachine | null>(null)
  const lastEventIdRef = useRef<number | null>(null)
  const currentQuestionRef = useRef<ChordV2Question | null>(null)
  currentQuestionRef.current = currentQuestion
  const inputNotesRef = useRef<number[]>([])
  inputNotesRef.current = inputNotes

  const report: ChordV2Report = {
    totalQuestions: questionCount,
    correct: correctCount,
    wrong: wrongCount,
    missing: missingCount,
    extra: extraCount,
    wrongBass: wrongBassCount,
    accuracy: questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0
  }

  const clearTimers = useCallback(() => {
    if (blockTimerRef.current !== null) {
      window.clearTimeout(blockTimerRef.current)
      blockTimerRef.current = null
    }
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }, [])

  const recordOutcome = useCallback((question: ChordV2Question, fb: ChordV2Feedback, firstTry: boolean) => {
    const nextCompleted = completedQuestions + 1
    setCompletedQuestions(nextCompleted)
    if (fb.type === 'correct') {
      if (firstTry) setCorrectCount((value) => value + 1)
    } else {
      setWrongCount((value) => value + 1)
      if (fb.type === 'missing') setMissingCount((value) => value + 1)
      if (fb.type === 'extra') setExtraCount((value) => value + 1)
      if (fb.type === 'wrong_bass') setWrongBassCount((value) => value + 1)
    }
    void question
  }, [completedQuestions])

  const advance = useCallback(() => {
    blockNotesRef.current = []
    arpeggioMachineRef.current = null
    setInputNotes([])
    setFeedback(null)

    questionIndexRef.current += 1
    if (questionIndexRef.current >= questionCount) {
      setStatus('finished')
      setCurrentQuestion(null)
      return
    }

    setCurrentQuestion(createValidatedQuestion(difficulty, judgeMode, inversionMode, texture, spacing, questionIndexRef.current))
  }, [difficulty, inversionMode, judgeMode, questionCount, spacing, texture])

  const evaluateBlock = useCallback(() => {
    blockTimerRef.current = null
    const question = currentQuestion
    if (!question || statusRef.current !== 'running') {
      blockNotesRef.current = []
      return
    }

    const input = normalizeNotes(blockNotesRef.current)
    blockNotesRef.current = []
    setInputNotes(input)
    const result = judgeVoicing(question.voicing, input, question.judgeMode)
    const fb = createFeedback(result, question.symbol, question.judgeMode)
    setFeedback(fb)
    recordOutcome(question, fb, true)
    advanceTimerRef.current = window.setTimeout(advance, ADVANCE_DELAY_MS)
  }, [advance, currentQuestion, recordOutcome])

  const start = useCallback(() => {
    clearTimers()
    questionIndexRef.current = 0
    setCompletedQuestions(0)
    setCorrectCount(0)
    setWrongCount(0)
    setMissingCount(0)
    setExtraCount(0)
    setWrongBassCount(0)
    setStatus('running')
    setFeedback(null)
    setInputNotes([])
    setCurrentQuestion(createValidatedQuestion(difficulty, judgeMode, inversionMode, texture, spacing, 0))
  }, [clearTimers, difficulty, inversionMode, judgeMode, spacing, texture])

  const stop = useCallback(() => {
    clearTimers()
    setStatus('idle')
    setCurrentQuestion(null)
    setFeedback(null)
    setInputNotes([])
    setCompletedQuestions(0)
  }, [clearTimers])

  const nextQuestion = useCallback(() => {
    if (statusRef.current !== 'running') return
    clearTimers()
    advance()
  }, [advance, clearTimers])

  const recordOutcomeRef = useRef(recordOutcome)
  recordOutcomeRef.current = recordOutcome
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const evaluateBlockRef = useRef(evaluateBlock)
  evaluateBlockRef.current = evaluateBlock

  useMidiEventSubscription((event) => {
    const question = currentQuestionRef.current
    if (statusRef.current !== 'running' || !question) return
    if (event.type !== 'noteOn' || typeof event.midiNumber !== 'number') return
    if (lastEventIdRef.current !== null && event.id <= lastEventIdRef.current) return
    lastEventIdRef.current = event.id

    if (question.texture === 'arpeggio') {
      const machine = arpeggioMachineRef.current ?? new ArpeggioStateMachine(question.arpeggioSequence ?? [])
      arpeggioMachineRef.current = machine
      const result = machine.processNote(event.midiNumber)

      if (result === 'wrong') {
        setFeedback({ type: 'wrong', message: '分解顺序错误，请从当前目标音继续', missingNotes: [], extraNotes: [] })
        return
      }

      setInputNotes(normalizeNotes([...inputNotesRef.current, event.midiNumber]))
      if (result === 'complete') {
        const fb: ChordV2Feedback = { type: 'correct', message: '分解和弦顺序正确', missingNotes: [], extraNotes: [] }
        setFeedback(fb)
        recordOutcomeRef.current(question, fb, true)
        advanceTimerRef.current = window.setTimeout(() => advanceRef.current(), ADVANCE_DELAY_MS)
      }
      return
    }

    blockNotesRef.current = [...blockNotesRef.current, event.midiNumber]
    if (blockTimerRef.current === null) {
      blockTimerRef.current = window.setTimeout(() => evaluateBlockRef.current(), BLOCK_WINDOW_MS)
    }
  })

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  const setQuestionCount = useCallback((count: number) => {
    if (statusRef.current === 'running') return
    setQuestionCountState(Math.min(50, Math.max(5, Math.round(count))))
  }, [])

  const setJudgeMode = useCallback((mode: ChordV2JudgeMode) => {
    if (statusRef.current === 'running') return
    setJudgeModeState(mode)
  }, [])

  const setInversionMode = useCallback((mode: ChordV2InversionMode) => {
    if (statusRef.current === 'running') return
    setInversionModeState(mode)
  }, [])

  const setTexture = useCallback((nextTexture: ChordV2Texture) => {
    if (statusRef.current === 'running') return
    setTextureState(nextTexture)
  }, [])

  const setSpacing = useCallback((nextSpacing: 'close' | 'open') => {
    if (statusRef.current === 'running') return
    setSpacingState(nextSpacing)
  }, [])

  const setDifficulty = useCallback((nextDifficulty: ChordV2Difficulty) => {
    if (statusRef.current === 'running') return
    setDifficultyState(nextDifficulty)
  }, [])

  return {
    status,
    questionCount,
    setQuestionCount,
    judgeMode,
    setJudgeMode,
    inversionMode,
    setInversionMode,
    texture,
    setTexture,
    spacing,
    setSpacing,
    difficulty,
    setDifficulty,
    currentQuestion,
    feedback,
    inputNotes,
    completedQuestions,
    report,
    isRunning: status === 'running',
    start,
    stop,
    nextQuestion
  }
}
