import { getMajorKeySignature, type MajorKeyId } from '../../../../src/sightReading/musicKeySignatures'
import { getDoubleIntervalForPitches } from '../../../../src/sightReading/doubleNoteQuestions'
import type { SightReadingNote } from '../../../../src/sightReading/sightReadingNotes'
import type { SightReadingRecordedOutcome } from '../../../../src/sightReading/sightReadingSession'
import type { SightReadingNoteMode } from '../../../../src/sightReading/sightReadingSettings'
import type { DurableSightReadingReport } from '../androidPersistenceCore'
import { formatScaleToolNoteName } from '../scaleKeySignatureTool'

type Translator = (key: string, options?: Record<string, unknown>) => string

/** Stable MajorKeyId -> existing written-tonic formatter -> display only. */
export function presentSightKey(id: MajorKeyId, t: Translator): string {
  return t('majorKey', { tonic: formatScaleToolNoteName(getMajorKeySignature(id).scaleDegrees[0].spelling) })
}

export function presentSightPrompt(options: {
  notes: readonly SightReadingNote[]
  noteMode: SightReadingNoteMode
  outcome: SightReadingRecordedOutcome | null
  paused: boolean
  pausedPrompt: string
}, t: Translator, music: Translator): string {
  if (options.paused) return options.pausedPrompt
  const state = options.outcome === 'correct' ? 'correct' : options.outcome === 'wrong_note' ? 'wrong' : options.outcome === 'timeout' ? 'timeout' : 'play'
  const pair = options.noteMode === 'double'
  // The approved pair catalog is keyed by semitone facts, never its Chinese label.
  const interval = pair && options.notes.length === 2
    ? getDoubleIntervalForPitches(options.notes[0].midiNumber, options.notes[1].midiNumber) : null
  return t(`${state}${pair ? 'Pair' : 'Single'}`, { intervalName: interval ? music(`intervals.${interval.id}`) : '—' })
}

export function presentSightReaction(value: number | null, t: Translator): string {
  return value === null ? '—' : t('reactionTime', { seconds: (value / 1000).toFixed(2) })
}

export function presentSightDuration(value: number, t: Translator): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  const totalSeconds = Math.round(value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  return minutes === 0 ? t('durationSeconds', { count: totalSeconds })
    : t('durationMinutes', { count: minutes, seconds: String(totalSeconds % 60).padStart(2, '0') })
}

/** Read the immutable durable facts; legacy projection strings are not lookup keys. */
export function presentSightHistory(record: DurableSightReadingReport | undefined, t: Translator): { title: string; settings: string } {
  if (!record) return { title: '—', settings: '—' }
  return {
    title: t('historyTitle', { staff: t(`staffs.${record.settings.staffMode}`), key: presentSightKey(record.settings.keySignature, t) }),
    settings: t('historySettings', { pool: t(`pools.${record.settings.notePoolMode}`), names: t(record.settings.noteNameVisible ? 'visibleSummary' : 'hiddenSummary') })
  }
}
