export type ChordV2Quality =
  | 'major'
  | 'minor'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  | '6'
  | 'm6'
  | 'maj7'
  | '7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | 'add9'
  | '9'
  | 'm9'
  | 'maj9'
  | '6/9'

export type ChordV2Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type ChordV2InversionMode = 'all' | 'root' | 'inversions'
export type ChordV2Texture = 'block' | 'arpeggio' | 'composite'
export type ChordV2JudgeMode = 'identity' | 'inversion' | 'exact'

export interface ChordV2Identity {
  root: number
  quality: ChordV2Quality
  requiredPitchClasses: number[]
  optionalPitchClasses: number[]
  extensions: number[]
  alterations: number[]
}

export interface VoicingSpec {
  identity: ChordV2Identity
  exactNotes: number[]
  register: { lowest: number; highest: number }
  doublings: number[]
  spacing: 'close' | 'open'
  hands: 'left' | 'right' | 'both'
  voiceCount: number
  bassConstraint: number | null
  requiredTones: number[]
  optionalTones: number[]
  allowedOmissions: number[]
  range: { lowest: number; highest: number }
}

export type ChordV2Judgement = 'correct' | 'missing' | 'extra' | 'wrong_bass' | 'wrong_notes'

export interface ChordV2Result {
  judgement: ChordV2Judgement
  missingNotes: number[]
  extraNotes: number[]
}

export interface HarmonyContext {
  key: number
  scaleDegree: number | null
  function: 'tonic' | 'subdominant' | 'dominant' | 'other' | null
  precedingChord: ChordV2Identity | null
  nextChord: ChordV2Identity | null
  secondaryFunction: string | null
}

export const CHORD_V2_DIFFICULTY_QUALITIES: Record<ChordV2Difficulty, ChordV2Quality[]> = {
  1: ['major', 'minor'],
  2: ['major', 'minor'],
  3: ['dim', 'aug', 'sus2', 'sus4'],
  4: ['maj7', '7', 'm7'],
  5: ['m7b5', 'dim7'],
  6: ['6', 'm6', 'add9', '9', 'm9', 'maj9', '6/9'],
  7: ['major', 'minor', 'maj7', '7', 'm7', 'm7b5', 'dim7']
}

export const CHORD_V2_DIFFICULTY_LABELS: Record<ChordV2Difficulty, string> = {
  1: 'L1 大三/小三原位',
  2: 'L2 大三/小三转位',
  3: 'L3 dim/aug/sus',
  4: 'L4 七和弦',
  5: 'L5 七和弦转位/m7♭5/dim7',
  6: 'L6 扩展与开放',
  7: 'L7 连接与功能'
}
