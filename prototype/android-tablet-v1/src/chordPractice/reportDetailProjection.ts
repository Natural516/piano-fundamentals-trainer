import { formatHistoryPercentage, formatHistoryTimestamp } from '../historyProjection'
import { formatWrittenPitchClass, getChordSequentialKeyTonic } from '../musicTheory/chords'
import { calculateChordCompletionRate, formatChordModeSummary } from './historyProjection'
import type { ChordPracticeReportV1, ChordTimingMetricSummary } from './report'

export interface ChordReportDetailMetric {
  readonly label: string
  readonly value: string
  readonly primary: boolean
}

export interface ChordReportDetailTimingRow {
  readonly id: keyof ChordPracticeReportV1['timingSummary']
  readonly label: string
  readonly medianMs: number | null
  readonly value: string
  readonly sampleCount: number
  readonly sampleLabel: string
}

export interface ChordReportDetailInfoRow {
  readonly label: string
  readonly value: string
}

export interface ChordReportDetailViewModel {
  readonly recordId: string
  readonly modeIdentity: string
  readonly statusLabel: '已完成' | '中途结束' | '手动结束'
  readonly completionValue: string
  readonly completionRate: number
  readonly completionRateValue: string
  readonly overviewMetrics: readonly ChordReportDetailMetric[]
  readonly errorRows: readonly ChordReportDetailInfoRow[]
  readonly timingRows: readonly ChordReportDetailTimingRow[]
  readonly sessionRows: readonly ChordReportDetailInfoRow[]
  readonly durationValue: string
}

function formatMillisecondValue(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ms`
}

function formatSecondValue(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return '—'
  return `${(value / 1000).toFixed(2)} 秒`
}

function projectTimingRow(
  id: ChordReportDetailTimingRow['id'],
  label: string,
  metric: ChordTimingMetricSummary,
  displayUnit: 'seconds' | 'milliseconds'
): ChordReportDetailTimingRow {
  return Object.freeze({
    id,
    label,
    medianMs: metric.medianMs,
    value: displayUnit === 'seconds'
      ? formatSecondValue(metric.medianMs)
      : formatMillisecondValue(metric.medianMs),
    sampleCount: metric.sampleCount,
    sampleLabel: `${metric.sampleCount} 个样本`
  })
}

export function formatChordReportDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—'
  const totalSeconds = Math.round(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function resolveChordReportById(
  records: readonly ChordPracticeReportV1[],
  recordId: string | null
): ChordPracticeReportV1 | null {
  if (recordId === null) return null
  return records.find((record) => record.recordId === recordId) ?? null
}

export function projectChordReportDetail(report: ChordPracticeReportV1, now = Date.now()): ChordReportDetailViewModel {
  const completionRate = calculateChordCompletionRate(report)
  const completionRateValue = `${formatHistoryPercentage(completionRate)}%`
  const completionValue = report.plannedQuestionCount === null
    ? String(report.completedQuestions)
    : `${report.completedQuestions} / ${report.plannedQuestionCount}`
  const statusLabel = report.completionReason === 'completed'
    ? '已完成'
    : report.plannedQuestionCount === null ? '手动结束' : '中途结束'
  const durationValue = formatChordReportDuration(report.practiceDurationMs)
  const sessionRows: ChordReportDetailInfoRow[] = [
    { label: '练习模式', value: report.practiceMode === 'sequential' ? '循序练习' : '综合随机' }
  ]
  if (report.practiceMode === 'sequential' && report.sequentialKey) {
    sessionRows.push({
      label: '调性',
      value: `${formatWrittenPitchClass(getChordSequentialKeyTonic(report.sequentialKey))} 大调`
    })
  }
  sessionRows.push(
    { label: '题数', value: report.plannedQuestionCount === null ? '无限' : `${report.plannedQuestionCount}题` },
    { label: '练习结果', value: statusLabel },
    { label: '开始时间', value: formatHistoryTimestamp(report.startedAtEpochMs, now) },
    { label: '结束时间', value: formatHistoryTimestamp(report.endedAtEpochMs, now) }
  )

  return Object.freeze({
    recordId: report.recordId,
    modeIdentity: formatChordModeSummary(report),
    statusLabel,
    completionValue,
    completionRate,
    completionRateValue,
    durationValue,
    overviewMetrics: Object.freeze([
      Object.freeze({ label: '完成', value: completionValue, primary: true }),
      Object.freeze({ label: '首次通过', value: String(report.firstPassCompleteQuestions), primary: false }),
      Object.freeze({ label: '完成率', value: completionRateValue, primary: true }),
      Object.freeze({ label: '总错误', value: String(report.totalErrors), primary: false }),
      Object.freeze({ label: '最长连对', value: String(report.longestFirstPassStreak), primary: false }),
      Object.freeze({ label: '练习时长', value: durationValue, primary: false })
    ]),
    errorRows: Object.freeze([
      Object.freeze({ label: '分解错误', value: String(report.arpeggioErrors) }),
      Object.freeze({ label: '柱式错误', value: String(report.blockErrors) }),
      Object.freeze({ label: '总错误', value: String(report.totalErrors) })
    ]),
    timingRows: Object.freeze([
      projectTimingRow('questionStartLatencyMs', '开始弹奏用时', report.timingSummary.questionStartLatencyMs, 'seconds'),
      projectTimingRow('arpeggioDurationMs', '分解弹奏用时', report.timingSummary.arpeggioDurationMs, 'seconds'),
      projectTimingRow('switchToBlockLatencyMs', '切换柱式用时', report.timingSummary.switchToBlockLatencyMs, 'seconds'),
      projectTimingRow('blockLandingSpreadMs', '同时落键差', report.timingSummary.blockLandingSpreadMs, 'milliseconds')
    ]),
    sessionRows: Object.freeze(sessionRows.map((row) => Object.freeze(row)))
  })
}
