import { midiNumberToNoteName } from './midiNotes'
import type { TargetEvent } from './practiceTypes'
import { createEqualSubdivisionPositions, createPolyrhythmPoints } from './timingSubdivisions'
import type { RhythmBeat, RhythmCategory, RhythmGridCell, RhythmPattern } from './rhythmTypes'

export const RHYTHM_BEATS_PER_MEASURE = 4
export const RHYTHM_MEASURE_COUNT = 4
export const RHYTHM_PRACTICE_NOTE = 60
export const RHYTHM_LEFT_NOTE = 48

export const RHYTHM_CATEGORY_LABELS: Record<RhythmCategory, string> = {
  basic: '基础节奏',
  dotted: '附点节奏',
  syncopation: '切分节奏',
  triplet: '三连音',
  polyrhythm: '三对二',
  mixed: '混合节奏'
}

function beat(position: number, duration: number, type: RhythmBeat['type'], symbol?: string): RhythmBeat {
  return { position, duration, type, symbol }
}

function createRegularBeats(divisionsPerBeat: number, noteIndexes: number[], beatCount = RHYTHM_BEATS_PER_MEASURE): RhythmBeat[] {
  return createEqualSubdivisionPositions(divisionsPerBeat, beatCount).map((position, index) =>
    beat(position, 1 / divisionsPerBeat, noteIndexes.includes(index) ? 'note' : 'rest')
  )
}

function createDottedQuarterEighthBeats(eighthFirst: boolean): RhythmBeat[] {
  return [0, 2].flatMap((start) => eighthFirst
    ? [beat(start, 0.5, 'note'), beat(start + 0.5, 1.5, 'note')]
    : [beat(start, 1.5, 'note'), beat(start + 1.5, 0.5, 'note')]
  )
}

function createDottedEighthSixteenthBeats(sixteenthFirst: boolean): RhythmBeat[] {
  return [0, 1, 2, 3].flatMap((start) => sixteenthFirst
    ? [beat(start, 0.25, 'note'), beat(start + 0.25, 0.75, 'note')]
    : [beat(start, 0.75, 'note'), beat(start + 0.75, 0.25, 'note')]
  )
}

function createEighthTripletAlternationBeats(): RhythmBeat[] {
  return [
    beat(0, 0.5, 'note'), beat(0.5, 0.5, 'note'),
    beat(1, 0.5, 'note'), beat(1.5, 0.5, 'note'),
    beat(2, 1 / 3, 'note', '3'), beat(2 + 1 / 3, 1 / 3, 'note', '3'), beat(2 + 2 / 3, 1 / 3, 'note', '3'),
    beat(3, 1 / 3, 'note', '3'), beat(3 + 1 / 3, 1 / 3, 'note', '3'), beat(3 + 2 / 3, 1 / 3, 'note', '3')
  ]
}

function createMixedRhythmBeats(): RhythmBeat[] {
  return [
    beat(0, 1, 'note'),
    beat(1, 0.5, 'note'), beat(1.5, 0.5, 'note'),
    beat(2, 1 / 3, 'note', '3'), beat(2 + 1 / 3, 1 / 3, 'note', '3'), beat(2 + 2 / 3, 1 / 3, 'note', '3'),
    beat(3, 0.5, 'note'), beat(3.5, 0.5, 'note')
  ]
}

function createTripletBeats(noteIndexes?: number[]): RhythmBeat[] {
  const positions = createEqualSubdivisionPositions(3, RHYTHM_BEATS_PER_MEASURE)
  const enabled = noteIndexes ?? positions.map((_, index) => index)
  return positions.map((position, index) => beat(position, 1 / 3, enabled.includes(index) ? 'note' : 'rest', '3'))
}

