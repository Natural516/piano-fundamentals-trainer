import { COORDINATION_PATTERNS, createCoordinationTimeline, getCoordinationPattern } from '../utils/coordinationPatterns'
import { MAJOR_SCALE_PATTERNS, getMajorScaleByKey, SCALE_PRACTICE_MODES } from '../utils/scalePatterns'
import type { MajorScaleKey, ScalePracticeMode } from '../utils/scaleTypes'
import type { CurriculumBook, CurriculumExercise, HandMode, TechniqueTag } from './curriculumTypes'

export const CZERNY_599_COUNT = 100

/**
 * Hanon — "The Virtuoso Pianist" (public-domain original). Structured note
 * data is NOT fabricated here: only factual metadata (number, section,
 * general technique purpose) is provided until a verified MusicXML source is
 * imported. Content status stays 'partial'.
 */
export function createHanonBook(): CurriculumBook {
  const hanonSections: Array<{ number: number; title: string; section: string; tags: TechniqueTag[] }> = [
    { number: 1, title: '五指原位练习', section: '第一部分', tags: ['five-finger', 'evenness', 'weak-finger'] },
    { number: 2, title: '五指原位练习', section: '第一部分', tags: ['five-finger', 'evenness', 'weak-finger'] },
    { number: 3, title: '五指原位练习', section: '第一部分', tags: ['five-finger', 'evenness', 'weak-finger'] },
    { number: 4, title: '五指与换指练习', section: '第一部分', tags: ['five-finger', 'finger-crossing', 'evenness'] },
    { number: 5, title: '五指与换指练习', section: '第一部分', tags: ['five-finger', 'finger-crossing', 'evenness'] },
    { number: 6, title: '换指与手位练习', section: '第一部分', tags: ['finger-crossing', 'position-shift', 'thumb-under'] },
    { number: 7, title: '换指与手位练习', section: '第一部分', tags: ['finger-crossing', 'position-shift', 'thumb-under'] },
    { number: 8, title: '双手同步练习', section: '第一部分', tags: ['hand-coordination', 'sync', 'evenness'] },
    { number: 9, title: '双手同步练习', section: '第一部分', tags: ['hand-coordination', 'sync', 'evenness'] },
    { number: 10, title: '双手同步练习', section: '第一部分', tags: ['hand-coordination', 'sync', 'evenness'] }
  ]

  return {
    id: 'hanon',
    title: '哈农：钢琴练指法',
    author: 'Charles-Louis Hanon',
    publicDomainStatus: 'public-domain',
    source: 'The Virtuoso Pianist (public domain original)',
    exercises: hanonSections.map((entry) => createPartialExercise({
      bookId: 'hanon',
      number: entry.number,
      title: `第 ${entry.number} 首 · ${entry.title}`,
      section: entry.section,
      tags: entry.tags
    }))
  }
}

/**
 * Czerny Op.599 — public-domain original. The full 100-entry directory is
 * real, but technique tags are NOT guessed per number; they stay empty until a
 * verified score is imported.
 */
export function createCzernyBook(): CurriculumBook {
  return {
    id: 'czerny-599',
    title: '车尔尼599 钢琴初步教程',
    author: 'Carl Czerny',
    publicDomainStatus: 'public-domain',
    source: 'Op.599 (public domain original)',
    exercises: Array.from({ length: CZERNY_599_COUNT }, (_, index) => createPartialExercise({
      bookId: 'czerny-599',
      number: index + 1,
      title: `第 ${index + 1} 首`,
      section: null,
      tags: []
    }))
  }
}

function createPartialExercise(input: {
  bookId: string
  number: number
  title: string
  section: string | null
  tags: TechniqueTag[]
}): CurriculumExercise {
  return {
    id: `${input.bookId}-${input.number}`,
    bookId: input.bookId,
    number: input.number,
    title: input.title,
    source: 'public domain original; structured score pending import',
    publicDomainStatus: 'public-domain',
    difficulty: input.bookId === 'hanon' ? 'elementary' : 'beginner',
    techniqueTags: input.tags,
    recommendedTempo: null,
    handMode: 'both',
    section: input.section,
    musicXmlPath: null,
    noteSequence: null,
    contentStatus: 'partial'
  }
}

