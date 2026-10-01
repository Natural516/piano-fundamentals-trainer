import { INTERVAL_TYPE_IDS, getIntervalType, type IntervalTypeId } from '../musicTheory/intervals'
import type { IntervalSessionSnapshot } from './sessionRuntime'
import type { IntervalPracticeSettings, IntervalQuestionAttempt } from './types'

export const INTERVAL_REPORT_SCHEMA_VERSION = 1 as const

export interface IntervalPracticeSettingsSnapshot {
  /** @deprecated Read compatibility only for existing V1 records. Never drives product behavior. */
  readonly practiceMode?: 'reproduction' | 'construction'
  readonly answerHint: boolean
  readonly includeAccidentalRoots: boolean
  readonly questionCountMode: 'fixed' | 'infinite'
  readonly configuredQuestionCount: 10 | 20 | 50 | 100 | null
}

export interface IntervalTypeReportStats {
  readonly intervalId: IntervalTypeId
  readonly intervalName: string
  readonly presentedCount: number
  readonly firstTryCorrectCount: number
  readonly retriedCorrectCount: number
  readonly wrongAttemptCount: number
  readonly firstTryAccuracy: number
}

export interface IntervalPracticeReportDraft {
  readonly startedAtEpochMs: number
  readonly finishedAtEpochMs: number
  readonly completionStatus: 'COMPLETED' | 'STOPPED'
  readonly settings: IntervalPracticeSettingsSnapshot
  readonly completedQuestions: number
  readonly firstTryCorrectCount: number
  readonly firstTryAccuracy: number | null
  readonly retriedCorrectCount: number
  readonly totalWrongAttempts: number
  readonly perIntervalStats: readonly IntervalTypeReportStats[]
}

