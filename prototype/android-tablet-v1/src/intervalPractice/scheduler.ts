import {
  INTERVAL_PRACTICE_CANDIDATES,
  INTERVAL_TYPE_IDS,
  type IntervalPracticeQuestion,
  type IntervalPracticeZone,
  type IntervalTypeId
} from '../musicTheory/intervals'
import type { IntervalPracticeSettings, IntervalSchedulerState, ScheduledIntervalQuestion } from './types'

export type IntervalPracticeRng = () => number

const RECENT_ROOT_MIDI_LIMIT = 4
export const LOW_WEIGHT_INTERVAL_IDS: readonly IntervalTypeId[] = Object.freeze([
  'perfectUnison', 'diminishedSecond', 'augmentedSeventh', 'perfectOctave'
])
export const INTERVAL_LOW_WEIGHT = 11 as const
export const INTERVAL_NORMAL_WEIGHT = 18 as const
export const INTERVAL_WEIGHT_TOTAL = 440 as const

const lowWeightSet = new Set<IntervalTypeId>(LOW_WEIGHT_INTERVAL_IDS)
const INTERVAL_WEIGHT_BAG: readonly IntervalTypeId[] = Object.freeze(
  INTERVAL_TYPE_IDS.flatMap((id) => Array.from(
    { length: lowWeightSet.has(id) ? INTERVAL_LOW_WEIGHT : INTERVAL_NORMAL_WEIGHT },
    () => id
  ))
)
const ZONE_WEIGHT_BAG: readonly IntervalPracticeZone[] = Object.freeze([
  ...Array.from({ length: 14 }, () => 'CORE' as const),
  ...Array.from({ length: 3 }, () => 'LOW_EXTENSION' as const),
  ...Array.from({ length: 3 }, () => 'HIGH_EXTENSION' as const)
])

export function nextIntervalPracticeUnit(rng: IntervalPracticeRng): number {
  const value = rng()
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`RNG must return a finite value in [0, 1); received ${value}`)
  }
  return value
}

function shuffle<T>(source: readonly T[], rng: IntervalPracticeRng): T[] {
  const result = [...source]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextIntervalPracticeUnit(rng) * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function createIntervalSchedulerState(): IntervalSchedulerState {
  return Object.freeze({
    intervalBag: Object.freeze([]),
    zoneBag: Object.freeze([]),
    recentRootMidis: Object.freeze([]),
    previousIntervalId: null,
    issuedCount: 0
  })
}

export function getEligibleIntervalCandidates(
  intervalId: IntervalTypeId,
  zone: IntervalPracticeZone,
  includeAccidentalRoots: boolean
): readonly IntervalPracticeQuestion[] {
  return INTERVAL_PRACTICE_CANDIDATES[intervalId].filter((candidate) =>
    candidate.zone === zone && (includeAccidentalRoots || candidate.root.accidental === 0)
  )
}

interface CompatiblePair {
  readonly intervalIndex: number
  readonly zoneIndex: number
  readonly candidates: readonly IntervalPracticeQuestion[]
}

function findCompatiblePair(
  intervalBag: readonly IntervalTypeId[],
  zoneBag: readonly IntervalPracticeZone[],
  previousIntervalId: IntervalTypeId | null,
  includeAccidentalRoots: boolean,
  allowRepeat: boolean
): CompatiblePair | null {
  for (let zoneIndex = 0; zoneIndex < zoneBag.length; zoneIndex += 1) {
    for (let intervalIndex = 0; intervalIndex < intervalBag.length; intervalIndex += 1) {
      const intervalId = intervalBag[intervalIndex]
      if (!allowRepeat && intervalId === previousIntervalId) continue
      const candidates = getEligibleIntervalCandidates(intervalId, zoneBag[zoneIndex], includeAccidentalRoots)
      if (candidates.length > 0) return { intervalIndex, zoneIndex, candidates }
    }
  }
  return null
}

export function chooseCandidateWithRootSuppression(
  candidates: readonly IntervalPracticeQuestion[],
  recentRootMidis: readonly number[],
  rng: IntervalPracticeRng
): IntervalPracticeQuestion {
  if (candidates.length === 0) throw new RangeError('Cannot choose from an empty interval candidate list')
  const recentSet = new Set(recentRootMidis)
  const fullySuppressed = candidates.filter((candidate) => !recentSet.has(candidate.rootMidi))
  const previousRootMidi = recentRootMidis.length > 0 ? recentRootMidis[recentRootMidis.length - 1] : null
  const withoutImmediateRepeat = candidates.filter((candidate) => candidate.rootMidi !== previousRootMidi)
  const pool = fullySuppressed.length > 0
    ? fullySuppressed
    : withoutImmediateRepeat.length > 0 ? withoutImmediateRepeat : candidates
  return pool[Math.floor(nextIntervalPracticeUnit(rng) * pool.length)]
}

export function scheduleNextIntervalQuestion(
  state: IntervalSchedulerState,
  settings: IntervalPracticeSettings,
  rng: IntervalPracticeRng
): { readonly scheduler: IntervalSchedulerState; readonly question: ScheduledIntervalQuestion } {
  let intervalBag = [...state.intervalBag]
  let zoneBag = [...state.zoneBag]
  if (intervalBag.length === 0) intervalBag = shuffle(INTERVAL_WEIGHT_BAG, rng)
  if (zoneBag.length === 0) zoneBag = shuffle(ZONE_WEIGHT_BAG, rng)

  let pair = findCompatiblePair(intervalBag, zoneBag, state.previousIntervalId, settings.includeAccidentalRoots, false)
    ?? findCompatiblePair(intervalBag, zoneBag, state.previousIntervalId, settings.includeAccidentalRoots, true)
  if (!pair && intervalBag.length > 0 && zoneBag.length > 0) {
    intervalBag.push(...shuffle(INTERVAL_WEIGHT_BAG, rng))
    pair = findCompatiblePair(intervalBag, zoneBag, state.previousIntervalId, settings.includeAccidentalRoots, false)
      ?? findCompatiblePair(intervalBag, zoneBag, state.previousIntervalId, settings.includeAccidentalRoots, true)
  }
  if (!pair) throw new Error('No compatible interval and zone pair is available')

  const intervalId = intervalBag[pair.intervalIndex]
  const candidate = chooseCandidateWithRootSuppression(pair.candidates, state.recentRootMidis, rng)
  intervalBag.splice(pair.intervalIndex, 1)
  zoneBag.splice(pair.zoneIndex, 1)
  const issuedCount = state.issuedCount + 1
  const recentRootMidis = [...state.recentRootMidis, candidate.rootMidi].slice(-RECENT_ROOT_MIDI_LIMIT)
  const question: ScheduledIntervalQuestion = Object.freeze({
    ...candidate,
    questionId: `interval-question-${issuedCount}-${intervalId}-${candidate.rootMidi}-${candidate.targetMidi}`
  })
  return Object.freeze({
    question,
    scheduler: Object.freeze({
      intervalBag: Object.freeze(intervalBag),
      zoneBag: Object.freeze(zoneBag),
      recentRootMidis: Object.freeze(recentRootMidis),
      previousIntervalId: intervalId,
      issuedCount
    })
  })
}
