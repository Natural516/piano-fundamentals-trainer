import { buildScoreTimeV2, mergeTiedPerformanceEvents } from './scoreTimeV2'
import type { SmfDocument } from '../midiFile/midiFileParser'
import type { ScoreDocument } from './musicXmlTypes'

export interface ReferenceNote {
  midiNumber: number
  onsetTick: number
  durationTick: number
}

export interface TimingDifference {
  midiNumber: number
  scoreOnsetTick: number
  midiOnsetTick: number
  deltaMs: number
}

export interface ReferenceValidationReport {
  matched: number
  onlyScore: ReferenceNote[]
  onlyMidi: ReferenceNote[]
  matchRatio: number
  timingDifferences: TimingDifference[]
  consistent: boolean
}

export interface ReferenceValidationOptions {
  onsetToleranceTick?: number
  durationToleranceTick?: number
  tempoBpm?: number
}

const DEFAULT_ONSET_TOLERANCE_TICKS = 6
const DEFAULT_DURATION_TOLERANCE_TICKS = 12

/**
 * MusicXML score events (canonical PPQ ticks) vs reference SMF note events.
 * Matching is greedy by onset: same pitch, onset within tolerance, smallest
 * timing delta first. Nothing in the score is modified to fit the MIDI.
 */
export function buildScoreReferenceNotes(score: ScoreDocument): ReferenceNote[] {
  return mergeTiedPerformanceEvents(buildScoreTimeV2(score).events)
    .map((event) => ({
      midiNumber: event.midiPitch,
      onsetTick: event.attackTick,
      durationTick: Math.max(1, event.releaseTick - event.attackTick)
    }))
    .sort((left, right) => left.onsetTick - right.onsetTick || left.midiNumber - right.midiNumber)
}

export function buildMidiReferenceNotes(smf: SmfDocument): ReferenceNote[] {
  const division = Math.max(1, smf.division)
  const scale = 480 / division
  const onsets = new Map<number, import('../midiFile/midiFileParser').SmfEvent>()
  const notes: ReferenceNote[] = []

  for (const event of smf.mergedEvents) {
    if (event.type === 'noteOn' && typeof event.midiNumber === 'number' && typeof event.velocity === 'number' && event.velocity > 0) {
      onsets.set(event.midiNumber * 100000 + event.trackIndex * 100 + (event.channel ?? 0) * 10 + event.absoluteTick, event)
    } else if (event.type === 'noteOff' && typeof event.midiNumber === 'number') {
      let matchedKey: number | null = null
      let matchedDelta = Number.POSITIVE_INFINITY
      for (const [key, onset] of onsets) {
        if (onset.midiNumber !== event.midiNumber) continue
        const delta = event.absoluteTick - onset.absoluteTick
        if (delta >= 0 && delta < matchedDelta) {
          matchedDelta = delta
          matchedKey = key
        }
      }
      if (matchedKey !== null) {
        const onset = onsets.get(matchedKey)!
        notes.push({
          midiNumber: event.midiNumber,
          onsetTick: Math.round(onset.absoluteTick * scale),
          durationTick: Math.max(1, Math.round(matchedDelta * scale))
        })
        onsets.delete(matchedKey)
      }
    }
  }

  // Unclosed noteOns still count as notes with a nominal duration.
  for (const onset of onsets.values()) {
    notes.push({
      midiNumber: onset.midiNumber ?? 0,
      onsetTick: Math.round(onset.absoluteTick * scale),
      durationTick: 1
    })
  }

  return notes.sort((left, right) => left.onsetTick - right.onsetTick || left.midiNumber - right.midiNumber)
}

export function validateScoreAgainstMidi(
  scoreNotes: ReferenceNote[],
  midiNotes: ReferenceNote[],
  options: ReferenceValidationOptions = {}
): ReferenceValidationReport {
  const onsetTolerance = options.onsetToleranceTick ?? DEFAULT_ONSET_TOLERANCE_TICKS
  const durationTolerance = options.durationToleranceTick ?? DEFAULT_DURATION_TOLERANCE_TICKS
  const tempoBpm = options.tempoBpm ?? 80
  const matched: Array<{ score: ReferenceNote; midi: ReferenceNote }> = []
  const usedMidi = new Set<number>()

  for (const scoreNote of scoreNotes) {
    let bestIndex = -1
    let bestOnsetDelta = Number.POSITIVE_INFINITY
    for (let index = 0; index < midiNotes.length; index += 1) {
      if (usedMidi.has(index)) continue
      const midiNote = midiNotes[index]
      if (midiNote.midiNumber !== scoreNote.midiNumber) continue
      const onsetDelta = Math.abs(midiNote.onsetTick - scoreNote.onsetTick)
      if (onsetDelta > onsetTolerance) continue
      if (onsetDelta < bestOnsetDelta) {
        bestOnsetDelta = onsetDelta
        bestIndex = index
      }
    }
    if (bestIndex >= 0) {
      usedMidi.add(bestIndex)
      matched.push({ score: scoreNote, midi: midiNotes[bestIndex] })
    }
  }

  const usedScore = new Set(matched.map((entry) => entry.score))
  const onlyScore = scoreNotes.filter((note) => !usedScore.has(note))
  const onlyMidi = midiNotes.filter((_, index) => !usedMidi.has(index))
  const maxCount = Math.max(scoreNotes.length, midiNotes.length)
  const timingDifferences: TimingDifference[] = matched
    .filter((entry) => Math.abs(entry.midi.onsetTick - entry.score.onsetTick) > 0)
    .map((entry) => ({
      midiNumber: entry.score.midiNumber,
      scoreOnsetTick: entry.score.onsetTick,
      midiOnsetTick: entry.midi.onsetTick,
      deltaMs: Math.round((entry.midi.onsetTick - entry.score.onsetTick) * 60000 / 480 / Math.max(1, tempoBpm))
    }))

  return {
    matched: matched.length,
    onlyScore,
    onlyMidi,
    matchRatio: maxCount > 0 ? matched.length / maxCount : 1,
    timingDifferences,
    consistent: matched.length === scoreNotes.length &&
      matched.length === midiNotes.length &&
      timingDifferences.length === 0 &&
      matched.every((entry) => Math.abs(entry.midi.durationTick - entry.score.durationTick) <= durationTolerance)
  }
}
