import type { MajorKeyId } from './musicKeySignatures'
import {
  SIGHT_READING_MIDI_RANGES,
  createSightReadingNote,
  isDiatonicMidiNumber,
  type SightReadingNote,
  type SightReadingStaffMode
} from './sightReadingNotes'
import type { SightReadingQuestionCount } from './sightReadingSettings'

export type SightReadingDoubleIntervalId =
  | 'minorThird'
  | 'majorThird'
  | 'perfectFifth'
  | 'minorSixth'
  | 'majorSixth'
  | 'perfectFourth'
  | 'perfectOctave'

export type SightReadingDoubleLayout = 'treble' | 'bass' | 'cross'

export interface SightReadingDoubleInterval {
  id: SightReadingDoubleIntervalId
  label: '小三度' | '大三度' | '纯五度' | '小六度' | '大六度' | '纯四度' | '纯八度'
  semitones: 3 | 4 | 5 | 7 | 8 | 9 | 12
  weight: number
}

export interface SightReadingDoubleQuestion {
  notes: readonly [SightReadingNote, SightReadingNote]
  interval: SightReadingDoubleInterval
  layout: SightReadingDoubleLayout
  pairKey: string
}

/** Product-approved order also provides the deterministic largest-remainder tie break. */
export const SIGHT_READING_DOUBLE_INTERVALS: readonly SightReadingDoubleInterval[] = [
  { id: 'minorThird', label: '小三度', semitones: 3, weight: 18 },
  { id: 'majorThird', label: '大三度', semitones: 4, weight: 18 },
  { id: 'perfectFifth', label: '纯五度', semitones: 7, weight: 16 },
  { id: 'minorSixth', label: '小六度', semitones: 8, weight: 13 },
  { id: 'majorSixth', label: '大六度', semitones: 9, weight: 13 },
  { id: 'perfectFourth', label: '纯四度', semitones: 5, weight: 12 },
  { id: 'perfectOctave', label: '纯八度', semitones: 12, weight: 10 }
] as const

