import { midiNumberToNoteName } from './midiNotes'
import { createPolyrhythmPoints } from './timingSubdivisions'
import type {
  CoordinationCategory,
  CoordinationPattern,
  CoordinationStep,
  CoordinationTimelineStep
} from './coordinationTypes'

export const COORDINATION_STEPS_PER_MEASURE = 8
export const COORDINATION_BEATS_PER_MEASURE = 4
export const COORDINATION_GROUP_WINDOW_MS = 120
export const COORDINATION_SYNC_THRESHOLD_MS = 100
export const COORDINATION_MEASURE_OPTIONS = [2, 4, 8] as const

export const COORDINATION_CATEGORY_LABELS: Record<CoordinationCategory, string> = {
  synchronous: '同步型',
  alternating: '交替型',
  accompaniment: '左手伴奏右手旋律',
  asynchronous: '异步节奏',
  polyrhythm: '三对二'
}

const GRID_LABELS = ['1', '&', '2', '&', '3', '&', '4', '&']

function createStep(
  position: number,
  leftNotes: number[],
  rightNotes: number[],
  leftNoteNames = leftNotes.map(midiNumberToNoteName),
  rightNoteNames = rightNotes.map(midiNumberToNoteName),
  beatPosition = position / 2,
  syncExpected = leftNotes.length > 0 && rightNotes.length > 0
): CoordinationStep {
  return {
    position,
    beatPosition,
    label: GRID_LABELS[position] ?? `${Math.floor(beatPosition) + 1}+${Math.round((beatPosition % 1) * 100) / 100}`,
    leftNotes,
    rightNotes,
    leftNoteNames,
    rightNoteNames,
    syncExpected
  }
}

function createPolyrhythmSteps(leftParts: 2 | 3, rightParts: 2 | 3, preparatoryBeats = 0): CoordinationStep[] {
  return createPolyrhythmPoints(leftParts, rightParts, COORDINATION_BEATS_PER_MEASURE).map((point, index) => {
    const rightEnabled = point.position >= preparatoryBeats && point.right
    const leftNotes = point.left ? [48] : []
    const rightNotes = rightEnabled ? [60] : []
    const beat = Math.floor(point.position) + 1
    const fraction = point.position - Math.floor(point.position)
    const label = fraction === 0 ? `${beat}` : `${beat}+${Math.round(fraction * 100) / 100}`
    return {
      ...createStep(index, leftNotes, rightNotes, undefined, undefined, point.position, point.left && rightEnabled),
      label
    }
  })
}

