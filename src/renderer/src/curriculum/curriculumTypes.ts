export type HandMode = 'left' | 'right' | 'both'

export type TechniqueTag =
  | 'five-finger'
  | 'finger-crossing'
  | 'position-shift'
  | 'scale'
  | 'arpeggio'
  | 'broken-chord'
  | 'alberti-bass'
  | 'melody-accompaniment'
  | 'staccato'
  | 'legato'
  | 'speed'
  | 'evenness'
  | 'hand-coordination'
  | 'weak-finger'
  | 'thumb-under'
  | 'endurance'
  | 'sync'
  | 'dynamics'

export type ExerciseContentStatus = 'verified' | 'partial' | 'pending'

export interface CurriculumExercise {
  id: string
  bookId: string
  number: number
  title: string
  source: string
  publicDomainStatus: 'public-domain' | 'original' | 'licensed'
  difficulty: 'beginner' | 'elementary' | 'intermediate' | 'advanced'
  techniqueTags: TechniqueTag[]
  recommendedTempo: number | null
  handMode: HandMode
  section: string | null
  musicXmlPath: string | null
  noteSequence: { midi: number[]; durationsMs?: number[] } | null
  contentStatus: ExerciseContentStatus
}

export interface CurriculumBook {
  id: string
  title: string
  author: string
  publicDomainStatus: 'public-domain' | 'original' | 'licensed'
  source: string
  exercises: CurriculumExercise[]
}

export type ExerciseProgressStatus = 'not-started' | 'in-progress' | 'close-to-mastery' | 'mastered' | 'review'

export interface ExerciseProgress {
  exerciseId: string
  status: ExerciseProgressStatus
  currentTempo: number | null
  targetTempo: number | null
  maxStableTempo: number | null
  attempts: number
  totalDurationMs: number
  lastPracticedAt: string | null
  notes: string
}

export interface CurriculumProgressState {
  version: 1
  exercises: Record<string, ExerciseProgress>
}

export interface PracticePrescription {
  exerciseId: string
  currentTempo: number
  targetTempo: number
  handMode: HandMode
  loops: number
  notes: string
}

export const CURRICULUM_PROGRESS_VERSION = 1
