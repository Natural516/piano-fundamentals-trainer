import type { MixedPracticeHistoryItem } from '../mixedHistoryProjection'
import { formatHistoryPercentage } from '../historyProjection'
import type { MidiTranslator } from './midiPresentation'

/** Home-only display boundary. Does not change the shared History formatter or durable records. */
export function formatHomeTimestamp(endedAt: number, t: MidiTranslator, now = Date.now()): string {
  const date = new Date(endedAt), current = new Date(now)
  if (!Number.isFinite(endedAt) || Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return t('unknownTime')
  const day = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const difference = Math.round((day(current) - day(date)) / 86_400_000)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (difference === 0) return t('todayTime', { time })
  if (difference === 1) return t('yesterdayTime', { time })
  const values = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), time }
  return t(date.getFullYear() === current.getFullYear() ? 'dateTime' : 'yearDateTime', values)
}

export function presentHomeRecentPractice(item: MixedPracticeHistoryItem | null, t: MidiTranslator, chordModeDisplay?: string): { title: string; detail: string } {
  if (!item) return { title: t('empty'), detail: t('emptyDetail') }
  const completed = item.module === 'sight' ? item.completed : item.completedQuestions
  const total = item.module === 'interval' ? item.configuredQuestionCount : item.plannedQuestionCount
  const progress = total === null ? t('completed', { count: completed }) : t('completedFixed', { completed, total })
  const metric = item.module === 'chord' ? item.firstPassCompletionRate : item.module === 'interval' ? item.firstTryAccuracy : item.accuracy
  // Preserve the existing Interval null percentage presentation (no invented zero or percentage).
  const value = item.module === 'interval' ? (metric === null ? '—' : `${formatHistoryPercentage(metric)}%`) : formatHistoryPercentage(metric)
  const title = t(item.module === 'chord' ? 'completionRate' : item.module === 'interval' ? 'firstTryAccuracy' : 'accuracy', { value })
  const date = formatHomeTimestamp(item.endedAt, t)
  // Use display derived from the matching report's stable facts when available.
  // A caller with only a legacy projection retains its text; never parse or rewrite it.
  const detail = item.module === 'chord'
    ? t('recentModeDetail', { date, mode: chordModeDisplay ?? item.modeSummary, progress })
    : t('recentDetail', { date, module: t(item.module), progress })
  return { title, detail }
}
