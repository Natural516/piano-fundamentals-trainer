import type { ChordV2Identity, ChordV2Quality, VoicingSpec } from '../chordV2/chordV2Types'

export type ProgressionId = '4536251' | 'I-IV-V-I' | 'I-V-vi-IV' | 'ii-V-I' | 'I-vi-IV-V'

export interface ProgressionStepDefinition {
  degree: number
  quality: ChordV2Quality
}

export interface ProgressionDefinition {
  id: ProgressionId
  name: string
  steps: ProgressionStepDefinition[]
}

export interface ProgressionStepModel {
  index: number
  degree: number
  roman: string
  function: 'tonic' | 'subdominant' | 'dominant' | 'other' | null
  identity: ChordV2Identity
  voicing: VoicingSpec
  bassConstraint: number | null
}

export interface ProgressionModel {
  id: ProgressionId
  name: string
  key: number
  steps: ProgressionStepModel[]
}

export interface ArrangementVariation {
  progressionId: ProgressionId
  key: number
  steps: Array<{
    index: number
    roman: string
    symbol: string
    texture: 'block' | 'arpeggio'
    exactNotes: number[]
  }>
  voiceLeadingScore: number
  playable: boolean
}

export const PROGRESSION_IDS: ProgressionId[] = ['4536251', 'I-IV-V-I', 'I-V-vi-IV', 'ii-V-I', 'I-vi-IV-V']

export const PROGRESSION_LABELS: Record<ProgressionId, string> = {
  '4536251': '4536251',
  'I-IV-V-I': 'I-IV-V-I',
  'I-V-vi-IV': 'I-V-vi-IV',
  'ii-V-I': 'ii-V-I',
  'I-vi-IV-V': 'I-vi-IV-V'
}
