export interface ScoreImportEntry {
  id: string
  title: string
  xml: string
  sourceType: 'musicxml' | 'mxl'
  importedAt: string
  tier: 'A' | 'B'
}

export interface ScoreImportState {
  version: 1
  scores: ScoreImportEntry[]
}

export const SCORE_IMPORT_STORAGE_KEY = 'piano-trainer.score-imports.v1'
const MAX_IMPORTED_SCORES = 20

export function createEmptyScoreImportState(): ScoreImportState {
  return { version: 1, scores: [] }
}

export function sanitizeScoreImport(value: unknown): ScoreImportEntry | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ScoreImportEntry>
  if (
    typeof candidate.title !== 'string' ||
    typeof candidate.xml !== 'string' ||
    (candidate.sourceType !== 'musicxml' && candidate.sourceType !== 'mxl')
  ) {
    return null
  }
  return {
    id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : candidate.title,
    title: candidate.title,
    xml: candidate.xml,
    sourceType: candidate.sourceType,
    importedAt: typeof candidate.importedAt === 'string' ? candidate.importedAt : new Date().toISOString(),
    tier: candidate.tier === 'A' || candidate.tier === 'B' ? candidate.tier : 'A'
  }
}

export function migrateScoreImportState(value: unknown): ScoreImportState {
  if (!value || typeof value !== 'object') return createEmptyScoreImportState()
  const candidate = value as Partial<ScoreImportState>
  const scores = Array.isArray(candidate.scores)
    ? candidate.scores.map(sanitizeScoreImport).filter((entry): entry is ScoreImportEntry => entry !== null)
    : []
  return { version: 1, scores: scores.slice(0, MAX_IMPORTED_SCORES) }
}

export function readScoreImports(storage: Pick<Storage, 'getItem'> = window.localStorage): ScoreImportState {
  try {
    const raw = storage.getItem(SCORE_IMPORT_STORAGE_KEY)
    if (!raw) return createEmptyScoreImportState()
    return migrateScoreImportState(JSON.parse(raw))
  } catch {
    return createEmptyScoreImportState()
  }
}

export function writeScoreImports(
  state: ScoreImportState,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(SCORE_IMPORT_STORAGE_KEY, JSON.stringify(migrateScoreImportState(state)))
    return true
  } catch {
    return false
  }
}

export function upsertScoreImport(state: ScoreImportState, entry: ScoreImportEntry): ScoreImportState {
  const safe = sanitizeScoreImport(entry)
  if (!safe) return state
  const others = state.scores.filter((existing) => existing.id !== safe.id)
  return {
    version: 1,
    scores: [safe, ...others].slice(0, MAX_IMPORTED_SCORES)
  }
}

export function listScoreImports(storage: Pick<Storage, 'getItem'> = window.localStorage): ScoreImportEntry[] {
  return readScoreImports(storage).scores
}

export function getScoreImport(id: string, storage: Pick<Storage, 'getItem'> = window.localStorage): ScoreImportEntry | null {
  return readScoreImports(storage).scores.find((entry) => entry.id === id) ?? null
}

export function removeScoreImport(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage
): ScoreImportState {
  const state = readScoreImports(storage)
  const next = { version: 1 as const, scores: state.scores.filter((entry) => entry.id !== id) }
  writeScoreImports(next, storage)
  return next
}
