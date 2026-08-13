import {
  CURRICULUM_PROGRESS_VERSION,
  type CurriculumProgressState,
  type ExerciseProgress,
  type ExerciseProgressStatus
} from './curriculumTypes'

export const CURRICULUM_PROGRESS_STORAGE_KEY = 'curriculum-progress.v1'

const VALID_STATUSES: ExerciseProgressStatus[] = ['not-started', 'in-progress', 'close-to-mastery', 'mastered', 'review']

export function createEmptyProgress(): CurriculumProgressState {
  return {
    version: CURRICULUM_PROGRESS_VERSION,
    exercises: {}
  }
}

export function sanitizeExerciseProgress(value: unknown): ExerciseProgress | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ExerciseProgress>
  if (typeof candidate.exerciseId !== 'string') return null

  return {
    exerciseId: candidate.exerciseId,
    status: VALID_STATUSES.includes(candidate.status as ExerciseProgressStatus)
      ? (candidate.status as ExerciseProgressStatus)
      : 'not-started',
    currentTempo: normalizeNullableNumber(candidate.currentTempo),
    targetTempo: normalizeNullableNumber(candidate.targetTempo),
    maxStableTempo: normalizeNullableNumber(candidate.maxStableTempo),
    attempts: normalizeNonNegativeNumber(candidate.attempts),
    totalDurationMs: normalizeNonNegativeNumber(candidate.totalDurationMs),
    lastPracticedAt: typeof candidate.lastPracticedAt === 'string' ? candidate.lastPracticedAt : null,
    notes: typeof candidate.notes === 'string' ? candidate.notes : ''
  }
}

export function migrateProgressState(value: unknown): CurriculumProgressState {
  if (!value || typeof value !== 'object') {
    return createEmptyProgress()
  }

  const candidate = value as Partial<CurriculumProgressState>
  const exercises: Record<string, ExerciseProgress> = {}

  if (candidate.exercises && typeof candidate.exercises === 'object') {
    for (const [exerciseId, rawProgress] of Object.entries(candidate.exercises)) {
      const progress = sanitizeExerciseProgress(rawProgress)
      if (progress) {
        exercises[exerciseId] = { ...progress, exerciseId }
      }
    }
  }

  return {
    version: CURRICULUM_PROGRESS_VERSION,
    exercises
  }
}

export function readCurriculumProgress(storage: Pick<Storage, 'getItem'> = window.localStorage): CurriculumProgressState {
  try {
    const raw = storage.getItem(CURRICULUM_PROGRESS_STORAGE_KEY)
    if (!raw) return createEmptyProgress()
    return migrateProgressState(JSON.parse(raw))
  } catch {
    return createEmptyProgress()
  }
}

export function writeCurriculumProgress(
  state: CurriculumProgressState,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(CURRICULUM_PROGRESS_STORAGE_KEY, JSON.stringify(migrateProgressState(state)))
    return true
  } catch {
    return false
  }
}

export function recordExerciseAttempt(
  state: CurriculumProgressState,
  exerciseId: string,
  input: {
    status?: ExerciseProgressStatus
    currentTempo?: number | null
    targetTempo?: number | null
    maxStableTempo?: number | null
    durationMs?: number
    notes?: string
  }
): CurriculumProgressState {
  const existing = sanitizeExerciseProgress(state.exercises[exerciseId]) ?? {
    exerciseId,
    status: 'not-started' as ExerciseProgressStatus,
    currentTempo: null,
    targetTempo: null,
    maxStableTempo: null,
    attempts: 0,
    totalDurationMs: 0,
    lastPracticedAt: null,
    notes: ''
  }

  const next: ExerciseProgress = {
    ...existing,
    status: input.status ?? existing.status,
    currentTempo: input.currentTempo !== undefined ? input.currentTempo : existing.currentTempo,
    targetTempo: input.targetTempo !== undefined ? input.targetTempo : existing.targetTempo,
    maxStableTempo: input.maxStableTempo !== undefined ? input.maxStableTempo : existing.maxStableTempo,
    attempts: existing.attempts + 1,
    totalDurationMs: existing.totalDurationMs + Math.max(0, input.durationMs ?? 0),
    lastPracticedAt: new Date().toISOString(),
    notes: input.notes ?? existing.notes
  }

  if (next.status === 'not-started') {
    next.status = 'in-progress'
  }

  return {
    ...state,
    version: CURRICULUM_PROGRESS_VERSION,
    exercises: {
      ...state.exercises,
      [exerciseId]: next
    }
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}