function createPolyrhythmBeats(leftParts: 2 | 3, rightParts: 2 | 3, preparatoryBeats = 0): RhythmBeat[] {
  return createPolyrhythmPoints(leftParts, rightParts, RHYTHM_BEATS_PER_MEASURE).map((point, index, points) => {
    const inPreparation = point.position < preparatoryBeats
    const left = point.left
    const right = inPreparation ? false : point.right
    const notes = [...(left ? [RHYTHM_LEFT_NOTE] : []), ...(right ? [RHYTHM_PRACTICE_NOTE] : [])]
    const nextPosition = points[index + 1]?.position ?? RHYTHM_BEATS_PER_MEASURE

    return {
      position: point.position,
      duration: nextPosition - point.position,
      type: notes.length > 0 ? 'note' : 'rest',
      notes,
      hand: left && right ? 'both' : left ? 'left' : 'right',
      symbol: left && right ? 'L+R' : left ? 'L' : 'R'
    }
  })
}

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  {
    id: 'quarter-basic', name: '四分音符基础', description: '4/4 每拍弹一次 C4，训练稳定拍点。',
    category: 'basic', difficulty: 'basic', subdivision: 'quarter',
    beats: [beat(0, 1, 'note'), beat(1, 1, 'note'), beat(2, 1, 'note'), beat(3, 1, 'note')]
  },
  {
    id: 'eighth-notes', name: '八分音符', description: '1 & 2 & 3 & 4 & 全部弹奏，训练均匀细分。',
    category: 'basic', difficulty: 'basic', subdivision: 'eighth', beats: createRegularBeats(2, [0, 1, 2, 3, 4, 5, 6, 7])
  },
  {
    id: 'quarter-rests', name: '四分音符 + 休止', description: '第 1、3 拍弹 C4，第 2、4 拍保持休止。',
    category: 'basic', difficulty: 'basic', subdivision: 'quarter',
    beats: [beat(0, 1, 'note'), beat(1, 1, 'rest'), beat(2, 1, 'note'), beat(3, 1, 'rest')]
  },
  {
    id: 'simple-syncopation', name: '简单切分', description: '在 1、2、3&、4& 弹 C4，训练弱拍进入。',
    category: 'syncopation', difficulty: 'basic', subdivision: 'eighth', beats: createRegularBeats(2, [0, 2, 5, 7])
  },
  {
    id: 'dotted-quarter-eighth', name: '附点四分音符 + 八分音符', description: '每两拍按附点四分音符与八分音符组合进入。',
    category: 'dotted', difficulty: 'intermediate', subdivision: 'eighth', beats: createDottedQuarterEighthBeats(false)
  },
  {
    id: 'eighth-dotted-quarter', name: '八分音符 + 附点四分音符', description: '先弹八分音符，再保持一个附点四分音符时值。',
    category: 'dotted', difficulty: 'intermediate', subdivision: 'eighth', beats: createDottedQuarterEighthBeats(true)
  },
  {
    id: 'dotted-eighth-sixteenth', name: '附点八分音符 + 十六分音符', description: '每拍在拍头与最后一个十六分位置弹奏。',
    category: 'dotted', difficulty: 'intermediate', subdivision: 'sixteenth', beats: createDottedEighthSixteenthBeats(false)
  },
  {
    id: 'sixteenth-dotted-eighth', name: '十六分音符 + 附点八分音符', description: '每拍前两个十六分位置形成短长组合。',
    category: 'dotted', difficulty: 'intermediate', subdivision: 'sixteenth', beats: createDottedEighthSixteenthBeats(true)
  },
  {
    id: 'eighth-offbeat-syncopation', name: '八分音符弱拍切分', description: '拍头休止，在每拍后半拍进入。',
    category: 'syncopation', difficulty: 'intermediate', subdivision: 'eighth', beats: createRegularBeats(2, [1, 3, 5, 7])
  },
  {
    id: 'quarter-cross-beat-syncopation', name: '四分音符跨拍切分', description: '弱拍进入并跨越下一拍，训练持续的切分重心。',
    category: 'syncopation', difficulty: 'intermediate', subdivision: 'eighth', beats: createRegularBeats(2, [1, 4, 7])
  },
  {
    id: 'rest-syncopation', name: '带休止符的切分', description: '休止与弱拍音交替，避免在空拍误触发。',
    category: 'syncopation', difficulty: 'intermediate', subdivision: 'eighth', beats: createRegularBeats(2, [1, 2, 5, 6])
  },
  {
    id: 'two-measure-mixed-syncopation', name: '连续两小节混合切分', description: '四拍型内部混合正拍、弱拍和休止，循环形成两小节连续训练。',
    category: 'syncopation', difficulty: 'challenge', subdivision: 'mixed', lengthBeats: 8,
    beats: createRegularBeats(2, [0, 3, 6, 8, 9, 12, 15], 8)
  },
  {
    id: 'eighth-triplets', name: '一拍三个八分三连音', description: '每拍准确三等分，连续弹奏十二个三连音位置。',
    category: 'triplet', difficulty: 'challenge', subdivision: 'triplet', beats: createTripletBeats()
  },
  {
    id: 'quarter-triplet-alternation', name: '四分音符与三连音交替', description: '第 1、3 拍只弹拍头，第 2、4 拍弹完整三连音。',
    category: 'triplet', difficulty: 'challenge', subdivision: 'triplet', beats: createTripletBeats([0, 3, 4, 5, 6, 9, 10, 11])
  },
  {
    id: 'eighth-triplet-alternation', name: '八分音符与三连音交替', description: '前两拍八分感，后两拍切换到准确三连音。',
    category: 'triplet', difficulty: 'challenge', subdivision: 'mixed', beats: createEighthTripletAlternationBeats()
  },
  {
    id: 'two-against-three-left-two', name: '左手二等分、右手三等分', description: '左手 C3 每拍二等分，右手 C4 每拍三等分。',
    category: 'polyrhythm', difficulty: 'challenge', subdivision: 'mixed', beats: createPolyrhythmBeats(2, 3)
  },
  {
    id: 'two-against-three-left-three', name: '左手三等分、右手二等分', description: '左手 C3 每拍三等分，右手 C4 每拍二等分。',
    category: 'polyrhythm', difficulty: 'challenge', subdivision: 'mixed', beats: createPolyrhythmBeats(3, 2)
  },
  {
    id: 'two-against-three-preparation', name: '单手预备后双手进入', description: '前两拍左手单独二等分，后两拍加入右手三等分。',
    category: 'polyrhythm', difficulty: 'challenge', subdivision: 'mixed', beats: createPolyrhythmBeats(2, 3, 2)
  },
  {
    id: 'mixed-quarter-eighth-triplet', name: '四分、八分与三连音混合', description: '在一个四拍型中切换拍点、二等分和三等分。',
    category: 'mixed', difficulty: 'challenge', subdivision: 'mixed', beats: createMixedRhythmBeats()
  }
]

