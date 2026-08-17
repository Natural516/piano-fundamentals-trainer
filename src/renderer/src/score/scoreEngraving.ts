import type { ScoreNoteModel } from './musicXmlTypes'
import { INTERNAL_PPQ } from './scoreTimeV2'

export interface VexDurationSpec {
  duration: string
  dotCount: number
  tuplet: { actualNotes: number; normalNotes: number } | null
}

const TYPE_TO_DURATION: Record<string, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64'
}

const BASES: Array<{ duration: string; ticks: number }> = [
  { duration: 'w', ticks: INTERNAL_PPQ * 4 },
  { duration: 'h', ticks: INTERNAL_PPQ * 2 },
  { duration: 'q', ticks: INTERNAL_PPQ },
  { duration: '8', ticks: INTERNAL_PPQ / 2 },
  { duration: '16', ticks: INTERNAL_PPQ / 4 },
  { duration: '32', ticks: INTERNAL_PPQ / 8 },
  { duration: '64', ticks: INTERNAL_PPQ / 16 }
]

function dottedTicks(base: number, dots: number): number {
  let total = base
  let addition = base / 2
  for (let index = 0; index < dots; index += 1) {
    total += addition
    addition /= 2
  }
  return total
}

export function getVexDurationSpec(note: ScoreNoteModel | null, durationTicks: number): VexDurationSpec {
  const explicit = note?.noteType ? TYPE_TO_DURATION[note.noteType] : undefined
  const dotCount = Math.max(0, Math.min(3, note?.dotCount ?? 0))
  let duration = explicit
  let resolvedDots = dotCount
  if (!duration) {
    let best = BASES[2]
    let bestDots = 0
    let bestDifference = Number.POSITIVE_INFINITY
    for (const base of BASES) {
      for (let dots = 0; dots <= 2; dots += 1) {
        const difference = Math.abs(dottedTicks(base.ticks, dots) - durationTicks)
        if (difference < bestDifference) {
          bestDifference = difference
          best = base
          bestDots = dots
        }
      }
    }
    duration = best.duration
    resolvedDots = bestDots
  }
  return {
    duration,
    dotCount: resolvedDots,
    tuplet: note?.timeModification
      ? { actualNotes: note.timeModification.actualNotes, normalNotes: note.timeModification.normalNotes }
      : null
  }
}
