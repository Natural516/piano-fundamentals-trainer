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

export function presentHomeRecentPractice(item: MixedPracticeHistoryItem | null, t: MidiTranslator): { title: string; detail: string } {
  if (!item) return { title: t('empty'), detail: t('emptyDetail') }
  const completed = item.module === 'sight' ? item.completed : item.completedQuestions
  const total = item.module === 'interval' ? item.configuredQuestionCount : item.plannedQuestionCount
  const progress = total === null ? t('completed', { count: completed }) : t('completedFixed', { completed, total })
  const metric = item.module === 'chord' ? item.firstPassCompletionRate : item.module === 'interval' ? item.firstTryAccuracy : item.accuracy
  // Preserve the existing Interval null percentage presentation (no invented zero or percentage).
  const value = item.module === 'interval' ? (metric === null ? '—' : `${formatHistoryPercentage(metric)}%`) : formatHistoryPercentage(metric)
  const title = t(item.module === 'chord' ? 'completionRate' : item.module === 'interval' ? 'firstTryAccuracy' : 'accuracy', { value })
  const date = formatHomeTimestamp(item.endedAt, t)
  // Chord modeSummary has no stable mode identity in this projection. Keep its original text,
  // rather than parse Chinese display text or expand this batch into Chord/History localization.
  const detail = item.module === 'chord'
    ? t('recentModeDetail', { date, mode: item.modeSummary, progress })
    : t('recentDetail', { date, module: t(item.module), progress })
  return { title, detail }
}