function isSamePosition(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001
}

function formatPositionLabel(position: number): string {
  const beatNumber = Math.floor(position) + 1
  const fraction = position - Math.floor(position)
  if (isSamePosition(fraction, 0)) return `${beatNumber}`
  if (isSamePosition(fraction, 0.5)) return `${beatNumber}&`
  if (isSamePosition(fraction, 1 / 3)) return `${beatNumber}三连2`
  if (isSamePosition(fraction, 2 / 3)) return `${beatNumber}三连3`
  if (isSamePosition(fraction, 0.25)) return `${beatNumber}e`
  if (isSamePosition(fraction, 0.75)) return `${beatNumber}a`
  return `${beatNumber}+${Math.round(fraction * 100) / 100}`
}

function formatGridLabel(position: number): string {
  const label = formatPositionLabel(position)
  return label.replace(/^\d+/, '') || `${Math.floor(position) + 1}`
}

export function getRhythmPatternById(patternId: string): RhythmPattern {
  return RHYTHM_PATTERNS.find((pattern) => pattern.id === patternId) ?? RHYTHM_PATTERNS[0]
}

export function getRhythmGridCells(pattern: RhythmPattern): RhythmGridCell[] {
  return pattern.beats.map((currentBeat, index) => ({
    id: `${pattern.id}-${index}`,
    label: formatGridLabel(currentBeat.position),
    position: currentBeat.position,
    duration: currentBeat.duration,
    type: currentBeat.type,
    symbol: currentBeat.symbol
  }))
}

export function createRhythmTargets(
  pattern: RhythmPattern,
  beatDurationMs: number,
  measureCount = RHYTHM_MEASURE_COUNT,
  practiceNote = RHYTHM_PRACTICE_NOTE
): TargetEvent[] {
  const patternLengthBeats = pattern.lengthBeats ?? RHYTHM_BEATS_PER_MEASURE

  return Array.from({ length: measureCount }).flatMap((_, measureIndex) =>
    pattern.beats.map((currentBeat, beatIndex) => {
      const notes = currentBeat.type === 'note' ? (currentBeat.notes ?? [practiceNote]) : []
      const noteLabel = notes.length > 0 ? notes.map(midiNumberToNoteName).join(' + ') : '休止'
      const measureStartBeats = measureIndex * patternLengthBeats

      return {
        id: `${pattern.id}-m${measureIndex + 1}-${beatIndex + 1}`,
        timeMs: (measureStartBeats + currentBeat.position) * beatDurationMs,
        notes,
        durationMs: currentBeat.duration * beatDurationMs,
        type: currentBeat.type === 'rest' ? 'rest' : notes.length > 1 ? 'chord' : 'note',
        label: `第 ${measureIndex + 1} 小节 ${formatPositionLabel(currentBeat.position)} ${noteLabel}`,
        hand: currentBeat.hand ?? 'both'
      } satisfies TargetEvent
    })
  )
}