/**
 * Scale-as-curriculum: inherits the existing 12-major-scale engine as real,
 * verified exercises (the old scale practice capability).
 */
export function createScaleBook(): CurriculumBook {
  return {
    id: 'scales',
    title: '音阶练习（十二大调）',
    author: 'Standard major scale exercises',
    publicDomainStatus: 'public-domain',
    source: 'Standard major scales',
    exercises: MAJOR_SCALE_PATTERNS.flatMap((scale) =>
      SCALE_PRACTICE_MODES
        .filter((mode) => mode.id === 'right-ascending' || mode.id === 'right-up-down' || mode.id === 'both-ascending')
        .map((mode) => createScaleExercise(scale.key, mode.id))
    )
  }
}

function createScaleExercise(key: MajorScaleKey, mode: ScalePracticeMode): CurriculumExercise {
  const scale = getMajorScaleByKey(key)
  const modeName = SCALE_PRACTICE_MODES.find((candidate) => candidate.id === mode)?.name ?? mode
  const handMode: HandMode = mode.startsWith('both') ? 'both' : mode.startsWith('left') ? 'left' : 'right'
  const tags: TechniqueTag[] = ['scale', 'evenness']
  if (handMode === 'both') {
    tags.push('hand-coordination', 'sync')
  }

  return {
    id: `scale-${key}-${mode}`,
    bookId: 'scales',
    number: MAJOR_SCALE_PATTERNS.findIndex((candidate) => candidate.key === key) + 1,
    title: `${scale.name} · ${modeName}`,
    source: 'Standard major scales',
    publicDomainStatus: 'public-domain',
    difficulty: mode === 'both-ascending' ? 'intermediate' : 'beginner',
    techniqueTags: tags,
    recommendedTempo: 60,
    handMode,
    section: null,
    musicXmlPath: null,
    noteSequence: { midi: scale.notes },
    contentStatus: 'verified'
  }
}

/**
 * Coordination-as-curriculum: inherits the existing coordination timelines as
 * real exercises for hand-sync analysis.
 */
export function createCoordinationBook(): CurriculumBook {
  return {
    id: 'coordination',
    title: '左右手协调练习',
    author: 'Built-in coordination patterns',
    publicDomainStatus: 'original',
    source: 'Built-in coordination patterns',
    exercises: COORDINATION_PATTERNS.map((pattern, index) => {
      const detail = getCoordinationPattern(pattern.id)
      const eighthNoteDurationMs = 60000 / detail.bpmDefault / 2
      const timeline = createCoordinationTimeline(detail, 1, eighthNoteDurationMs)
      const midiNotes = [...new Set(
        timeline.flatMap((step) => [...step.leftNotes, ...step.rightNotes])
      )].sort((left, right) => left - right)

      return {
        id: `coordination-${pattern.id}`,
        bookId: 'coordination',
        number: index + 1,
        title: pattern.name,
        source: 'Built-in coordination patterns',
        publicDomainStatus: 'original',
        difficulty: 'beginner',
        techniqueTags: ['hand-coordination', 'sync'],
        recommendedTempo: pattern.bpmDefault,
        handMode: 'both',
        section: null,
        musicXmlPath: null,
        noteSequence: { midi: midiNotes },
        contentStatus: 'verified'
      }
    })
  }
}

export const CURRICULUM_BOOKS: CurriculumBook[] = [
  createHanonBook(),
  createCzernyBook(),
  createScaleBook(),
  createCoordinationBook()
]

export function getCurriculumBook(bookId: string): CurriculumBook {
  return CURRICULUM_BOOKS.find((book) => book.id === bookId) ?? CURRICULUM_BOOKS[0]
}

export function getCurriculumExercise(exerciseId: string): CurriculumExercise | null {
  for (const book of CURRICULUM_BOOKS) {
    const exercise = book.exercises.find((candidate) => candidate.id === exerciseId)
    if (exercise) return exercise
  }
  return null
}
