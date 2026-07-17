import type {
  JudgementResult,
  JudgementType,
  MidiInputEvent,
  PracticeReport,
  TargetEvent,
  ToleranceLevel
} from './practiceTypes'

export const TOLERANCE_MS: Record<ToleranceLevel, number> = {
  loose: 180,
  standard: 120,
  strict: 70
}

export const CHORD_GROUP_WINDOW_MS = 80

const judgementLabels: Record<JudgementType, string> = {
  correct: '正确',
  wrong_note: '错音',
  missing_note: '漏音',
  extra_note: '多音',
  early: '早弹',
  late: '晚弹',
  rest_error: '休止错误'
}

export function getToleranceMs(level: ToleranceLevel): number {
  return TOLERANCE_MS[level]
}

export function getJudgementLabel(type: JudgementType): string {
  return judgementLabels[type]
}

export function normalizeNotes(notes: number[]): number[] {
  return Array.from(new Set(notes)).sort((a, b) => a - b)
}

export function isSameNoteSet(a: number[], b: number[]): boolean {
  const left = normalizeNotes(a)
  const right = normalizeNotes(b)

  return left.length === right.length && left.every((note, index) => note === right[index])
}

export function getMissingNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const inputSet = new Set(inputNotes)
  return normalizeNotes(expectedNotes).filter((note) => !inputSet.has(note))
}

export function getExtraNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const expectedSet = new Set(expectedNotes)
  return normalizeNotes(inputNotes).filter((note) => !expectedSet.has(note))
}

export function isInOnTimeWindow(target: TargetEvent, relativeTimeMs: number, toleranceMs: number): boolean {
  return relativeTimeMs >= target.timeMs - toleranceMs && relativeTimeMs <= target.timeMs + toleranceMs
}

export function isInEarlyWindow(target: TargetEvent, relativeTimeMs: number, toleranceMs: number): boolean {
  return relativeTimeMs >= target.timeMs - toleranceMs * 2 && relativeTimeMs < target.timeMs - toleranceMs
}

export function isInLateWindow(target: TargetEvent, relativeTimeMs: number, toleranceMs: number): boolean {
  return relativeTimeMs > target.timeMs + toleranceMs && relativeTimeMs <= target.timeMs + toleranceMs * 2
}

export function isInsideRest(target: TargetEvent, relativeTimeMs: number): boolean {
  const durationMs = target.durationMs ?? 0
  return target.type === 'rest' && relativeTimeMs >= target.timeMs && relativeTimeMs < target.timeMs + durationMs
}

export function createJudgementResult(
  type: JudgementType,
  target: TargetEvent,
  inputNotes: number[],
  timestamp: number,
  timeOffsetMs?: number
): JudgementResult {
  const expectedNotes = normalizeNotes(target.notes)
  const cleanInputNotes = normalizeNotes(inputNotes)
  const label = getJudgementLabel(type)

  return {
    id: `${target.id}-${type}-${timestamp}`,
    targetId: target.id,
    type,
    target,
    expectedNotes,
    inputNotes: cleanInputNotes,
    timestamp,
    timeOffsetMs,
    label,
    message: createJudgementMessage(type, target, cleanInputNotes, timeOffsetMs)
  }
}

export function judgeSingleNoteTarget(
  target: TargetEvent,
  input: MidiInputEvent,
  relativeTimeMs: number,
  toleranceMs: number
): JudgementResult | null {
  if (target.type !== 'note' || typeof input.midiNumber !== 'number') {
    return null
  }

  const inputNotes = [input.midiNumber]
  const isExpectedNote = target.notes.includes(input.midiNumber)
  const offset = Math.round(relativeTimeMs - target.timeMs)

  if (isInOnTimeWindow(target, relativeTimeMs, toleranceMs)) {
    return createJudgementResult(isExpectedNote ? 'correct' : 'wrong_note', target, inputNotes, input.timestamp, offset)
  }

  if (isExpectedNote && isInEarlyWindow(target, relativeTimeMs, toleranceMs)) {
    return createJudgementResult('early', target, inputNotes, input.timestamp, offset)
  }

  if (isExpectedNote && isInLateWindow(target, relativeTimeMs, toleranceMs)) {
    return createJudgementResult('late', target, inputNotes, input.timestamp, offset)
  }

  return null
}