export const COORDINATION_PATTERNS: CoordinationPattern[] = [
  {
    id: 'hands-together', name: '双手同步单音', description: '左右手在每一拍同时按下 C3 与 C4。', bpmDefault: 60,
    category: 'synchronous', difficulty: 'basic',
    steps: GRID_LABELS.map((_, position) => position % 2 === 0 ? createStep(position, [48], [60]) : createStep(position, [], []))
  },
  {
    id: 'slow-left-fast-right', name: '一慢一快', description: '左手保持四分音符，右手连续弹奏八分音符。', bpmDefault: 60,
    category: 'asynchronous', difficulty: 'basic',
    steps: [
      createStep(0, [48], [60]), createStep(1, [], [62]), createStep(2, [48], [64]), createStep(3, [], [65]),
      createStep(4, [48], [67]), createStep(5, [], [69]), createStep(6, [48], [71]), createStep(7, [], [72])
    ]
  },
  {
    id: 'broken-chord-melody', name: '分解和弦配旋律', description: '左手连续分解 C 和弦，右手在正拍形成简短旋律。', bpmDefault: 60,
    category: 'accompaniment', difficulty: 'intermediate',
    steps: [
      createStep(0, [48], [60]), createStep(1, [55], []), createStep(2, [52], [64]), createStep(3, [55], []),
      createStep(4, [48], [67]), createStep(5, [55], []), createStep(6, [52], [64]), createStep(7, [55], [])
    ]
  },
  {
    id: 'offbeat-entry', name: '后半拍进入', description: '左手落在正拍，右手从每拍的后半拍进入。', bpmDefault: 60,
    category: 'alternating', difficulty: 'basic',
    steps: [
      createStep(0, [48], []), createStep(1, [], [64]), createStep(2, [48], []), createStep(3, [], [67]),
      createStep(4, [48], []), createStep(5, [], [64]), createStep(6, [48], []), createStep(7, [], [60])
    ]
  },
  {
    id: 'block-chord-quarter-melody', name: '左手柱式和弦 + 右手四分旋律', description: '左手 C 大三和弦与右手四分音符旋律同步。', bpmDefault: 60,
    category: 'accompaniment', difficulty: 'intermediate',
    steps: [createStep(0, [48, 52, 55], [60]), createStep(1, [], []), createStep(2, [48, 52, 55], [64]), createStep(3, [], []), createStep(4, [48, 52, 55], [67]), createStep(5, [], []), createStep(6, [48, 52, 55], [64]), createStep(7, [], [])]
  },
  {
    id: 'broken-chord-eighth-melody', name: '左手分解和弦 + 右手八分旋律', description: '左手 C–G–E–G 分解型配右手八分旋律。', bpmDefault: 60,
    category: 'accompaniment', difficulty: 'intermediate',
    steps: [createStep(0, [48], [60]), createStep(1, [55], [62]), createStep(2, [52], [64]), createStep(3, [55], [65]), createStep(4, [48], [67]), createStep(5, [55], [69]), createStep(6, [52], [71]), createStep(7, [55], [72])]
  },
  {
    id: 'alberti-melody', name: '阿尔贝蒂低音 + 简单旋律', description: '左手低–高–中–高型配右手基础旋律。', bpmDefault: 56,
    category: 'accompaniment', difficulty: 'intermediate',
    steps: [createStep(0, [48], [60]), createStep(1, [55], []), createStep(2, [52], [62]), createStep(3, [55], []), createStep(4, [48], [64]), createStep(5, [55], []), createStep(6, [52], [67]), createStep(7, [55], [])]
  },
  {
    id: 'fast-left-slow-right', name: '左手八分、右手四分', description: '左手连续八分音符，右手只在正拍进入。', bpmDefault: 60,
    category: 'asynchronous', difficulty: 'intermediate',
    steps: [createStep(0, [48], [60]), createStep(1, [50], []), createStep(2, [52], [64]), createStep(3, [53], []), createStep(4, [55], [67]), createStep(5, [57], []), createStep(6, [59], [72]), createStep(7, [60], [])]
  },
  {
    id: 'left-beat-right-offbeat', name: '左手正拍、右手反拍', description: '左右手在同一拍内交替，建立反拍独立性。', bpmDefault: 56,
    category: 'asynchronous', difficulty: 'challenge',
    steps: [createStep(0, [48], []), createStep(1, [], [60]), createStep(2, [52], []), createStep(3, [], [64]), createStep(4, [55], []), createStep(5, [], [67]), createStep(6, [52], []), createStep(7, [], [64])]
  },
  {
    id: 'left-sustain-right-rhythm', name: '左手持续音、右手节奏变化', description: '左手只在小节起点按下低音，右手完成变化节奏。', bpmDefault: 52,
    category: 'asynchronous', difficulty: 'challenge',
    steps: [createStep(0, [48], [60]), createStep(1, [], [62]), createStep(2, [], []), createStep(3, [], [64]), createStep(4, [], [67]), createStep(5, [], []), createStep(6, [], [64]), createStep(7, [], [62])]
  },
  {
    id: 'polyrhythm-left-2-right-3', name: '左手2、右手3', description: '每拍左手二等分、右手三等分。', bpmDefault: 40,
    category: 'polyrhythm', difficulty: 'challenge', steps: createPolyrhythmSteps(2, 3)
  },
  {
    id: 'polyrhythm-left-3-right-2', name: '左手3、右手2', description: '每拍左手三等分、右手二等分。', bpmDefault: 40,
    category: 'polyrhythm', difficulty: 'challenge', steps: createPolyrhythmSteps(3, 2)
  },
  {
    id: 'polyrhythm-preparation', name: '单手预备后双手进入', description: '前两拍左手二等分预备，后两拍加入右手三等分。', bpmDefault: 40,
    category: 'polyrhythm', difficulty: 'challenge', steps: createPolyrhythmSteps(2, 3, 2)
  }
]

export function getCoordinationPattern(patternId: string): CoordinationPattern {
  return COORDINATION_PATTERNS.find((pattern) => pattern.id === patternId) ?? COORDINATION_PATTERNS[0]
}

export function shouldCompareCoordinationSync(step: CoordinationStep): boolean {
  return step.syncExpected !== false && step.leftNotes.length > 0 && step.rightNotes.length > 0
}

export function createCoordinationTimeline(
  pattern: CoordinationPattern,
  measureCount: number,
  eighthNoteDurationMs: number
): CoordinationTimelineStep[] {
  const beatDurationMs = eighthNoteDurationMs * 2
  return Array.from({ length: measureCount }).flatMap((_, measureIndex) =>
    pattern.steps.map((step, stepIndex) => ({
      ...step,
      id: `${pattern.id}-m${measureIndex + 1}-p${stepIndex}`,
      measureIndex,
      expectedTimeMs: (measureIndex * COORDINATION_BEATS_PER_MEASURE + (step.beatPosition ?? step.position / 2)) * beatDurationMs
    }))
  )
}
