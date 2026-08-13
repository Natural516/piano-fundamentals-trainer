import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'

export type StatPeriod = 'today' | 'week' | 'month' | 'all'

export interface PeriodModuleStats {
  durationMs: number
  sessions: number
  accuracy: number | null
}

export interface PeriodStats {
  period: StatPeriod
  durationMs: number
  sessions: number
  sampleCount: number
  confidence: 'low' | 'medium' | 'high'
  perModule: Record<string, PeriodModuleStats>
  sightReadingAverageReactionMs: number | null
  rhythmAverageOffsetMs: number | null
  chordWeakness: string
  scaleEvenness: number | null
}

export const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
  all: '全部'
}

export function getPeriodStart(now: Date, period: StatPeriod): Date {
  const start = new Date(now)
  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
    return start
  }
  if (period === 'week') {
    start.setHours(0, 0, 0, 0)
    const day = start.getDay()
    start.setDate(start.getDate() - ((day + 6) % 7))
    return start
  }
  if (period === 'month') {
    start.setHours(0, 0, 0, 0)
    start.setDate(1)
    return start
  }
  return new Date(0)
}

export function computePeriodStats(records: PracticeSessionRecord[], now = new Date(), period: StatPeriod = 'all'): PeriodStats {
  const periodStart = getPeriodStart(now, period).getTime()
  const inPeriod = records.filter((record) => {
    const endedAt = Date.parse(record.endedAt)
    return Number.isFinite(endedAt) && endedAt >= periodStart
  })

  const perModule: Record<string, PeriodModuleStats> = {}
  const moduleAccuracies: Record<string, number[]> = {}
  const sightReadingReactions: number[] = []
  const rhythmOffsets: number[] = []
  const scaleOffsets: number[] = []
  const chordWeaknessCounts = new Map<string, number>()

  let durationMs = 0

  for (const record of inPeriod) {
    durationMs += record.durationMs || 0
    const module = record.module
    const current = perModule[module] ?? { durationMs: 0, sessions: 0, accuracy: null }
    current.durationMs += record.durationMs || 0
    current.sessions += 1
    perModule[module] = current

    if (typeof record.accuracy === 'number') {
      (moduleAccuracies[module] ??= []).push(record.accuracy)
    }
    if (record.module === 'sight-reading' && typeof record.details.averageReactionMs === 'number') {
      sightReadingReactions.push(record.details.averageReactionMs as number)
    }
    if (record.module === 'rhythm' && typeof record.averageOffsetMs === 'number') {
      rhythmOffsets.push(record.averageOffsetMs as number)
    }
    if (record.module === 'scale' && typeof record.averageOffsetMs === 'number') {
      scaleOffsets.push(record.averageOffsetMs as number)
    }
    if (record.module === 'chord' && typeof record.details.hardestChord === 'string' && record.details.hardestChord !== '暂无') {
      chordWeaknessCounts.set(record.details.hardestChord as string, (chordWeaknessCounts.get(record.details.hardestChord as string) ?? 0) + 1)
    }
  }

  for (const [module, accuracies] of Object.entries(moduleAccuracies)) {
    perModule[module].accuracy = accuracies.length > 0
      ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length)
      : null
  }

  const average = (values: number[]): number | null =>
    values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  const deviation = (values: number[]): number | null => {
    if (values.length < 2) return null
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    return Math.round(Math.sqrt(variance))
  }

  return {
    period,
    durationMs,
    sessions: inPeriod.length,
    sampleCount: inPeriod.length,
    confidence: inPeriod.length < 3 ? 'low' : inPeriod.length < 10 ? 'medium' : 'high',
    perModule,
    sightReadingAverageReactionMs: average(sightReadingReactions),
    rhythmAverageOffsetMs: average(rhythmOffsets),
    chordWeakness: [...chordWeaknessCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '暂无',
    scaleEvenness: deviation(scaleOffsets)
  }
}

export function formatNoData(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}

export function buildWeeklyReport(records: PracticeSessionRecord[], now = new Date()): { facts: string[]; suggestions: string[] } {
  const week = computePeriodStats(records, now, 'week')
  const facts: string[] = []
  const suggestions: string[] = []

  if (week.sessions === 0) {
    facts.push('本周暂无练习数据。')
    suggestions.push('建议从本周开始建立每日 10–20 分钟的固定练习。')
    return { facts, suggestions }
  }

  facts.push(`本周练习 ${week.sessions} 次，累计 ${Math.round(week.durationMs / 60000)} 分钟。`)

  if (week.sightReadingAverageReactionMs !== null) {
    facts.push(`识谱平均反应 ${week.sightReadingAverageReactionMs} ms（样本 ${week.sampleCount}）。`)
  }
  if (week.scaleEvenness !== null) {
    facts.push(`音阶平均偏移离散度 ${week.scaleEvenness} ms。`)
  }
  if (week.chordWeakness !== '暂无') {
    facts.push(`和弦薄弱点：${week.chordWeakness}。`)
    suggestions.push(`建议在计划中安排 ${week.chordWeakness} 的专项复习。`)
  }

  if (week.durationMs < 60 * 60 * 1000) {
    suggestions.push('本周练习时长偏低，建议逐步增加至每日 30 分钟。')
  } else {
    suggestions.push('本周时长稳定，继续保持并尝试每周增加一次曲谱练习。')
  }

  return { facts, suggestions }
}
