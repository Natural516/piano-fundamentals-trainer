import type { StorageAdapter } from '../platform/adapters'

export const PRACTICE_SESSION_STORAGE_KEY = 'piano-trainer.practice-sessions.v1'

export type PracticeSessionLifecycleState =
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'STOPPED'
  | 'INTERRUPTED'

export type PracticeSessionCompletionState =
  | 'completed'
  | 'stopped'
  | 'interrupted_device'
  | 'recovered'

export interface PracticeSessionMetadata {
  practiceType: string
  scoreId?: string | null
  exerciseId?: string | null
  mode?: string | null
  startMeasure?: number | null
  endMeasure?: number | null
  handMode?: string | null
  tempo?: number | null
  tempoRatio?: number | null
}

export interface PracticeSessionIteration {
  index: number
  completedAt: string
  facts: unknown[]
}

export interface PracticeSessionDraft extends PracticeSessionMetadata {
  version: 1
  sessionId: string
  state: PracticeSessionLifecycleState
  completionState: PracticeSessionCompletionState | null
  interruptionReason: string | null
  startedAt: string
  lastCheckpointAt: string
  currentFacts: unknown[]
  iterations: PracticeSessionIteration[]
}

interface PracticeSessionStoreState {
  version: 1
  drafts: PracticeSessionDraft[]
  committedSessionIds: string[]
}

export interface SessionStorageResult<T = PracticeSessionDraft> {
  success: boolean
  value?: T
  reason?: 'not_found' | 'already_committed' | 'read_failed' | 'write_failed' | 'invalid'
  error?: string
}

export interface PracticeSessionCheckpoint {
  facts?: unknown[]
  completedIteration?: PracticeSessionIteration
  metadata?: Partial<PracticeSessionMetadata>
  state?: PracticeSessionLifecycleState
  completionState?: PracticeSessionCompletionState | null
  interruptionReason?: string | null
}

export interface PracticeSessionRepository {
  start: (metadata: PracticeSessionMetadata, sessionId?: string, now?: Date) => SessionStorageResult
  checkpoint: (sessionId: string, checkpoint: PracticeSessionCheckpoint, now?: Date) => SessionStorageResult
  pause: (sessionId: string, facts: unknown[], now?: Date) => SessionStorageResult
  interruptDevice: (sessionId: string, facts: unknown[], now?: Date) => SessionStorageResult
  finish: (
    sessionId: string,
    completionState: PracticeSessionCompletionState,
    facts: unknown[],
    now?: Date
  ) => SessionStorageResult
  commit: (sessionId: string) => SessionStorageResult<null>
  get: (sessionId: string) => PracticeSessionDraft | null
  getRecoverable: () => PracticeSessionDraft[]
  getRecoveryState: () => { status: 'NONE' | 'RECOVERABLE_SESSION'; sessions: PracticeSessionDraft[] }
  isCommitted: (sessionId: string) => boolean
}

const MAX_COMMITTED_SESSION_IDS = 4000

function emptyState(): PracticeSessionStoreState {
  return { version: 1, drafts: [], committedSessionIds: [] }
}

