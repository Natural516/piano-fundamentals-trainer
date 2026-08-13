import type { MajorKeyId, MusicAccidental } from './musicKeySignatures'

export type MusicStaffMode = 'treble' | 'bass' | 'grand'
export type MusicStaffClef = Exclude<MusicStaffMode, 'grand'>
export type MusicNotationFeedback = 'correct' | 'wrong_note' | 'timeout' | null
export type DisplayAccidental = '#' | 'b' | 'n' | null

export interface MusicNotationPitch {
  midiNumber: number
  letter: string
  accidental: MusicAccidental
  octave: number
  spelling: string
  vexFlowKey: string
  displayAccidental: DisplayAccidental
  clef: MusicStaffClef
}

export interface MusicStaffRenderModel {
  staffMode: MusicStaffMode
  keySignature: MajorKeyId
  notes: readonly MusicNotationPitch[]
  feedback: MusicNotationFeedback
}
