import { midiNumberToNoteName } from './midiNotes'
import type { TargetEvent } from './practiceTypes'
import type { RhythmGridCell, RhythmPattern } from './rhythmTypes'

export const RHYTHM_BEATS_PER_MEASURE = 4
export const RHYTHM_MEASURE_COUNT = 4
export const RHYTHM_PRACTICE_NOTE = 60

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  {
    id: 'quarter-basic',
    name: '四分音符基础',
    description: '4/4 每拍弹一次 C4，训练稳定拍点。',
    subdivision: 'quarter',
    beats: [
      { position: 0, duration: 1, type: 'note' },
      { position: 1, duration: 1, type: 'note' },
      { position: 2, duration: 1, type: 'note' },
      { position: 3, duration: 1, type: 'note' }
    ]
  },
  {
    id: 'eighth-notes',
    name: '八分音符',
    description: '1 & 2 & 3 & 4 & 全部弹奏，训练均匀细分。',
    subdivision: 'eighth',
    beats: [
      { position: 0, duration: 0.5, type: 'note' },
      { position: 0.5, duration: 0.5, type: 'note' },
      { position: 1, duration: 0.5, type: 'note' },
      { position: 1.5, duration: 0.5, type: 'note' },
      { position: 2, duration: 0.5, type: 'note' },
      { position: 2.5, duration: 0.5, type: 'note' },
      { position: 3, duration: 0.5, type: 'note' },
      { position: 3.5, duration: 0.5, type: 'note' }
    ]
  },
  {
    id: 'quarter-rests',
    name: '四分音符 + 休止',
    description: '第 1、3 拍弹 C4，第 2、4 拍保持休止。',
    subdivision: 'quarter',
    beats: [
      { position: 0, duration: 1, type: 'note' },
      { position: 1, duration: 1, type: 'rest' },
      { position: 2, duration: 1, type: 'note' },
      { position: 3, duration: 1, type: 'rest' }
    ]
  },
  {
    id: 'simple-syncopation',
    name: '简单切分',
    description: '在 1、2、3&、4& 弹 C4，训练弱拍进入。',
    subdivision: 'eighth',
    beats: [
      { position: 0, duration: 0.5, type: 'note' },
      { position: 0.5, duration: 0.5, type: 'rest' },
      { position: 1, duration: 0.5, type: 'note' },
      { position: 1.5, duration: 0.5, type: 'rest' },
      { position: 2, duration: 0.5, type: 'rest' },
      { position: 2.5, duration: 0.5, type: 'note' },
      { position: 3, duration: 0.5, type: 'rest' },
      { position: 3.5, duration: 0.5, type: 'note' }
    ]
  }
]

function formatPositionLabel(position: number): string {
  const beat = Math.floor(position) + 1
  return position % 1 === 0 ? `${beat}` : `${beat}&`
}

function formatGridLabel(position: number): string {
  return position % 1 === 0 ? `${Math.floor(position) + 1}` : '&'
}

export function getRhythmPatternById(patternId: string): RhythmPattern {
  return RHYTHM_PATTERNS.find((pattern) => pattern.id === patternId) ?? RHYTHM_PATTERNS[0]
}

export function getRhythmGridCells(pattern: RhythmPattern): RhythmGridCell[] {
  const step = pattern.subdivision === 'eighth' ? 0.5 : 1
  const cells: RhythmGridCell[] = []

  for (let position = 0; position < RHYTHM_BEATS_PER_MEASURE; position += step) {
    const beat = pattern.beats.find((candidate) => candidate.position === position)

    cells.push({
      id: `${pattern.id}-${position}`,
      label: formatGridLabel(position),
      position,
      duration: beat?.duration ?? step,
      type: beat?.type ?? 'rest'
    })
  }

  return cells
}

export function createRhythmTargets(
  pattern: RhythmPattern,
  beatDurationMs: number,
  measureCount = RHYTHM_MEASURE_COUNT,
  practiceNote = RHYTHM_PRACTICE_NOTE
): TargetEvent[] {
  const noteName = midiNumberToNoteName(practiceNote)

  return Array.from({ length: measureCount }).flatMap((_, measureIndex) =>
    pattern.beats.map((beat, beatIndex) => {
      const targetType = beat.type
      const measureStartBeats = measureIndex * RHYTHM_BEATS_PER_MEASURE
      const label = `第 ${measureIndex + 1} 小节 ${formatPositionLabel(beat.position)} ${targetType === 'note' ? noteName : '休止'}`

      return {
        id: `${pattern.id}-m${measureIndex + 1}-${beatIndex + 1}`,
        timeMs: (measureStartBeats + beat.position) * beatDurationMs,
        notes: targetType === 'note' ? [practiceNote] : [],
        durationMs: beat.duration * beatDurationMs,
        type: targetType,
        label,
        hand: 'both'
      } satisfies TargetEvent
    })
  )
}
