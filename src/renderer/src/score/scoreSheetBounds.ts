import type { ScoreNoteModel } from './musicXmlTypes'

export const SCORE_TREBLE_STAVE_Y = 22
export const SCORE_BASS_STAVE_Y = 126
export const SCORE_NOTATION_SAFE_MARGIN = 18

const STAVE_TOP_LINE_OFFSET = 40
const DIATONIC_STEP_PIXELS = 5
const NOTE_AND_MODIFIER_ALLOWANCE = 12

const STEP_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6
}

const TREBLE_TOP_LINE_DIATONIC = diatonicIndex('F', 5)
const BASS_TOP_LINE_DIATONIC = diatonicIndex('A', 3)

export interface ScoreNotationBounds {
  contentOffsetY: number
  notationTop: number
  notationBottom: number
  systemHeight: number
  safeMargin: number
}

function diatonicIndex(step: string, octave: number): number {
  return octave * 7 + (STEP_INDEX[step.toUpperCase()] ?? 0)
}

function noteCenterY(note: ScoreNoteModel): number {
  const reference = note.staff === 2 ? BASS_TOP_LINE_DIATONIC : TREBLE_TOP_LINE_DIATONIC
  const staveY = note.staff === 2 ? SCORE_BASS_STAVE_Y : SCORE_TREBLE_STAVE_Y
  return staveY + STAVE_TOP_LINE_OFFSET -
    (diatonicIndex(note.step, note.octave) - reference) * DIATONIC_STEP_PIXELS
}

/**
 * Conservative logical notation bounds for the VexFlow grand-staff geometry.
 * The range is derived from written diatonic pitch, so ledger-heavy scores
 * receive real space instead of a Case-specific fixed bottom patch.
 */
export function calculateScoreNotationBounds(
  notes: ScoreNoteModel[],
  grandStaff: boolean,
  minimumSystemHeight: number
): ScoreNotationBounds {
  const pitchedNotes = notes.filter((note) => note.type === 'note' && note.midiNumber !== null)
  let rawTop = SCORE_TREBLE_STAVE_Y + 10
  let rawBottom = grandStaff ? SCORE_BASS_STAVE_Y + 86 : SCORE_TREBLE_STAVE_Y + 86

  for (const note of pitchedNotes) {
    const centerY = noteCenterY(note)
    rawTop = Math.min(rawTop, centerY - NOTE_AND_MODIFIER_ALLOWANCE)
    rawBottom = Math.max(rawBottom, centerY + NOTE_AND_MODIFIER_ALLOWANCE)
  }

  const contentOffsetY = Math.max(0, SCORE_NOTATION_SAFE_MARGIN - rawTop)
  const notationTop = rawTop + contentOffsetY
  const notationBottom = rawBottom + contentOffsetY
  const systemHeight = Math.max(
    minimumSystemHeight,
    Math.ceil(notationBottom + SCORE_NOTATION_SAFE_MARGIN)
  )

  return {
    contentOffsetY,
    notationTop,
    notationBottom,
    systemHeight,
    safeMargin: SCORE_NOTATION_SAFE_MARGIN
  }
}
