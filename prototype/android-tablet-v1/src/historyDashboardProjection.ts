import type { DurableSightReadingReport } from './androidPersistenceCore'
import type { ChordPracticeReportV1 } from './chordPractice/report'

export type HistoryDashboardRange = '7d' | '30d' | 'all'
export type HistoryDashboardFilter = 'all' | 'sight' | 'chord'

export interface HistoryDashboardSummary {
  totalSessions: number
  totalCompletedQuestions: number
  currentStreakDays: number
}

export interface HistoryDailyBucket {
  dateKey: string
  label: string
  sessions: number
  completedQuestions: number
}

export interface HistoryDashboardProjection {
  summary: HistoryDashboardSummary
  trend: readonly HistoryDailyBucket[]
}

interface ActivityFact {
  module: 'sight' | 'chord'
  recordId: string
  endedAt: number
  completedQuestions: number
}

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function collectFacts(
  sightReports: readonly DurableSightReadingReport[],
  chordReports: readonly ChordPracticeReportV1[]
): readonly ActivityFact[] {
  const facts = new Map<string, ActivityFact>()
  for (const report of sightReports) {
    facts.set(`sight:${report.recordId}`, {
      module: 'sight',
      recordId: report.recordId,
      endedAt: report.endedAt,
      completedQuestions: report.completed
    })
  }
  for (const report of chordReports) {
    facts.set(`chord:${report.recordId}`, {
      module: 'chord',
      recordId: report.recordId,
      endedAt: report.endedAtEpochMs,
      completedQuestions: report.completedQuestions
    })
  }
  return [...facts.values()]
}

function getCurrentStreakDays(facts: readonly ActivityFact[], now: number): number {
  if (facts.length === 0) return 0
  const activeDays = new Set(facts.map((fact) => dateKey(startOfLocalDay(fact.endedAt))))
  const today = startOfLocalDay(now)
  let cursor = activeDays.has(dateKey(today)) ? today : addLocalDays(today, -1)
  let streak = 0
  while (activeDays.has(dateKey(cursor))) {
    streak += 1
    cursor = addLocalDays(cursor, -1)
  }
  return streak
}

function getRangeStart(facts: readonly ActivityFact[], range: HistoryDashboardRange, today: Date): Date {
  if (range === '7d') return addLocalDays(today, -6)
  if (range === '30d') return addLocalDays(today, -29)
  if (facts.length === 0) return addLocalDays(today, -6)
  return facts.reduce((earliest, fact) => {
    const day = startOfLocalDay(fact.endedAt)
    return day.getTime() < earliest.getTime() ? day : earliest
  }, today)
}

export function projectHistoryDashboard(
  sightReports: readonly DurableSightReadingReport[],
  chordReports: readonly ChordPracticeReportV1[],
  options: Readonly<{
    filter?: HistoryDashboardFilter
    now?: number
    range?: HistoryDashboardRange
  }> = {}
): HistoryDashboardProjection {
  const now = options.now ?? Date.now()
  const range = options.range ?? '7d'
  const filter = options.filter ?? 'all'
  const facts = collectFacts(sightReports, chordReports)
  const filteredFacts = filter === 'all' ? facts : facts.filter((fact) => fact.module === filter)
  const today = startOfLocalDay(now)
  const start = getRangeStart(filteredFacts, range, today)
  const bucketMap = new Map<string, { sessions: number; completedQuestions: number }>()

  for (const fact of filteredFacts) {
    if (fact.endedAt < start.getTime() || fact.endedAt >= addLocalDays(today, 1).getTime()) continue
    const key = dateKey(startOfLocalDay(fact.endedAt))
    const bucket = bucketMap.get(key) ?? { sessions: 0, completedQuestions: 0 }
    bucket.sessions += 1
    bucket.completedQuestions += fact.completedQuestions
    bucketMap.set(key, bucket)
  }

  const trend: HistoryDailyBucket[] = []
  for (let cursor = start; cursor.getTime() <= today.getTime(); cursor = addLocalDays(cursor, 1)) {
    const key = dateKey(cursor)
    const bucket = bucketMap.get(key) ?? { sessions: 0, completedQuestions: 0 }
    trend.push({ dateKey: key, label: dateLabel(cursor), ...bucket })
  }

  return {
    summary: {
      totalSessions: facts.length,
      totalCompletedQuestions: facts.reduce((total, fact) => total + fact.completedQuestions, 0),
      currentStreakDays: getCurrentStreakDays(facts, now)
    },
    trend
  }
}
