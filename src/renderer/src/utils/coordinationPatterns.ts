import type {
  CoordinationPattern,
  CoordinationStep,
  CoordinationTimelineStep
} from './coordinationTypes'

export const COORDINATION_STEPS_PER_MEASURE = 8
export const COORDINATION_BEATS_PER_MEASURE = 4
export const COORDINATION_GROUP_WINDOW_MS = 120
export const COORDINATION_SYNC_THRESHOLD_MS = 100
export const COORDINATION_MEASURE_OPTIONS = [2, 4, 8] as const

const GRID_LABELS = ['1', '&', '2', '&', '3', '&', '4', '&']

function createStep(
  position: number,
  leftNotes: number[],
  rightNotes: number[],
  leftNoteNames: string[],
  rightNoteNames: string[]
): CoordinationStep {
  return {
    position,
    label: GRID_LABELS[position],
    leftNotes,
    rightNotes,
    leftNoteNames,
    rightNoteNames
  }
}

export const COORDINATION_PATTERNS: CoordinationPattern[] = [
  {
    id: 'hands-together',
    name: '双手同步单音',
    description: '左右手在每一拍同时按下 C3 与 C4。',
    bpmDefault: 60,
    steps: GRID_LABELS.map((_, position) =>
      position % 2 === 0
        ? createStep(position, [48], [60], ['C3'], ['C4'])
        : createStep(position, [], [], [], [])
    )
  },
  {
    id: 'slow-left-fast-right',
    name: '一慢一快',
    description: '左手保持四分音符，右手连续弹奏八分音符。',
    bpmDefault: 60,
    steps: [
      createStep(0, [48], [60], ['C3'], ['C4']),
      createStep(1, [], [62], [], ['D4']),
      createStep(2, [48], [64], ['C3'], ['E4']),
      createStep(3, [], [65], [], ['F4']),
      createStep(4, [48], [67], ['C3'], ['G4']),
      createStep(5, [], [69], [], ['A4']),
      createStep(6, [48], [71], ['C3'], ['B4']),
      createStep(7, [], [72], [], ['C5'])
    ]
  },
  {
    id: 'broken-chord-melody',
    name: '分解和弦配旋律',
    description: '左手连续分解 C 和弦，右手在正拍形成简短旋律。',
    bpmDefault: 60,
    steps: [
      createStep(0, [48], [60], ['C3'], ['C4']),
      createStep(1, [55], [], ['G3'], []),
      createStep(2, [52], [64], ['E3'], ['E4']),
      createStep(3, [55], [], ['G3'], []),
      createStep(4, [48], [67], ['C3'], ['G4']),
      createStep(5, [55], [], ['G3'], []),
      createStep(6, [52], [64], ['E3'], ['E4']),
      createStep(7, [55], [], ['G3'], [])
    ]
  },
  {
    id: 'offbeat-entry',
    name: '后半拍进入',
    description: '左手落在正拍，右手从每拍的后半拍进入。',
    bpmDefault: 60,
    steps: [
      createStep(0, [48], [], ['C3'], []),
      createStep(1, [], [64], [], ['E4']),
      createStep(2, [48], [], ['C3'], []),
      createStep(3, [], [67], [], ['G4']),
      createStep(4, [48], [], ['C3'], []),
      createStep(5, [], [64], [], ['E4']),
      createStep(6, [48], [], ['C3'], []),
      createStep(7, [], [60], [], ['C4'])
    ]
  }
]

export function getCoordinationPattern(patternId: string): CoordinationPattern {
  return COORDINATION_PATTERNS.find((pattern) => pattern.id === patternId) ?? COORDINATION_PATTERNS[0]
}

export function createCoordinationTimeline(
  pattern: CoordinationPattern,
  measureCount: number,
  eighthNoteDurationMs: number
): CoordinationTimelineStep[] {
  return Array.from({ length: measureCount }).flatMap((_, measureIndex) =>
    pattern.steps.map((step) => ({
      ...step,
      id: `${pattern.id}-m${measureIndex + 1}-p${step.position}`,
      measureIndex,
      expectedTimeMs: (measureIndex * COORDINATION_STEPS_PER_MEASURE + step.position) * eighthNoteDurationMs
    }))
  )
}

