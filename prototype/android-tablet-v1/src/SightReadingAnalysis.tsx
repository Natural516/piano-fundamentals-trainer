import { useTranslation } from 'react-i18next'
import { MusicStaffRenderer } from '../../../src/renderer/src/components/MusicStaffRenderer'
import { analyzeSightHistory, rankSightNotes, type SightNoteRank, type SightNoteStats } from '../../../src/sightReading/noteAnalysis'
import type { DurableSightReadingReport } from './androidPersistenceCore'
import type { SightReadingSessionReport } from '../../../src/sightReading/report'
import { getMajorKeySignature } from '../../../src/sightReading/musicKeySignatures'
import type { TFunction } from 'i18next'
import type { MusicNotationPitch } from '../../../src/sightReading/musicNotationTypes'
import { formatScaleToolNoteName } from './scaleKeySignatureTool'

/** Presentation only: written facts stay authoritative, including enharmonic spelling. */
export function presentSightAnalysisNote(note: Pick<MusicNotationPitch, 'letter' | 'accidental' | 'octave'>): string {
  return formatScaleToolNoteName(`${note.letter}${note.accidental ?? ''}${note.octave}`)
}

/** Existing overall average fact only; never infer from duration or note medians. */
export function presentSightHistoryAverage(value: unknown, t: TFunction<'sightAnalysis'>): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? t('historyAverage', { seconds: (value / 1000).toFixed(2) }) : t('historyAverageMissing')
}

/** Read-only projection; preserves legacy metrics and never reconstructs missing note facts. */
export function sightSessionFromHistory(record: DurableSightReadingReport): SightReadingSessionReport {
  return {
    totalQuestions: record.plannedQuestionCount, completedQuestions: record.completed,
    correct: record.correct, wrong: record.wrong, timeout: record.timeout, accuracy: record.accuracy,
    bestStreak: record.bestStreak, mostWrongNote: record.mostWrongNote, mostTimedOutNote: record.mostTimedOutNote,
    weakestNote: record.weakestNote, averageReactionMs: record.averageReactionMs,
    fastestReactionMs: record.fastestReactionMs, slowestReactionMs: record.slowestReactionMs,
    wrongNoteCounts: record.targetNoteErrors.wrong, timeoutNoteCounts: record.targetNoteErrors.timeout,
    staffMode: record.settings.staffMode, noteCount: record.settings.noteMode === 'double' ? 2 : 1,
    keySignature: record.settings.keySignature, keyName: getMajorKeySignature(record.settings.keySignature).displayName,
    notePoolMode: record.settings.notePoolMode, answerTimeLimitSeconds: record.settings.answerTimeLimitMs / 1000,
    treble: record.clefStats.treble, bass: record.clefStats.bass,
    completionState: record.completionState, partialEvidence: record.partialEvidence,
    ...(record.noteStatsVersion === 1 ? { noteStatsVersion: 1 as const, noteStats: record.noteStats } : {})
  }
}

function NoteRanking({ rows, kind, single }: { rows: readonly SightNoteRank[]; kind: 'errors' | 'slow'; single: boolean }): JSX.Element {
  const { t } = useTranslation('sightAnalysis')
  return <article className={`sight-analysis-card is-${kind}`}>
    <h2>{t(single ? kind === 'errors' ? 'sessionErrors' : 'sessionSlow' : kind)}</h2>
    {!single ? <p>{t(kind === 'errors' ? 'errorsHelp' : 'slowHelp')}</p> : null}
    {rows.length ? <ol className="sight-analysis-ranking">
      {rows.map((row, index) => {
        const note = presentSightAnalysisNote(row.notation)
        return <li key={row.identity}>
          <span className="sight-analysis-rank" aria-label={t('rank', { count: index + 1 })}>{index + 1}</span>
          <div className="sight-analysis-staff"><MusicStaffRenderer analysisDense feedback={null} notes={[row.notation]} keySignature={row.keySignature} staffMode={row.notation.clef} ariaLabel={t('staff', { note })} fontErrorLabel={t('common:fontFailed')} /></div>
          <strong className="sight-analysis-note">{note}</strong>
          <span className="sight-analysis-value">{kind === 'errors' ? t('errorCount', { count: row.errorCount }) : t('usually', { seconds: (row.medianResponseMs! / 1000).toFixed(2) })}</span>
        </li>
      })}
    </ol> : <p className="sight-analysis-empty">{t(single ? kind === 'errors' ? 'noSessionErrors' : 'noSessionSlow' : kind === 'errors' ? 'noErrors' : 'noSlow')}</p>}
  </article>
}

export function SightSessionNoteAnalysis({ stats }: { stats?: readonly SightNoteStats[] }): JSX.Element {
  const { t } = useTranslation('sightAnalysis')
  if (!stats) return <p className="sight-analysis-caption">{t('legacy')}</p>
  const ranking = rankSightNotes(stats, 5)
  return <section className="sight-session-analysis">
    <div className="sight-analysis-columns"><NoteRanking rows={ranking.errors} kind="errors" single /><NoteRanking rows={ranking.slow} kind="slow" single /></div>
    <p className="sight-analysis-caption">{t('sampleHelp')}</p>
  </section>
}

export function SightHistoryAnalysis({ records, status, warning }: { records: readonly DurableSightReadingReport[]; status: 'loading' | 'ready' | 'error'; warning: string | null }): JSX.Element {
  const { t } = useTranslation('sightAnalysis')
  const analysis = analyzeSightHistory(records)
  return <section className="sight-history-analysis" aria-label={t('sampleHelp')}>
    <header>{status === 'ready' && !warning ? <>
      <p>{t('window', { count: analysis.windowCount })}</p>
    </> : null}</header>
    {status !== 'ready' || warning ? <p role="status">{t(status === 'loading' ? 'loading' : 'readFailed')}</p> : <>
      <div className="sight-analysis-columns"><NoteRanking rows={analysis.errors} kind="errors" single={false} /><NoteRanking rows={analysis.slow} kind="slow" single={false} /></div>
    </>}
  </section>
}
