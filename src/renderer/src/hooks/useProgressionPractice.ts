import { useCallback, useEffect, useRef, useState } from 'react'
import { ArpeggioStateMachine, judgeVoicing, normalizeNotes } from '../chordV2/voicing'
import { buildProgression, getProgressionStepSymbol } from '../harmony/progressions'
import type { ProgressionId, ProgressionModel, ProgressionStepModel } from '../harmony/progressionTypes'
import { useMidiEventSubscription } from './useMidiEvents'

type ProgressionStatus = 'idle' | 'running' | 'finished'

export interface ProgressionPracticeReport {
  totalSteps: number
  correct: number
  wrong: number
  accuracy: number
  hardestStep: string
}

export interface UseProgressionPracticeResult {
  status: ProgressionStatus
  progressionId: ProgressionId
  setProgressionId: (id: ProgressionId) => void
  keyPitchClass: number
  setKeyPitchClass: (key: number) => void
  texture: 'block' | 'arpeggio'
  setTexture: (texture: 'block' | 'arpeggio') => void
  progression: ProgressionModel | null
  currentStep: ProgressionStepModel | null
  currentStepIndex: number
  feedback: string | null
  inputNotes: number[]
  stepResults: Array<{ step: string; result: 'correct' | 'wrong' }>
  report: ProgressionPracticeReport
  isRunning: boolean
  start: () => void
  stop: () => void
}

const BLOCK_WINDOW_MS = 150

