import {
  Formatter,
  Stave,
  type RenderContext,
  type Voice
} from 'vexflow/bravura'

export interface ScoreSheetHeaderOptions {
  showHeader: boolean
  keySignature: string
  timeSignature: string
}

export interface ScoreSheetHeaderDiagnostic {
  staff: 1 | 2
  clef: 'treble' | 'bass' | null
  keySignature: string | null
  timeSignature: string | null
  measureContentStartX: number
}

export interface ScoreSheetVoiceEntry {
  voice: Voice
  stave: Stave
}

export interface ScoreSheetTimeAxisDiagnostic {
  measureContentStartX: number
  measureContentEndX: number
  justifyWidth: number
}

/**
 * Adds the same header columns to both halves of a grand staff and then uses
 * VexFlow's multi-stave modifier alignment. Clef glyph widths may differ, but
 * the shared measure-content start never does.
 */
export function configureScoreSheetHeaders(
  trebleStave: Stave,
  bassStave: Stave | null,
  options: ScoreSheetHeaderOptions
): ScoreSheetHeaderDiagnostic[] {
  const entries: Array<{ staff: 1 | 2; clef: 'treble' | 'bass'; stave: Stave }> = [
    { staff: 1, clef: 'treble', stave: trebleStave }
  ]
  if (bassStave) entries.push({ staff: 2, clef: 'bass', stave: bassStave })

  if (options.showHeader) {
    for (const entry of entries) {
      entry.stave
        .addClef(entry.clef)
        .addKeySignature(options.keySignature)
        .addTimeSignature(options.timeSignature)
    }
  }

  const staves = entries.map((entry) => entry.stave)
  Stave.formatBegModifiers(staves)
  const measureContentStartX = Math.max(...staves.map((stave) => stave.getNoteStartX()))
  staves.forEach((stave) => stave.setNoteStartX(measureContentStartX))

  return entries.map((entry) => ({
    staff: entry.staff,
    clef: options.showHeader ? entry.clef : null,
    keySignature: options.showHeader ? options.keySignature : null,
    timeSignature: options.showHeader ? options.timeSignature : null,
    measureContentStartX
  }))
}

/**
 * Formats every voice in the measure on one exact tick grid. Voices retain
 * their own stave for Y geometry, while identical score ticks receive the same
 * TickContext X across staff and voice boundaries.
 */
export function formatScoreSheetVoices(
  entries: ScoreSheetVoiceEntry[],
  context?: RenderContext
): ScoreSheetTimeAxisDiagnostic {
  if (entries.length === 0) {
    return { measureContentStartX: 0, measureContentEndX: 0, justifyWidth: 0 }
  }

  const staves = [...new Set(entries.map((entry) => entry.stave))]
  const measureContentStartX = Math.max(...staves.map((stave) => stave.getNoteStartX()))
  const measureContentEndX = Math.min(...staves.map((stave) => stave.getNoteEndX()))
  staves.forEach((stave) => stave.setNoteStartX(measureContentStartX))

  for (const entry of entries) {
    entry.voice.setStave(entry.stave).preFormat()
  }

  const voices = entries.map((entry) => entry.voice)
  const justifyWidth = Math.max(
    0,
    measureContentEndX - measureContentStartX - Stave.defaultPadding
  )
  const formatter = new Formatter().joinVoices(voices)
  formatter.format(voices, justifyWidth, context ? { context } : undefined)

  return { measureContentStartX, measureContentEndX, justifyWidth }
}
