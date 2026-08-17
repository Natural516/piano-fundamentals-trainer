import type { EvidenceRef, PracticeRecordV2 } from '../records/practiceRecordV2'

export interface TemporarySessionEvidence {
  sessionId: string
  scoreId: string
  facts: Array<{
    originalMeasure?: number
    originalBeat?: number
    hand?: string | null
    staff?: number | null
    outcome: string
    sourceEventIds: string[]
  }>
}

export interface EvidenceRepositories {
  getPracticeRecord: (id: string) => PracticeRecordV2 | null
  getTemporarySession?: (id: string) => TemporarySessionEvidence | null
}

export type EvidenceClaimCategory = 'pitch' | 'timing' | 'hand-comparison' | 'measure' | 'general'

export interface ResolvedEvidence {
  valid: boolean
  ref: EvidenceRef
  record: PracticeRecordV2 | null
  temporarySession: TemporarySessionEvidence | null
  errors: string[]
}

function metricExists(record: PracticeRecordV2, metricPath: string): boolean {
  if (record.metrics.some((metric) => metric.key === metricPath)) return true
  const measureMatch = /^perMeasureMetrics\.(\d+)\.(.+)$/.exec(metricPath)
  if (!measureMatch) return false
  const measure = record.perMeasureMetrics?.find((entry) => entry.measureNumber === Number(measureMatch[1]))
  if (!measure) return false
  const path = measureMatch[2].split('.')
  let value: unknown = measure
  for (const key of path) {
    if (!value || typeof value !== 'object' || !(key in value)) return false
    value = (value as Record<string, unknown>)[key]
  }
  return typeof value === 'number'
}

function errorMatchesReference(
  error: PracticeRecordV2['errorEvents'][number],
  ref: EvidenceRef
): boolean {
  if (typeof ref.measure === 'number' && error.measure !== ref.measure) return false
  if (typeof ref.beat === 'number' && error.beat !== ref.beat) return false
  if (ref.hand && error.hand !== ref.hand && error.hand !== 'both') return false
  if (typeof ref.staff === 'number' && error.staff !== ref.staff) return false
  if (ref.sourceEventId && !error.sourceEventIds?.includes(ref.sourceEventId)) return false
  return true
}

function temporaryFactMatchesReference(
  fact: TemporarySessionEvidence['facts'][number],
  ref: EvidenceRef
): boolean {
  if (typeof ref.measure === 'number' && fact.originalMeasure !== ref.measure) return false
  if (typeof ref.beat === 'number' && fact.originalBeat !== ref.beat) return false
  if (ref.hand && fact.hand !== ref.hand && fact.hand !== 'both') return false
  if (typeof ref.staff === 'number' && fact.staff !== ref.staff) return false
  if (ref.sourceEventId && !fact.sourceEventIds.includes(ref.sourceEventId)) return false
  return true
}

export function resolveEvidenceRef(
  ref: EvidenceRef,
  repositories: EvidenceRepositories,
  claimCategory: EvidenceClaimCategory = 'general'
): ResolvedEvidence {
  const errors: string[] = []
  const recordId = ref.practiceRecordId?.trim() ?? ''
  const sessionId = ref.sessionId?.trim() ?? ''
  if (!recordId && !sessionId) errors.push('evidence identity is missing')
  const record = recordId ? repositories.getPracticeRecord(recordId) : null
  const temporarySession = sessionId ? repositories.getTemporarySession?.(sessionId) ?? null : null
  if (recordId && !record) errors.push(`practice record not found: ${recordId}`)
  if (sessionId && !temporarySession) errors.push(`temporary session not found: ${sessionId}`)

  const error = record && ref.errorEventId
    ? record.errorEvents.find((entry) => entry.id === ref.errorEventId) ?? null
    : null
  if (ref.errorEventId && !error) errors.push(`error event not found: ${ref.errorEventId}`)
  if (record && ref.scoreId && record.scoreId !== ref.scoreId) errors.push('score does not match record')
  if (temporarySession && ref.scoreId && temporarySession.scoreId !== ref.scoreId) errors.push('score does not match session')
  if (temporarySession && (
    typeof ref.measure === 'number' ||
    typeof ref.beat === 'number' ||
    Boolean(ref.hand) ||
    typeof ref.staff === 'number' ||
    Boolean(ref.sourceEventId)
  )) {
    if (!temporarySession.facts.some((fact) => temporaryFactMatchesReference(fact, ref))) {
      errors.push('measure/beat/hand/staff/source does not match temporary session facts')
    }
  }
  if (record && typeof ref.measure === 'number') {
    const measureExists = Boolean(
      record.perMeasureMetrics?.some((entry) => entry.measureNumber === ref.measure) ||
      record.errorEvents.some((entry) => entry.measure === ref.measure)
    )
    if (!measureExists) errors.push(`measure not found in practice record: ${ref.measure}`)
  }
  if (error && !errorMatchesReference(error, ref)) {
    errors.push('referenced fields do not match error event')
  } else if (record && !error && (
    typeof ref.beat === 'number' ||
    Boolean(ref.hand) ||
    typeof ref.staff === 'number' ||
    Boolean(ref.sourceEventId)
  )) {
    const matchingError = record.errorEvents.some((entry) => errorMatchesReference(entry, ref))
    const matchingHandMetric = Boolean(
      ref.hand &&
      typeof ref.measure === 'number' &&
      record.perMeasureMetrics?.find((entry) => entry.measureNumber === ref.measure)?.handStats[ref.hand]
    )
    if (!matchingError && !matchingHandMetric) {
      errors.push('beat/hand/staff/source does not match practice record contents')
    }
  }
  if (record && ref.metric && !metricExists(record, ref.metric)) errors.push(`metric not found: ${ref.metric}`)
  if (temporarySession && ref.metric) errors.push('temporary session does not expose persisted metrics')

  if (claimCategory === 'timing') {
    const timingSupported = Boolean(
      error?.timingErrorMs !== null && error?.timingErrorMs !== undefined ||
      ref.metric && /timing|offset|early|late/i.test(ref.metric)
    )
    if (!timingSupported) errors.push('timing claim lacks timing evidence')
  }
  if (claimCategory === 'hand-comparison') {
    if (!ref.metric || !/handStats\.(left|right)/.test(ref.metric)) {
      errors.push('hand comparison requires left/right hand metrics')
    }
  }
  if (claimCategory === 'pitch' && error && !/wrong|missing|extra|pitch/i.test(error.type)) {
    errors.push('pitch claim uses an incompatible error type')
  }

  return { valid: errors.length === 0, ref, record, temporarySession, errors }
}

export function resolveEvidenceRefs(
  refs: EvidenceRef[],
  repositories: EvidenceRepositories,
  claimCategory: EvidenceClaimCategory = 'general'
): ResolvedEvidence[] {
  return refs.map((ref) => resolveEvidenceRef(ref, repositories, claimCategory))
}