export function judgeChordTarget(
  target: TargetEvent,
  inputNotes: number[],
  firstRelativeTimeMs: number,
  timestamp: number,
  toleranceMs: number
): JudgementResult {
  const expectedNotes = normalizeNotes(target.notes)
  const cleanInputNotes = normalizeNotes(inputNotes)
  const missingNotes = getMissingNotes(expectedNotes, cleanInputNotes)
  const extraNotes = getExtraNotes(expectedNotes, cleanInputNotes)
  const offset = Math.round(firstRelativeTimeMs - target.timeMs)

  if (firstRelativeTimeMs < target.timeMs - toleranceMs) {
    return createJudgementResult('early', target, cleanInputNotes, timestamp, offset)
  }

  if (firstRelativeTimeMs > target.timeMs + toleranceMs) {
    return createJudgementResult('late', target, cleanInputNotes, timestamp, offset)
  }

  if (isSameNoteSet(expectedNotes, cleanInputNotes)) {
    return createJudgementResult('correct', target, cleanInputNotes, timestamp, offset)
  }

  if (extraNotes.length > 0 && missingNotes.length === 0) {
    return createJudgementResult('extra_note', target, cleanInputNotes, timestamp, offset)
  }

  if (extraNotes.length > 0 && missingNotes.length > 0) {
    return createJudgementResult('wrong_note', target, cleanInputNotes, timestamp, offset)
  }

  return createJudgementResult('missing_note', target, cleanInputNotes, timestamp, offset)
}

export function judgeRestTarget(target: TargetEvent, input: MidiInputEvent, relativeTimeMs: number): JudgementResult | null {
  if (target.type !== 'rest' || input.type !== 'noteOn' || !isInsideRest(target, relativeTimeMs)) {
    return null
  }

  return createJudgementResult('rest_error', target, typeof input.midiNumber === 'number' ? [input.midiNumber] : [], input.timestamp)
}

export function summarizeJudgements(results: JudgementResult[], totalTargets: number): PracticeReport {
  const report: PracticeReport = {
    totalTargets,
    correct: 0,
    wrongNote: 0,
    missingNote: 0,
    extraNote: 0,
    early: 0,
    late: 0,
    restError: 0,
    averageOffsetMs: 0,
    accuracy: 0
  }

  const offsets: number[] = []

  for (const result of results) {
    if (typeof result.timeOffsetMs === 'number') {
      offsets.push(result.timeOffsetMs)
    }

    if (result.type === 'correct') report.correct += 1
    if (result.type === 'wrong_note') report.wrongNote += 1
    if (result.type === 'missing_note') report.missingNote += 1
    if (result.type === 'extra_note') report.extraNote += 1
    if (result.type === 'early') report.early += 1
    if (result.type === 'late') report.late += 1
    if (result.type === 'rest_error') report.restError += 1
  }

  report.averageOffsetMs = offsets.length > 0
    ? Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length)
    : 0
  report.accuracy = totalTargets > 0 ? Math.round((report.correct / totalTargets) * 100) : 0

  return report
}

function createJudgementMessage(
  type: JudgementType,
  target: TargetEvent,
  inputNotes: number[],
  timeOffsetMs?: number
): string {
  const targetName = target.label || target.id
  const offsetText = typeof timeOffsetMs === 'number' ? `，偏移 ${timeOffsetMs}ms` : ''

  if (type === 'correct') return `${targetName} 正确${offsetText}`
  if (type === 'wrong_note') return `${targetName} 错音`
  if (type === 'missing_note') return `${targetName} 漏音`
  if (type === 'extra_note') return `${targetName} 多音：${inputNotes.join(', ')}`
  if (type === 'early') return `${targetName} 早弹${offsetText}`
  if (type === 'late') return `${targetName} 晚弹${offsetText}`
  return `${targetName} 休止位置有输入`
}
