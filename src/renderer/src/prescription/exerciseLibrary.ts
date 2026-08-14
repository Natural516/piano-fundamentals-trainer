import { CURRICULUM_BOOKS, getCurriculumExercise } from '../curriculum/curriculumCatalog'
import type { AbilitySkillId } from '../ability/abilityModel'

export interface ExerciseDefinition {
  id: string
  title: string
  category: 'sight-reading' | 'rhythm' | 'scale' | 'chord' | 'coordination' | 'score' | 'technique'
  source: string
  sourceType: 'builtin' | 'musicxml' | 'mxl' | 'midi'
  verified: boolean
  licenseStatus: 'verified' | 'public-domain' | 'original' | 'user-import' | 'licensed' | 'partial'
  scoreAsset: boolean
  practiceReady: boolean
  targetSkills: AbilitySkillId[]
  secondarySkills: AbilitySkillId[]
  difficulty: 'beginner' | 'elementary' | 'intermediate' | 'advanced'
  recommendedTempoRange?: [number, number]
  prerequisites?: string[]
  notes: string
}

function fromCurriculumExercise(exerciseId: string, targetSkills: AbilitySkillId[]): ExerciseDefinition | null {
  const exercise = getCurriculumExercise(exerciseId)
  if (!exercise) return null
  const category = exercise.bookId === 'scales'
    ? 'scale'
    : exercise.bookId === 'coordination'
      ? 'coordination'
      : 'technique'
  return {
    id: exercise.id,
    title: exercise.title,
    category,
    source: exercise.source,
    sourceType: exercise.musicXmlPath ? 'musicxml' : 'builtin',
    verified: exercise.contentStatus === 'verified',
    licenseStatus: exercise.publicDomainStatus,
    scoreAsset: exercise.noteSequence !== null,
    practiceReady: exercise.contentStatus === 'verified' && exercise.noteSequence !== null,
    targetSkills,
    secondarySkills: [],
    difficulty: exercise.difficulty,
    recommendedTempoRange: exercise.recommendedTempo ? [Math.max(40, exercise.recommendedTempo - 20), exercise.recommendedTempo + 20] : undefined,
    prerequisites: [],
    notes: exercise.contentStatus === 'partial' ? 'CONTENT PARTIAL：尚无结构化乐谱，不作为 Practice Ready' : '内置确定性练习'
  }
}

export const EXERCISE_LIBRARY: ExerciseDefinition[] = [
  ...(['scale-C-right-ascending', 'scale-G-right-ascending', 'scale-C-both-ascending'] as const)
    .map((id) => fromCurriculumExercise(id, ['scale']))
    .filter((definition): definition is ExerciseDefinition => definition !== null),
  ...(['coordination-hands-together', 'coordination-slow-left-fast-right'] as const)
    .map((id) => fromCurriculumExercise(id, ['coordination']))
    .filter((definition): definition is ExerciseDefinition => definition !== null),
  {
    id: 'drill-sight-reading-treble',
    title: '识谱：高音谱表调内音',
    category: 'sight-reading',
    source: '内置识谱生成器',
    sourceType: 'builtin',
    verified: true,
    licenseStatus: 'original',
    scoreAsset: false,
    practiceReady: true,
    targetSkills: ['sight-reading'],
    secondarySkills: [],
    difficulty: 'beginner',
    recommendedTempoRange: [40, 90],
    prerequisites: [],
    notes: '确定性生成识谱题，10–100 题/轮'
  },
  {
    id: 'drill-rhythm-four-quarter',
    title: '节奏：四分音符稳定拍',
    category: 'rhythm',
    source: '内置节奏模板',
    sourceType: 'builtin',
    verified: true,
    licenseStatus: 'original',
    scoreAsset: false,
    practiceReady: true,
    targetSkills: ['rhythm'],
    secondarySkills: [],
    difficulty: 'beginner',
    recommendedTempoRange: [50, 100],
    prerequisites: [],
    notes: '确定性时间轴判定 early/late/miss'
  },
  {
    id: 'drill-chord-identity',
    title: '和弦：大三/小三身份识别',
    category: 'chord',
    source: '和弦 V2 生成器',
    sourceType: 'builtin',
    verified: true,
    licenseStatus: 'original',
    scoreAsset: false,
    practiceReady: true,
    targetSkills: ['chord'],
    secondarySkills: [],
    difficulty: 'beginner',
    recommendedTempoRange: undefined,
    prerequisites: [],
    notes: '柱式 150ms 窗口 + 身份判定'
  }
]

export function getExercisesForSkill(skillId: AbilitySkillId): ExerciseDefinition[] {
  return EXERCISE_LIBRARY
    .filter((definition) => definition.targetSkills.includes(skillId) && definition.practiceReady)
    .sort((left, right) => left.difficulty.localeCompare(right.difficulty))
}

export function getPracticeReadyCount(): number {
  return EXERCISE_LIBRARY.filter((definition) => definition.practiceReady).length
}

export interface MicroDrillInput {
  skillId: AbilitySkillId
  measureCount: number
  range: { lowest: number; highest: number }
  hand: 'left' | 'right' | 'both'
}

export interface MicroDrill {
  id: string
  title: string
  notes: number[]
  validation: { valid: boolean; reasons: string[] }
}

/**
 * Deterministic generated micro drill (2–4 measures, single target). The AI
 * may propose parameters; only the deterministic engine generates/validates.
 */
export function createMicroDrill(input: MicroDrillInput): MicroDrill {
  const measureCount = Math.min(4, Math.max(2, Math.round(input.measureCount)))
  const notes: number[] = []
  const reasons: string[] = []
  const base = input.skillId === 'scale' ? 60 : 64

  for (let index = 0; index < measureCount * 4; index += 1) {
    notes.push(base + (index % 8))
  }

  if (notes.length < 8) reasons.push('音符过少')
  if (notes.some((note) => note < input.range.lowest || note > input.range.highest)) reasons.push('超出音域')
  if (input.hand === 'both' && Math.max(...notes) - Math.min(...notes) > 24) reasons.push('手跨度过大')

  return {
    id: `micro-${input.skillId}-${measureCount}-${input.hand}-${Date.now()}`,
    title: `${measureCount} 小节 Micro Drill（${input.skillId} / ${input.hand}）`,
    notes,
    validation: { valid: reasons.length === 0, reasons }
  }
}

export { CURRICULUM_BOOKS }