export interface IntervalPracticeReportV1 extends IntervalPracticeReportDraft {
  readonly schemaVersion: typeof INTERVAL_REPORT_SCHEMA_VERSION
  readonly recordId: string
  readonly module: 'interval'
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const isFiniteTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isPercent = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100

function freezeSettings(settings: IntervalPracticeSettingsSnapshot): IntervalPracticeSettingsSnapshot {
  return Object.freeze({ ...settings })
}

function freezeStats(stats: readonly IntervalTypeReportStats[]): readonly IntervalTypeReportStats[] {
  return Object.freeze(stats.map((entry) => Object.freeze({ ...entry })))
}

export function snapshotIntervalPracticeSettings(settings: IntervalPracticeSettings): IntervalPracticeSettingsSnapshot {
  return Object.freeze({
    answerHint: settings.answerHint,
    includeAccidentalRoots: settings.includeAccidentalRoots,
    questionCountMode: settings.questionCount === 'endless' ? 'infinite' : 'fixed',
    configuredQuestionCount: settings.questionCount === 'endless' ? null : settings.questionCount
  })
}

export function aggregateIntervalAttempts(attempts: readonly IntervalQuestionAttempt[]): readonly IntervalTypeReportStats[] {
  const buckets = new Map<IntervalTypeId, { presented: number; firstTry: number; wrong: number }>()
  for (const attempt of attempts) {
    if (!attempt.completed) continue
    const current = buckets.get(attempt.intervalId) ?? { presented: 0, firstTry: 0, wrong: 0 }
    current.presented += 1
    current.firstTry += attempt.firstTryCorrect ? 1 : 0
    current.wrong += attempt.wrongAttemptCount
    buckets.set(attempt.intervalId, current)
  }
  return freezeStats(INTERVAL_TYPE_IDS.flatMap((intervalId) => {
    const bucket = buckets.get(intervalId)
    if (!bucket) return []
    return [{
      intervalId,
      intervalName: getIntervalType(intervalId).chineseName,
      presentedCount: bucket.presented,
      firstTryCorrectCount: bucket.firstTry,
      retriedCorrectCount: bucket.presented - bucket.firstTry,
      wrongAttemptCount: bucket.wrong,
      firstTryAccuracy: bucket.firstTry / bucket.presented * 100
    }]
  }))
}

export function buildIntervalPracticeReport(
  snapshot: IntervalSessionSnapshot,
  options: Readonly<{
    startedAtEpochMs: number
    finishedAtEpochMs: number
    completionStatus: IntervalPracticeReportDraft['completionStatus']
  }>
): IntervalPracticeReportDraft {
  if (!snapshot.settings) throw new Error('Interval report requires a session settings snapshot')
  const completedAttempts = snapshot.attempts.filter((attempt) => attempt.completed)
  if (completedAttempts.length !== snapshot.completedQuestions) throw new Error('Interval attempt facts do not match completed questions')
  const firstTryCorrectCount = completedAttempts.filter((attempt) => attempt.firstTryCorrect).length
  const totalWrongAttempts = completedAttempts.reduce((total, attempt) => total + attempt.wrongAttemptCount, 0)
  return freezeIntervalPracticeReportDraft({
    startedAtEpochMs: options.startedAtEpochMs,
    finishedAtEpochMs: options.finishedAtEpochMs,
    completionStatus: options.completionStatus,
    settings: snapshotIntervalPracticeSettings(snapshot.settings),
    completedQuestions: snapshot.completedQuestions,
    firstTryCorrectCount,
    firstTryAccuracy: snapshot.completedQuestions === 0 ? null : firstTryCorrectCount / snapshot.completedQuestions * 100,
    retriedCorrectCount: snapshot.completedQuestions - firstTryCorrectCount,
    totalWrongAttempts,
    perIntervalStats: aggregateIntervalAttempts(completedAttempts)
  })
}

export function getDifficultIntervals(report: IntervalPracticeReportDraft, limit = 3): readonly IntervalTypeReportStats[] {
  if (report.completedQuestions === 0 || report.totalWrongAttempts === 0 || report.firstTryCorrectCount === report.completedQuestions) return Object.freeze([])
  return Object.freeze([...report.perIntervalStats]
    .filter((entry) => entry.presentedCount > 0 && (entry.presentedCount - entry.firstTryCorrectCount > 0 || entry.wrongAttemptCount > 0))
    .sort((left, right) => (
      (right.presentedCount - right.firstTryCorrectCount) - (left.presentedCount - left.firstTryCorrectCount)
      || right.wrongAttemptCount - left.wrongAttemptCount
      || right.presentedCount - left.presentedCount
      || INTERVAL_TYPE_IDS.indexOf(left.intervalId) - INTERVAL_TYPE_IDS.indexOf(right.intervalId)
    ))
    .slice(0, Math.max(0, limit)))
}

function isSettingsSnapshot(value: unknown): value is IntervalPracticeSettingsSnapshot {
  if (!isObject(value)) return false
  if (value.practiceMode !== undefined && value.practiceMode !== 'reproduction' && value.practiceMode !== 'construction') return false
  if (typeof value.answerHint !== 'boolean' || typeof value.includeAccidentalRoots !== 'boolean') return false
  if (value.questionCountMode === 'infinite') return value.configuredQuestionCount === null
  return value.questionCountMode === 'fixed' && [10, 20, 50, 100].includes(Number(value.configuredQuestionCount))
}

function isStats(value: unknown): value is IntervalTypeReportStats {
  if (!isObject(value) || !INTERVAL_TYPE_IDS.includes(value.intervalId as IntervalTypeId)) return false
  if (value.intervalName !== getIntervalType(value.intervalId as IntervalTypeId).chineseName) return false
  if (!isNonNegativeInteger(value.presentedCount) || value.presentedCount < 1) return false
  if (!isNonNegativeInteger(value.firstTryCorrectCount) || value.firstTryCorrectCount > value.presentedCount) return false
  if (!isNonNegativeInteger(value.retriedCorrectCount) || value.retriedCorrectCount !== value.presentedCount - value.firstTryCorrectCount) return false
  if (!isNonNegativeInteger(value.wrongAttemptCount) || !isPercent(value.firstTryAccuracy)) return false
  return Math.abs(value.firstTryAccuracy - value.firstTryCorrectCount / value.presentedCount * 100) < 1e-9
}

export function isIntervalPracticeReportV1(value: unknown): value is IntervalPracticeReportV1 {
  if (!isObject(value) || value.schemaVersion !== 1 || value.module !== 'interval') return false
  if (typeof value.recordId !== 'string' || !/^interval-report-[1-9]\d*$/.test(value.recordId)) return false
  if (!isFiniteTimestamp(value.startedAtEpochMs) || !isFiniteTimestamp(value.finishedAtEpochMs) || value.finishedAtEpochMs < value.startedAtEpochMs) return false
  if (value.completionStatus !== 'COMPLETED' && value.completionStatus !== 'STOPPED') return false
  if (!isSettingsSnapshot(value.settings) || !isNonNegativeInteger(value.completedQuestions)) return false
  if (value.completionStatus === 'COMPLETED' && (value.settings.questionCountMode !== 'fixed' || value.completedQuestions !== value.settings.configuredQuestionCount)) return false
  if (value.settings.configuredQuestionCount !== null && value.completedQuestions > value.settings.configuredQuestionCount) return false
  if (!isNonNegativeInteger(value.firstTryCorrectCount) || value.firstTryCorrectCount > value.completedQuestions) return false
  if (value.completedQuestions === 0 ? value.firstTryAccuracy !== null : !isPercent(value.firstTryAccuracy)) return false
  if (value.completedQuestions > 0 && Math.abs(Number(value.firstTryAccuracy) - value.firstTryCorrectCount / value.completedQuestions * 100) >= 1e-9) return false
  if (!isNonNegativeInteger(value.retriedCorrectCount) || value.retriedCorrectCount !== value.completedQuestions - value.firstTryCorrectCount) return false
  if (!isNonNegativeInteger(value.totalWrongAttempts) || !Array.isArray(value.perIntervalStats) || !value.perIntervalStats.every(isStats)) return false
  const ids = value.perIntervalStats.map((entry) => entry.intervalId)
  if (new Set(ids).size !== ids.length) return false
  if (value.perIntervalStats.reduce((total, entry) => total + entry.presentedCount, 0) !== value.completedQuestions) return false
  if (value.perIntervalStats.reduce((total, entry) => total + entry.firstTryCorrectCount, 0) !== value.firstTryCorrectCount) return false
  return value.perIntervalStats.reduce((total, entry) => total + entry.wrongAttemptCount, 0) === value.totalWrongAttempts
}

export function freezeIntervalPracticeReportDraft(report: IntervalPracticeReportDraft): IntervalPracticeReportDraft {
  return Object.freeze({ ...report, settings: freezeSettings(report.settings), perIntervalStats: freezeStats(report.perIntervalStats) })
}

export function createIntervalPracticeReport(recordId: string, draft: IntervalPracticeReportDraft): IntervalPracticeReportV1 {
  const report: IntervalPracticeReportV1 = {
    schemaVersion: INTERVAL_REPORT_SCHEMA_VERSION,
    recordId,
    module: 'interval',
    ...draft,
    settings: Object.freeze({
      answerHint: draft.settings.answerHint,
      includeAccidentalRoots: draft.settings.includeAccidentalRoots,
      questionCountMode: draft.settings.questionCountMode,
      configuredQuestionCount: draft.settings.configuredQuestionCount
    }),
    perIntervalStats: freezeStats(draft.perIntervalStats)
  }
  if (!isIntervalPracticeReportV1(report)) throw new Error('Interval report cannot be persisted because its facts are invalid')
  return Object.freeze(report)
}

export function freezeIntervalPracticeReport(report: IntervalPracticeReportV1): IntervalPracticeReportV1 {
  if (!isIntervalPracticeReportV1(report)) throw new Error('Interval report facts are invalid')
  return Object.freeze({ ...report, settings: freezeSettings(report.settings), perIntervalStats: freezeStats(report.perIntervalStats) })
}