function shuffle<Value>(values: readonly Value[], random: () => number): Value[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const candidate = Math.floor(random() * (index + 1))
    const swapIndex = Math.max(0, Math.min(index, candidate))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/** Floors every weighted share, then assigns remaining slots by descending remainder. */
export function allocateDoubleIntervalQuotas(questionCount: SightReadingQuestionCount): Record<SightReadingDoubleIntervalId, number> {
  const shares = SIGHT_READING_DOUBLE_INTERVALS.map((interval, index) => {
    const exact = questionCount * interval.weight / 100
    return { interval, index, count: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let remaining = questionCount - shares.reduce((total, share) => total + share.count, 0)
  const ranked = [...shares].sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  for (let index = 0; index < remaining; index += 1) ranked[index].count += 1
  return Object.fromEntries(shares.map((share) => [share.interval.id, share.count])) as Record<SightReadingDoubleIntervalId, number>
}

export function createDoubleIntervalSchedule(
  questionCount: SightReadingQuestionCount,
  random: () => number
): SightReadingDoubleInterval[] {
  const quotas = allocateDoubleIntervalQuotas(questionCount)
  return shuffle(SIGHT_READING_DOUBLE_INTERVALS.flatMap((interval) => (
    Array.from({ length: quotas[interval.id] }, () => interval)
  )), random)
}

export function createDoubleLayoutSchedule(
  staffMode: SightReadingStaffMode,
  questionCount: SightReadingQuestionCount,
  random: () => number
): SightReadingDoubleLayout[] {
  if (staffMode !== 'grand') return Array.from({ length: questionCount }, () => staffMode)
  const crossCount = questionCount * 2 / 5
  const sameCountPerStaff = (questionCount - crossCount) / 2
  return shuffle([
    ...Array.from({ length: sameCountPerStaff }, () => 'treble' as const),
    ...Array.from({ length: sameCountPerStaff }, () => 'bass' as const),
    ...Array.from({ length: crossCount }, () => 'cross' as const)
  ], random)
}

export function enumerateDoubleNoteCandidates(
  keySignature: MajorKeyId,
  staffMode: SightReadingStaffMode,
  interval: SightReadingDoubleInterval,
  layout: SightReadingDoubleLayout
): Array<readonly [SightReadingNote, SightReadingNote]> {
  const [rangeStart, rangeEnd] = SIGHT_READING_MIDI_RANGES[staffMode]
  const pairs: Array<readonly [SightReadingNote, SightReadingNote]> = []
  for (let lower = rangeStart; lower + interval.semitones <= rangeEnd; lower += 1) {
    const upper = lower + interval.semitones
    if (!isDiatonicMidiNumber(lower, keySignature) || !isDiatonicMidiNumber(upper, keySignature)) continue
    const lowerClef = lower >= 60 ? 'treble' : 'bass'
    const upperClef = upper >= 60 ? 'treble' : 'bass'
    const matchesLayout = layout === 'cross'
      ? lowerClef === 'bass' && upperClef === 'treble'
      : lowerClef === layout && upperClef === layout
    if (!matchesLayout) continue
    pairs.push([
      createSightReadingNote(staffMode, lower, keySignature),
      createSightReadingNote(staffMode, upper, keySignature)
    ])
  }
  return pairs
}

function candidatesWithFallback(
  keySignature: MajorKeyId,
  staffMode: SightReadingStaffMode,
  requested: SightReadingDoubleInterval,
  layout: SightReadingDoubleLayout
): { interval: SightReadingDoubleInterval; candidates: Array<readonly [SightReadingNote, SightReadingNote]> } {
  const requestedCandidates = enumerateDoubleNoteCandidates(keySignature, staffMode, requested, layout)
  if (requestedCandidates.length > 0) return { interval: requested, candidates: requestedCandidates }

  // Deterministic safety fallback for future range changes: rotate through the approved
  // interval order and report the actual selected interval. Current supported matrix
  // is exhaustively tested and never reaches this branch.
  const requestedIndex = SIGHT_READING_DOUBLE_INTERVALS.findIndex((interval) => interval.id === requested.id)
  for (let offset = 1; offset < SIGHT_READING_DOUBLE_INTERVALS.length; offset += 1) {
    const interval = SIGHT_READING_DOUBLE_INTERVALS[(requestedIndex + offset) % SIGHT_READING_DOUBLE_INTERVALS.length]
    const candidates = enumerateDoubleNoteCandidates(keySignature, staffMode, interval, layout)
    if (candidates.length > 0) return { interval, candidates }
  }
  throw new Error(`No legal double-note candidate for ${keySignature}/${staffMode}/${layout}`)
}

export function createSightReadingDoubleQuestions(options: {
  keySignature: MajorKeyId
  staffMode: SightReadingStaffMode
  questionCount: SightReadingQuestionCount
  random: () => number
}): SightReadingDoubleQuestion[] {
  const intervals = createDoubleIntervalSchedule(options.questionCount, options.random)
  const layouts = createDoubleLayoutSchedule(options.staffMode, options.questionCount, options.random)
  const intervalAssignments: SightReadingDoubleInterval[] = Array(options.questionCount)
  const remainingIntervals = [...intervals]
  const assignmentOrder = layouts
    .map((layout, index) => ({ layout, index }))
    .sort((left, right) => Number(right.layout === 'cross') - Number(left.layout === 'cross'))
  for (const slot of assignmentOrder) {
    const availableIndex = remainingIntervals.findIndex((interval) => (
      enumerateDoubleNoteCandidates(options.keySignature, options.staffMode, interval, slot.layout).length > 0
    ))
    if (availableIndex < 0) {
      // The supported matrix has enough legal substitutions to preserve quotas;
      // this guard makes a future range change fail explicitly rather than loop.
      throw new Error(`Unable to assign double-note interval quota for ${options.keySignature}/${slot.layout}`)
    }
    intervalAssignments[slot.index] = remainingIntervals.splice(availableIndex, 1)[0]
  }
  const questions: SightReadingDoubleQuestion[] = []
  let previousPairKey: string | null = null

  for (let index = 0; index < options.questionCount; index += 1) {
    const selection = candidatesWithFallback(options.keySignature, options.staffMode, intervalAssignments[index], layouts[index])
    const shuffledCandidates = shuffle(selection.candidates, options.random)
    const selected = shuffledCandidates.find(([lower, upper]) => `${lower.midiNumber}:${upper.midiNumber}` !== previousPairKey)
      ?? shuffledCandidates[0]
    const pairKey = `${selected[0].midiNumber}:${selected[1].midiNumber}`
    questions.push({ notes: selected, interval: selection.interval, layout: layouts[index], pairKey })
    previousPairKey = pairKey
  }
  removeAdjacentPairRepeats(questions)
  return questions
}

function countAdjacentPairRepeats(questions: readonly SightReadingDoubleQuestion[]): number {
  let repeats = 0
  for (let index = 1; index < questions.length; index += 1) {
    if (questions[index].pairKey === questions[index - 1].pairKey) repeats += 1
  }
  return repeats
}

function removeAdjacentPairRepeats(questions: SightReadingDoubleQuestion[]): void {
  for (let attempt = 0; attempt < questions.length * questions.length; attempt += 1) {
    const repeatIndex = questions.findIndex((question, index) => (
      index > 0 && question.pairKey === questions[index - 1].pairKey
    ))
    if (repeatIndex < 0) return
    const before = countAdjacentPairRepeats(questions)
    let swapped = false
    for (let candidateIndex = 0; candidateIndex < questions.length; candidateIndex += 1) {
      if (candidateIndex === repeatIndex) continue
      ;[questions[repeatIndex], questions[candidateIndex]] = [questions[candidateIndex], questions[repeatIndex]]
      if (countAdjacentPairRepeats(questions) < before) {
        swapped = true
        break
      }
      ;[questions[repeatIndex], questions[candidateIndex]] = [questions[candidateIndex], questions[repeatIndex]]
    }
    if (!swapped) throw new Error('Unable to remove adjacent double-note pair repeat')
  }
  throw new Error('Double-note pair-repeat correction did not converge')
}

export function getDoubleIntervalForPitches(first: number, second: number): SightReadingDoubleInterval | null {
  const semitones = Math.abs(first - second)
  return SIGHT_READING_DOUBLE_INTERVALS.find((interval) => interval.semitones === semitones) ?? null
}