function cloneFacts(facts: unknown[]): unknown[] {
  try {
    return JSON.parse(JSON.stringify(facts)) as unknown[]
  } catch {
    return []
  }
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeState(value: unknown): PracticeSessionStoreState {
  if (!value || typeof value !== 'object') return emptyState()
  const candidate = value as Partial<PracticeSessionStoreState>
  if (candidate.version !== 1) return emptyState()
  const drafts = Array.isArray(candidate.drafts)
    ? candidate.drafts.filter((draft): draft is PracticeSessionDraft => Boolean(
      draft && typeof draft === 'object' && typeof draft.sessionId === 'string' &&
      typeof draft.practiceType === 'string' && typeof draft.startedAt === 'string'
    ))
    : []
  const committedSessionIds = Array.isArray(candidate.committedSessionIds)
    ? candidate.committedSessionIds.filter((id): id is string => typeof id === 'string').slice(-MAX_COMMITTED_SESSION_IDS)
    : []
  return { version: 1, drafts, committedSessionIds }
}

export function createPracticeSessionRepository(storage: StorageAdapter): PracticeSessionRepository {
  const readState = (): SessionStorageResult<PracticeSessionStoreState> => {
    try {
      const raw = storage.getItem(PRACTICE_SESSION_STORAGE_KEY)
      return { success: true, value: raw ? sanitizeState(JSON.parse(raw)) : emptyState() }
    } catch (error) {
      return { success: false, reason: 'read_failed', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const writeState = (state: PracticeSessionStoreState): SessionStorageResult<PracticeSessionStoreState> => {
    try {
      storage.setItem(PRACTICE_SESSION_STORAGE_KEY, JSON.stringify(state))
      return { success: true, value: state }
    } catch (error) {
      return { success: false, reason: 'write_failed', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const updateDraft = (
    sessionId: string,
    updater: (draft: PracticeSessionDraft) => PracticeSessionDraft
  ): SessionStorageResult => {
    const read = readState()
    if (!read.success || !read.value) {
      return { success: false, reason: read.reason ?? 'read_failed', error: read.error }
    }
    if (read.value.committedSessionIds.includes(sessionId)) return { success: false, reason: 'already_committed' }
    const index = read.value.drafts.findIndex((draft) => draft.sessionId === sessionId)
    if (index < 0) return { success: false, reason: 'not_found' }
    const nextDraft = updater(read.value.drafts[index])
    const nextState = { ...read.value, drafts: [...read.value.drafts] }
    nextState.drafts[index] = nextDraft
    const written = writeState(nextState)
    return written.success
      ? { success: true, value: nextDraft }
      : { success: false, reason: written.reason ?? 'write_failed', error: written.error }
  }

  return {
    start(metadata, requestedSessionId, now = new Date()) {
      const read = readState()
      if (!read.success || !read.value) {
        return { success: false, reason: read.reason ?? 'read_failed', error: read.error }
      }
      const sessionId = requestedSessionId || createSessionId()
      if (read.value.committedSessionIds.includes(sessionId)) return { success: false, reason: 'already_committed' }
      const timestamp = now.toISOString()
      const draft: PracticeSessionDraft = {
        version: 1,
        sessionId,
        state: 'ACTIVE',
        completionState: null,
        interruptionReason: null,
        startedAt: timestamp,
        lastCheckpointAt: timestamp,
        currentFacts: [],
        iterations: [],
        ...metadata
      }
      const state = {
        ...read.value,
        drafts: [draft, ...read.value.drafts.filter((entry) => entry.sessionId !== sessionId)]
      }
      const written = writeState(state)
      return written.success
        ? { success: true, value: draft }
        : { success: false, reason: written.reason ?? 'write_failed', error: written.error }
    },
    checkpoint(sessionId, checkpoint, now = new Date()) {
      return updateDraft(sessionId, (draft) => ({
        ...draft,
        ...checkpoint.metadata,
        state: checkpoint.state ?? draft.state,
        completionState: checkpoint.completionState === undefined ? draft.completionState : checkpoint.completionState,
        interruptionReason: checkpoint.interruptionReason === undefined ? draft.interruptionReason : checkpoint.interruptionReason,
        currentFacts: checkpoint.facts ? cloneFacts(checkpoint.facts) : draft.currentFacts,
        iterations: checkpoint.completedIteration
          ? [...draft.iterations.filter((entry) => entry.index !== checkpoint.completedIteration?.index), {
            ...checkpoint.completedIteration,
            facts: cloneFacts(checkpoint.completedIteration.facts)
          }].sort((left, right) => left.index - right.index)
          : draft.iterations,
        lastCheckpointAt: now.toISOString()
      }))
    },
    pause(sessionId, facts, now = new Date()) {
      return this.checkpoint(sessionId, { facts, state: 'PAUSED' }, now)
    },
    interruptDevice(sessionId, facts, now = new Date()) {
      return this.checkpoint(sessionId, {
        facts,
        state: 'INTERRUPTED',
        completionState: 'interrupted_device',
        interruptionReason: 'midi_device_disconnected'
      }, now)
    },
    finish(sessionId, completionState, facts, now = new Date()) {
      const state: PracticeSessionLifecycleState = completionState === 'completed' ? 'COMPLETED' : 'STOPPED'
      return this.checkpoint(sessionId, {
        facts,
        state,
        completionState,
        interruptionReason: completionState === 'stopped' ? 'user_stopped' : undefined
      }, now)
    },
    commit(sessionId) {
      const read = readState()
      if (!read.success || !read.value) {
        return { success: false, reason: read.reason ?? 'read_failed', error: read.error }
      }
      if (read.value.committedSessionIds.includes(sessionId)) return { success: true, value: null }
      if (!read.value.drafts.some((draft) => draft.sessionId === sessionId)) return { success: false, reason: 'not_found' }
      const nextState: PracticeSessionStoreState = {
        version: 1,
        drafts: read.value.drafts.filter((draft) => draft.sessionId !== sessionId),
        committedSessionIds: [...read.value.committedSessionIds, sessionId].slice(-MAX_COMMITTED_SESSION_IDS)
      }
      const written = writeState(nextState)
      return written.success
        ? { success: true, value: null }
        : { success: false, reason: written.reason ?? 'write_failed', error: written.error }
    },
    get(sessionId) {
      const read = readState()
      return read.success ? read.value?.drafts.find((draft) => draft.sessionId === sessionId) ?? null : null
    },
    getRecoverable() {
      const read = readState()
      return read.success ? read.value?.drafts.filter((draft) => draft.state !== 'COMPLETED') ?? [] : []
    },
    getRecoveryState() {
      const sessions = this.getRecoverable()
      return { status: sessions.length > 0 ? 'RECOVERABLE_SESSION' : 'NONE', sessions }
    },
    isCommitted(sessionId) {
      const read = readState()
      return Boolean(read.success && read.value?.committedSessionIds.includes(sessionId))
    }
  }
}

const browserStorage: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
}

export const practiceSessionRepository = createPracticeSessionRepository(browserStorage)
