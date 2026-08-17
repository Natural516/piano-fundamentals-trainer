export interface PracticeSegment {
  id: string
  scoreId: string
  title: string
  startMeasure: number
  endMeasure: number
  tempo: number
  tempoRatio: number
  handMode: 'left' | 'right' | 'both'
  practiceMode: 'wait' | 'realtime' | 'follow'
  loop: boolean
  countIn: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PracticeSegmentState {
  version: 1
  segments: PracticeSegment[]
}

export const PRACTICE_SEGMENT_STORAGE_KEY = 'score-practice-segments.v1'

export function createEmptySegmentState(): PracticeSegmentState {
  return { version: 1, segments: [] }
}

export function sanitizePracticeSegment(value: unknown): PracticeSegment | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PracticeSegment>
  if (typeof candidate.id !== 'string' || typeof candidate.scoreId !== 'string') return null

  return {
    id: candidate.id,
    scoreId: candidate.scoreId,
    title: typeof candidate.title === 'string' ? candidate.title : '未命名片段',
    startMeasure: normalizeNonNegative(candidate.startMeasure, 1),
    endMeasure: normalizeNonNegative(candidate.endMeasure, 1),
    tempo: normalizeTempo(candidate.tempo),
    tempoRatio: normalizeTempoRatio(candidate.tempoRatio),
    handMode: candidate.handMode === 'left' || candidate.handMode === 'right' || candidate.handMode === 'both'
      ? candidate.handMode
      : 'both',
    practiceMode: candidate.practiceMode === 'wait' || candidate.practiceMode === 'realtime' || candidate.practiceMode === 'follow'
      ? candidate.practiceMode
      : 'wait',
    loop: Boolean(candidate.loop),
    countIn: Boolean(candidate.countIn),
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString()
  }
}

export function migrateSegmentState(value: unknown): PracticeSegmentState {
  if (!value || typeof value !== 'object') return createEmptySegmentState()
  const candidate = value as Partial<PracticeSegmentState>
  const segments = Array.isArray(candidate.segments)
    ? candidate.segments.map(sanitizePracticeSegment).filter((segment): segment is PracticeSegment => segment !== null)
    : []
  return { version: 1, segments }
}

export function readPracticeSegments(storage: Pick<Storage, 'getItem'> = window.localStorage): PracticeSegmentState {
  try {
    const raw = storage.getItem(PRACTICE_SEGMENT_STORAGE_KEY)
    if (!raw) return createEmptySegmentState()
    return migrateSegmentState(JSON.parse(raw))
  } catch {
    return createEmptySegmentState()
  }
}

export function writePracticeSegments(
  state: PracticeSegmentState,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(PRACTICE_SEGMENT_STORAGE_KEY, JSON.stringify(migrateSegmentState(state)))
    return true
  } catch {
    return false
  }
}

export function upsertPracticeSegment(state: PracticeSegmentState, segment: PracticeSegment): PracticeSegmentState {
  const safe = sanitizePracticeSegment(segment)
  if (!safe) return state
  const others = state.segments.filter((existing) => existing.id !== safe.id)
  return {
    version: 1,
    segments: [...others, safe].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }
}

function normalizeNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
}

function normalizeTempo(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(240, Math.max(20, Math.round(value))) : 60
}

function normalizeTempoRatio(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(2, Math.max(0.25, value)) : 1
}
