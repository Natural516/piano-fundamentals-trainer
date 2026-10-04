import { formatWrittenPitchClass, getChordSequentialKeyTonic, type ChordPracticeQuestion, type ChordSequentialMajorKeyId } from '../musicTheory/chords'
import type { ChordPracticeMode, ChordRuntimeSnapshot } from '../chordPractice/runtime'
import { presentChordPractice } from '../chordPractice/presentation'
import type { ChordPracticeReportV1 } from '../chordPractice/report'
import { projectChordReportDetail } from '../chordPractice/reportDetailProjection'
import { formatIntervalHistoryTimestamp } from './intervalPracticePresentation'

type Translator = (key: string, options?: Record<string, unknown>) => string

export function presentChordKey(id: ChordSequentialMajorKeyId, t: Translator): string {
  return t('majorKey', { tonic: formatWrittenPitchClass(getChordSequentialKeyTonic(id)) })
}

export function presentChordMode(mode: ChordPracticeMode, key: ChordSequentialMajorKeyId | null, t: Translator): string {
  return mode === 'sequential' && key
    ? t('modeWithKey', { mode: t('modes.sequential'), key: presentChordKey(key, t) })
    : t(`modes.${mode}`)
}

/** History projection strings are not identities. No structured facts means verbatim legacy text. */
export function presentChordHistorySummary(report: ChordPracticeReportV1 | undefined, legacySummary: string, t: Translator): string {
  return report ? presentChordMode(report.practiceMode, report.sequentialKey, t) : legacySummary
}

export function presentChordQuestion(question: ChordPracticeQuestion, t: Translator, theory: Translator): string {
  return t('questionLabel', {
    root: formatWrittenPitchClass(question.root),
    chordName: theory(`chord.types.${question.qualityId}`),
    inversion: t(`inversions.${question.inversionIndex}`)
  })
}

/** Preserve the approved semantic/group states; select text only from stable state-machine facts. */
export function presentLocalizedChordPractice(snapshot: ChordRuntimeSnapshot, t: Translator) {
  const existing = presentChordPractice(snapshot)
  const state = snapshot.judgement?.state
  let prompt = 'arpeggio', stage = 'arpeggio'
  if (snapshot.status === 'SESSION_COMPLETE' || state?.phase === 'QUESTION_COMPLETE') {
    prompt = snapshot.status === 'SESSION_COMPLETE' ? 'complete' : 'correct'; stage = 'complete'
  } else if (state?.phase === 'ARPEGGIO_WRONG_WAIT_RELEASE') prompt = 'arpeggioWrong'
  else if (state?.phase === 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK') { prompt = 'arpeggioRelease'; stage = 'transition' }
  else if (state?.phase === 'BLOCK_WRONG_WAIT_RELEASE') { prompt = 'blockWrong'; stage = 'block' }
  else if (state?.phase === 'WAIT_ALL_KEYS_UP_AFTER_BLOCK') { prompt = 'blockRelease'; stage = 'transition' }
  else {
    const resumeTarget = state?.phase === 'SUSPENDED' || state?.phase === 'RESUME_WAIT_ALL_KEYS_UP' ? state.resumeTarget : null
    if (state?.phase === 'BLOCK_READY' || state?.phase === 'BLOCK_CAPTURE' || resumeTarget === 'BLOCK_READY') { prompt = 'block'; stage = 'block' }
    else if (resumeTarget === 'QUESTION_COMPLETE') { prompt = 'blockRelease'; stage = 'transition' }
  }
  return { ...existing, prompt: t(`prompts.${prompt}`), stageLabel: t(`stages.${stage}`) }
}

/** Narrow display projection. Stable metric IDs replace locale-sensitive React keys; no durable writes. */
export function presentLocalizedChordReport(report: ChordPracticeReportV1, t: Translator, locale: 'zh-CN' | 'en') {
  const existing = projectChordReportDetail(report)
  const metricIds = ['completed', 'firstPass', 'firstPassRate', 'totalErrors', 'longestStreak', 'duration'] as const
  const errorIds = ['arpeggioErrors', 'blockErrors', 'totalErrors'] as const
  const statusLabel = t(`status.${report.completionReason === 'completed' ? 'completed' : report.plannedQuestionCount === null ? 'manual' : 'stopped'}`)
  const info = (id: string, value: string) => ({ id, label: t(`sessionLabels.${id}`), value })
  return {
    ...existing,
    modeIdentity: presentChordMode(report.practiceMode, report.sequentialKey, t), statusLabel,
    overviewMetrics: existing.overviewMetrics.map((metric, index) => ({ ...metric, id: metricIds[index], label: t(`metrics.${metricIds[index]}`) })),
    errorRows: existing.errorRows.map((row, index) => ({ ...row, id: errorIds[index], label: t(`metrics.${errorIds[index]}`) })),
    timingRows: existing.timingRows.map(row => ({
      ...row, label: t(`timingLabels.${row.id}`),
      value: row.id === 'blockLandingSpreadMs' ? row.value : row.medianMs === null || !Number.isFinite(row.medianMs) || row.medianMs < 0 ? '—' : t('seconds', { seconds: (row.medianMs / 1000).toFixed(2) }),
      sampleLabel: t('samples', { count: row.sampleCount })
    })),
    sessionRows: [
      info('mode', t(`modes.${report.practiceMode}`)),
      ...(report.practiceMode === 'sequential' && report.sequentialKey ? [info('key', presentChordKey(report.sequentialKey, t))] : []),
      info('count', report.plannedQuestionCount === null ? t('endless') : t('questions', { count: report.plannedQuestionCount })),
      info('outcome', statusLabel),
      info('start', formatIntervalHistoryTimestamp(report.startedAtEpochMs, locale)),
      info('end', formatIntervalHistoryTimestamp(report.endedAtEpochMs, locale))
    ]
  }
}
