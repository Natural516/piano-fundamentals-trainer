import { getMajorKeySignature, type MajorKeyId } from './musicKeySignatures'
import type {
  MusicNotationFeedback,
  MusicNotationPitch,
  MusicStaffMode,
  MusicStaffRenderModel
} from './musicNotationTypes'

export const MUSIC_STAFF_LAYOUT = {
  single: {
    height: 214,
    staveY: 48
  },
  grand: {
    height: 272,
    trebleStaveY: 28,
    bassStaveY: 128
  }
} as const

const STAFF_MODES: readonly MusicStaffMode[] = ['treble', 'bass', 'grand']
const FEEDBACK_VALUES: readonly Exclude<MusicNotationFeedback, null>[] = ['correct', 'wrong_note', 'timeout']

export interface MusicStaffRenderInput {
  staffMode?: unknown
  keySignature?: unknown
  notes?: readonly MusicNotationPitch[] | null
  feedback?: unknown
}

export function createMusicStaffRenderModel(input: MusicStaffRenderInput): MusicStaffRenderModel {
  const staffMode = STAFF_MODES.includes(input.staffMode as MusicStaffMode)
    ? input.staffMode as MusicStaffMode
    : 'treble'
  const keySignature = getMajorKeySignature(input.keySignature).id as MajorKeyId
  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note) => Number.isInteger(note?.midiNumber)).slice(0, 3)
    : []
  const feedback = FEEDBACK_VALUES.includes(input.feedback as Exclude<MusicNotationFeedback, null>)
    ? input.feedback as Exclude<MusicNotationFeedback, null>
    : null

  return { staffMode, keySignature, notes, feedback }
}
