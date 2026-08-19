import type { RecordingStats } from '../midi/midiRecording'
import type { PracticeRecordV2 } from './practiceRecordV2'

interface FreePracticeRecordInput {
  sessionId: string
  startedAt: string
  endedAt: string
  stats: RecordingStats
  notes: string
  facts: unknown[]
  completionState?: NonNullable<PracticeRecordV2['completionState']>
}

export function createFreePracticeRecordV2(input: FreePracticeRecordInput): PracticeRecordV2 {
  const { stats } = input
  const metrics = [
    { key: 'totalEvents', value: stats.noteOnCount },
    { key: 'durationMs', value: stats.durationMs, unit: 'ms' },
    { key: 'detail.noteOnCount', value: stats.noteOnCount },
    { key: 'detail.pedalDownCount', value: stats.pedalDownCount },
    { key: 'detail.pedalDownDurationMs', value: stats.pedalDownDurationMs, unit: 'ms' },
    { key: 'detail.leftRegionNoteOnCount', value: stats.leftRegionNoteOnCount },
    { key: 'detail.rightRegionNoteOnCount', value: stats.rightRegionNoteOnCount }
  ]

  const optionalMetrics = [
    ['detail.lowestMidi', stats.lowestMidi],
    ['detail.highestMidi', stats.highestMidi],
    ['detail.actualRange', stats.actualRange],
    ['detail.averageVelocity', stats.averageVelocity],
    ['detail.velocityRange', stats.velocityRange],
    ['detail.densityPerSecond', stats.densityPerSecond]
  ] as const

  for (const [key, value] of optionalMetrics) {
    if (value !== null && Number.isFinite(value)) metrics.push({ key, value })
  }

  return {
    id: input.sessionId,
    sessionId: input.sessionId,
    schemaVersion: 2,
    completionState: input.completionState ?? 'completed',
    practiceType: 'free-practice',
    sourceType: 'builtin',
    sourceId: 'free-play',
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: stats.durationMs,
    tempo: null,
    mode: 'free-play',
    handMode: null,
    scoreId: null,
    segment: null,
    metrics,
    errorEvents: [],
    evidenceRefs: [],
    iterations: [{
      index: 1,
      completedAt: input.endedAt,
      facts: input.facts
    }],
    metadata: {
      legacyTitle: '自由弹奏',
      legacySubtitle: `实际音域 ${stats.lowestMidi ?? '-'}–${stats.highestMidi ?? '-'}`,
      notes: input.notes.trim() || null,
      observableFactsOnly: true
    }
  }
}
