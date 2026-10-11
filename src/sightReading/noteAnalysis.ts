import { isMajorKeyId, type MajorKeyId } from './musicKeySignatures'
import type { MusicNotationPitch } from './musicNotationTypes'
import { spellMidiPitch } from './musicPitchSpelling'

/** V1 facts, never localized. Only settled single-note questions have per-note attribution.
 * Double-note outcomes remain whole-question facts and never enter this analysis.
 */
export interface SightNoteStats {
  identity: string
  notation: MusicNotationPitch
  keySignature: MajorKeyId
  occurrences: number
  errorCount: number
  responseTimesMs: number[]
}

export const MIN_ERROR_OCCURRENCES = 5
export const MIN_CORRECT_SAMPLES = 5
export const SIGHT_ANALYSIS_WINDOW = 10

export function sightNoteIdentity(note: MusicNotationPitch): string {
  return `${note.letter}:${note.accidental ?? 'natural'}:${note.octave}`
}

/** Read-only analysis grouping, NOT the persisted V1 identity or a schema change. */
export function sightAnalysisIdentity(note: MusicNotationPitch): string {
  return `${note.clef}:${sightNoteIdentity(note)}`
}

/** Written diatonic order, then alteration: not physical pitch, locale, or insertion order. */
export function compareSightNotation(a: SightNoteStats, b: SightNoteStats): number {
  const letters = 'CDEFGAB'
  const alterations = { b: -1, natural: 0, '#': 1 }
  return a.notation.octave - b.notation.octave ||
    letters.indexOf(a.notation.letter) - letters.indexOf(b.notation.letter) ||
    alterations[a.notation.accidental ?? 'natural'] - alterations[b.notation.accidental ?? 'natural'] ||
    (a.notation.clef === b.notation.clef ? 0 : a.notation.clef === 'treble' ? -1 : 1)
}

export function medianMs(samples: readonly number[]): number | null {
  if (samples.length === 0) return null
  if (samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid response time')
  const values = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

export function cloneSightNoteStats(stats: readonly SightNoteStats[]): SightNoteStats[] {
  return stats.map(stat => ({ ...stat, notation: { ...stat.notation }, responseTimesMs: [...stat.responseTimesMs] }))
}

export function recordSightNoteOutcome(
  stats: SightNoteStats[], notes: readonly MusicNotationPitch[], keySignature: MajorKeyId,
  outcome: 'correct' | 'wrong_note' | 'timeout', responseTimeMs: number | null
): void {
  if (notes.length !== 1) return
  for (const notation of notes) {
    const identity = sightNoteIdentity(notation)
    let stat = stats.find(value => value.identity === identity)
    if (!stat) {
      stat = { identity, notation: { ...notation }, keySignature, occurrences: 0, errorCount: 0, responseTimesMs: [] }
      stats.push(stat)
    }
    stat.occurrences++
    if (outcome !== 'correct') stat.errorCount++
    else if (responseTimeMs !== null) stat.responseTimesMs.push(responseTimeMs)
  }
}

/** Validate actual production spelling/render facts, not just JSON field presence. */
export function isSightNoteStats(value: unknown): value is SightNoteStats[] {
  if (!Array.isArray(value)) return false
  const identities = new Set<string>()
  return value.every(stat => {
    if (!stat || typeof stat !== 'object' || !stat.notation || !isMajorKeyId(stat.keySignature)) return false
    const n = stat.notation
    if (!Number.isInteger(n.midiNumber) || n.midiNumber < 0 || n.midiNumber > 127 ||
      (n.clef !== 'treble' && n.clef !== 'bass')) return false
    const expected = spellMidiPitch(n.midiNumber, stat.keySignature, n.clef)
    if (Object.keys(expected).some(key => n[key] !== expected[key as keyof MusicNotationPitch])) return false
    if (stat.identity !== sightNoteIdentity(expected) || identities.has(stat.identity)) return false
    identities.add(stat.identity)
    return Number.isInteger(stat.occurrences) && stat.occurrences > 0 &&
      Number.isInteger(stat.errorCount) && stat.errorCount >= 0 && stat.errorCount <= stat.occurrences &&
      Array.isArray(stat.responseTimesMs) && stat.responseTimesMs.every((ms: unknown) => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) &&
      stat.responseTimesMs.length + stat.errorCount === stat.occurrences
  })
}

export interface SightNoteRank extends SightNoteStats { analysisIdentity: string; medianResponseMs: number | null }

export function rankSightNotes(stats: readonly SightNoteStats[], limit: number, longTerm = false) {
  const rows: SightNoteRank[] = stats.map(stat => ({ ...stat, analysisIdentity: sightAnalysisIdentity(stat.notation), medianResponseMs: medianMs(stat.responseTimesMs) }))
  return {
    errors: rows.filter(stat => stat.errorCount > 0 && (!longTerm || stat.occurrences >= MIN_ERROR_OCCURRENCES))
      .sort((a, b) => b.errorCount - a.errorCount || compareSightNotation(a, b)).slice(0, limit),
    // Relative slowest notes, not statistical outliers. Only correct responses contribute.
    slow: rows.filter(stat => stat.medianResponseMs !== null && (!longTerm ||
      stat.responseTimesMs.length >= MIN_CORRECT_SAMPLES
    )).sort((a, b) => b.medianResponseMs! - a.medianResponseMs! || compareSightNotation(a, b)).slice(0, limit)
  }
}

export interface SightAnalyzableReport {
  recordId: string
  endedAt: number
  completionState: 'completed' | 'stopped'
  partialEvidence: boolean
  completed: number
  plannedQuestionCount: number
  settings?: { noteMode?: 'single' | 'double' }
  noteStatsVersion?: 1
  noteStats?: SightNoteStats[]
}

/** Window first, then analyzability. Never backfill old reports, write History or cache results. */
export function analyzeSightHistory(reports: readonly SightAnalyzableReport[]) {
  const recentWindow = [...reports].filter(report => report.completionState === 'completed' && !report.partialEvidence &&
    report.completed === report.plannedQuestionCount)
    .sort((a, b) => b.endedAt - a.endedAt || (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0))
    .slice(0, SIGHT_ANALYSIS_WINDOW)
  const analyzable = recentWindow.filter(report => report.settings?.noteMode !== 'double' && report.noteStatsVersion === 1 && isSightNoteStats(report.noteStats))
  const notes = new Map<string, SightNoteStats>()
  for (const report of analyzable) for (const stat of report.noteStats!) {
    const analysisIdentity = sightAnalysisIdentity(stat.notation)
    const previous = notes.get(analysisIdentity)
    if (previous) {
      previous.occurrences += stat.occurrences
      previous.errorCount += stat.errorCount
      previous.responseTimesMs.push(...stat.responseTimesMs)
    } else notes.set(analysisIdentity, cloneSightNoteStats([stat])[0])
  }
  // Keep the original V1 identity and the most recent real key context within each clef.
  const noteStats = [...notes.values()].sort(compareSightNotation)
  const globalMedian = medianMs(noteStats.flatMap(stat => stat.responseTimesMs))
  return { windowCount: recentWindow.length, analyzableCount: analyzable.length, windowIds: recentWindow.map(report => report.recordId),
    noteStats, globalMedian, ...rankSightNotes(noteStats, 10, true) }
}