export function useProgressionPractice(): UseProgressionPracticeResult {
  const [status, setStatus] = useState<ProgressionStatus>('idle')
  const [progressionId, setProgressionIdState] = useState<ProgressionId>('4536251')
  const [keyPitchClass, setKeyPitchClassState] = useState(0)
  const [texture, setTextureState] = useState<'block' | 'arpeggio'>('block')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [inputNotes, setInputNotes] = useState<number[]>([])
  const [stepResults, setStepResults] = useState<Array<{ step: string; result: 'correct' | 'wrong' }>>([])

  const statusRef = useRef(status)
  statusRef.current = status
  const progressionRef = useRef<ProgressionModel | null>(null)
  const stepIndexRef = useRef(0)
  const blockNotesRef = useRef<number[]>([])
  const blockTimerRef = useRef<number | null>(null)
  const arpeggioMachineRef = useRef<ArpeggioStateMachine | null>(null)
  const lastEventIdRef = useRef<number | null>(null)
  const progression = progressionRef.current ?? buildProgression(progressionId, keyPitchClass)
  progressionRef.current = progression

  const report: ProgressionPracticeReport = {
    totalSteps: progression.steps.length,
    correct: stepResults.filter((entry) => entry.result === 'correct').length,
    wrong: stepResults.filter((entry) => entry.result === 'wrong').length,
    accuracy: progression.steps.length > 0
      ? Math.round((stepResults.filter((entry) => entry.result === 'correct').length / progression.steps.length) * 100)
      : 0,
    hardestStep: (() => {
      const counts = new Map<string, number>()
      for (const entry of stepResults) {
        if (entry.result === 'wrong') counts.set(entry.step, (counts.get(entry.step) ?? 0) + 1)
      }
      const hardest = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]
      return hardest?.[0] ?? '暂无'
    })()
  }

  const currentStep = progression.steps[currentStepIndex] ?? null

  const advance = useCallback(() => {
    blockNotesRef.current = []
    arpeggioMachineRef.current = null
    setInputNotes([])
    setFeedback(null)
    stepIndexRef.current += 1
    setCurrentStepIndex(stepIndexRef.current)
  }, [])

  const evaluateBlock = useCallback(() => {
    blockTimerRef.current = null
    const activeProgression = progressionRef.current
    const step = activeProgression?.steps[stepIndexRef.current]
    if (!step || statusRef.current !== 'running') {
      blockNotesRef.current = []
      return
    }

    const input = normalizeNotes(blockNotesRef.current)
    blockNotesRef.current = []
    setInputNotes(input)
    const correct = judgeVoicing(step.voicing, input, 'inversion').judgement === 'correct'
    const symbol = getProgressionStepSymbol(step)
    setFeedback(correct ? '正确' : `错误：${symbol}（最低音或音级不符）`)
    setStepResults((entries) => [...entries, { step: symbol, result: correct ? 'correct' : 'wrong' }])
    window.setTimeout(() => {
      if (statusRef.current !== 'running') return
      if (stepIndexRef.current + 1 >= (progressionRef.current?.steps.length ?? 0)) {
        setStatus('finished')
      } else {
        advance()
      }
    }, 600)
  }, [advance])

  const start = useCallback(() => {
    const activeProgression = buildProgression(progressionId, keyPitchClass)
    progressionRef.current = activeProgression
    stepIndexRef.current = 0
    setCurrentStepIndex(0)
    setStepResults([])
    setFeedback(null)
    setInputNotes([])
    blockNotesRef.current = []
    arpeggioMachineRef.current = null
    setStatus('running')
  }, [keyPitchClass, progressionId])

  const stop = useCallback(() => {
    if (blockTimerRef.current !== null) {
      window.clearTimeout(blockTimerRef.current)
      blockTimerRef.current = null
    }
    setStatus('idle')
    setCurrentStepIndex(0)
    stepIndexRef.current = 0
    setFeedback(null)
    setInputNotes([])
    setStepResults([])
  }, [])

  const textureRef = useRef(texture)
  textureRef.current = texture
  const inputNotesRef = useRef(inputNotes)
  inputNotesRef.current = inputNotes
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const evaluateBlockRef = useRef(evaluateBlock)
  evaluateBlockRef.current = evaluateBlock

  useMidiEventSubscription((event) => {
    if (statusRef.current !== 'running') return
    if (event.type !== 'noteOn' || typeof event.midiNumber !== 'number') return
    if (lastEventIdRef.current !== null && event.id <= lastEventIdRef.current) return
    lastEventIdRef.current = event.id

    const step = progressionRef.current?.steps[stepIndexRef.current]
    if (!step) return

    if (textureRef.current === 'arpeggio') {
      const sequence = step.voicing.exactNotes
      const machine = arpeggioMachineRef.current ?? new ArpeggioStateMachine(sequence)
      arpeggioMachineRef.current = machine
      const result = machine.processNote(event.midiNumber)
      if (result === 'wrong') {
        setFeedback('分解顺序错误，请从当前目标音继续')
        return
      }
      setInputNotes(normalizeNotes([...inputNotesRef.current, event.midiNumber]))
      if (result === 'complete') {
        const symbol = getProgressionStepSymbol(step)
        setFeedback('分解和弦顺序正确')
        setStepResults((entries) => [...entries, { step: symbol, result: 'correct' }])
        window.setTimeout(() => {
          if (statusRef.current !== 'running') return
          if (stepIndexRef.current + 1 >= (progressionRef.current?.steps.length ?? 0)) {
            setStatus('finished')
          } else {
            advanceRef.current()
          }
        }, 600)
      }
      return
    }

    blockNotesRef.current = [...blockNotesRef.current, event.midiNumber]
    if (blockTimerRef.current === null) {
      blockTimerRef.current = window.setTimeout(() => evaluateBlockRef.current(), BLOCK_WINDOW_MS)
    }
  })

  const setProgressionId = useCallback((id: ProgressionId) => {
    if (statusRef.current === 'running') return
    setProgressionIdState(id)
    progressionRef.current = buildProgression(id, keyPitchClass)
  }, [keyPitchClass])

  const setKeyPitchClass = useCallback((key: number) => {
    if (statusRef.current === 'running') return
    setKeyPitchClassState(((key % 12) + 12) % 12)
    progressionRef.current = buildProgression(progressionId, ((key % 12) + 12) % 12)
  }, [progressionId])

  const setTexture = useCallback((nextTexture: 'block' | 'arpeggio') => {
    if (statusRef.current === 'running') return
    setTextureState(nextTexture)
  }, [])

  useEffect(() => {
    return () => {
      if (blockTimerRef.current !== null) {
        window.clearTimeout(blockTimerRef.current)
      }
    }
  }, [])

  return {
    status,
    progressionId,
    setProgressionId,
    keyPitchClass,
    setKeyPitchClass,
    texture,
    setTexture,
    progression,
    currentStep,
    currentStepIndex,
    feedback,
    inputNotes,
    stepResults,
    report,
    isRunning: status === 'running',
    start,
    stop
  }
}
