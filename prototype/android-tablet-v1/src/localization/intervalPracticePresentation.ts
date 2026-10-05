import type { TFunction } from 'i18next'
import { presentIntervalPractice, type IntervalPracticeState } from '../intervalPractice'
import { formatHistoryPercentage, formatHistoryTimestamp } from '../historyProjection'
import { formatWrittenPitch } from '../musicTheory/chords'
import type { ResolvedLocale } from './locale'

/** Display-only projection. The frozen domain still owns notation and question facts. */
export function presentLocalizedIntervalPractice(state: IntervalPracticeState, t: TFunction, music: TFunction) {
  const page = presentIntervalPractice(state)
  const intervalName = music(`intervals.${state.currentQuestion.intervalType.id}`)
  return {
    ...page,
    intervalName,
    prompt: t('activePrompt', { bassNote: page.rootLabel, intervalName }),
    notation: {
      ...page.notation,
      ariaLabel: t(page.notation.targetVisible ? 'notationPair' : 'notationBass', {
        intervalName, bassNote: page.rootLabel,
        targetNote: formatWrittenPitch(state.currentQuestion.target)
      })
    }
  }
}

export function formatIntervalReportAccuracy(value: number | null, locale: ResolvedLocale): string {
  if (value === null || !Number.isFinite(value)) return '—'
  // Preserve the existing one-decimal rounding and percentage semantics.
  const rounded = Number(formatHistoryPercentage(value))
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded)}%`
}

export function formatIntervalHistoryTimestamp(timestamp: number, locale: ResolvedLocale, now = Date.now()): string {
  if (locale === 'zh-CN') return formatHistoryTimestamp(timestamp, now)
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp))
}
