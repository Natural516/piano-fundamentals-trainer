export type ChordAccidental = '#' | 'b' | 'n' | '##' | 'bb' | null
export type ChordClef = 'treble' | 'bass'

export interface ChordWrittenPitch {
  accidental: ChordAccidental
  clef: ChordClef
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  octave: number
  soundingMidiNumber: number
  spelling: string
  vexFlowKey: string
}

export interface ChordMockCase {
  id: string
  inversion: '原位' | '第一转位' | '第二转位' | '第三转位'
  qaLabel: string
  register: 'low' | 'middle' | 'high'
  symbol: string
  root: WrittenPitchClass
  qualityId: ChordQualityId
  writtenPitches: readonly ChordWrittenPitch[]
}

export type ChordMockStateId =
  | 'arpeggio-ready'
  | 'arpeggio-wrong'
  | 'wait-release-to-block'
  | 'block-ready'
  | 'block-wrong-restart'
  | 'question-correct'

export type ChordGroupVisualState = 'active' | 'completed' | 'wrong' | 'secondary'

export interface ChordMockState {
  arpeggio: ChordGroupVisualState
  block: ChordGroupVisualState
  id: ChordMockStateId
  label: string
  prompt: string
}

function pitch(
  spelling: string,
  letter: ChordWrittenPitch['letter'],
  accidental: ChordAccidental,
  octave: number,
  soundingMidiNumber: number,
  clef: ChordClef
): ChordWrittenPitch {
  return {
    accidental,
    clef,
    letter,
    octave,
    soundingMidiNumber,
    spelling,
    vexFlowKey: `${letter.toLowerCase()}${accidental === 'n' ? '' : accidental ?? ''}/${octave}`
  }
}

export const CHORD_MOCK_CASES: readonly ChordMockCase[] = [
  {
    id: 'c-sharp-major-seven-first',
    qaLabel: 'C♯maj7 · 第一转位',
    symbol: 'C♯maj7',
    root: { letter: 'C', accidental: 1 },
    qualityId: 'major7',
    inversion: '第一转位',
    register: 'middle',
    writtenPitches: [
      pitch('E♯4', 'E', '#', 4, 65, 'treble'),
      pitch('G♯4', 'G', '#', 4, 68, 'treble'),
      pitch('B♯4', 'B', '#', 4, 72, 'treble'),
      pitch('C♯5', 'C', '#', 5, 73, 'treble')
    ]
  },
  {
    id: 'c-major-root',
    qaLabel: 'Case 1 · C Major',
    symbol: 'C',
    root: { letter: 'C', accidental: 0 },
    qualityId: 'major',
    inversion: '原位',
    register: 'middle',
    writtenPitches: [
      pitch('C4', 'C', null, 4, 60, 'treble'),
      pitch('E4', 'E', null, 4, 64, 'treble'),
      pitch('G4', 'G', null, 4, 67, 'treble')
    ]
  },
  {
    id: 'b-flat-half-diminished-third',
    qaLabel: 'Case 2 · B♭m7♭5',
    symbol: 'B♭m7♭5',
    root: { letter: 'B', accidental: -1 },
    qualityId: 'halfDiminished7',
    inversion: '第三转位',
    register: 'middle',
    writtenPitches: [
      pitch('A♭3', 'A', 'b', 3, 56, 'bass'),
      pitch('B♭3', 'B', 'b', 3, 58, 'bass'),
      pitch('D♭4', 'D', 'b', 4, 61, 'treble'),
      pitch('F♭4', 'F', 'b', 4, 64, 'treble')
    ]
  },
  {
    id: 'c-sharp-major-root',
    qaLabel: 'Case 3 · C♯ Major',
    symbol: 'C♯',
    root: { letter: 'C', accidental: 1 },
    qualityId: 'major',
    inversion: '原位',
    register: 'middle',
    writtenPitches: [
      pitch('C♯4', 'C', '#', 4, 61, 'treble'),
      pitch('E♯4', 'E', '#', 4, 65, 'treble'),
      pitch('G♯4', 'G', '#', 4, 68, 'treble')
    ]
  },
  {
    id: 'c-flat-major-first',
    qaLabel: 'Case 4 · C♭ Major',
    symbol: 'C♭',
    root: { letter: 'C', accidental: -1 },
    qualityId: 'major',
    inversion: '第一转位',
    register: 'middle',
    writtenPitches: [
      pitch('E♭4', 'E', 'b', 4, 63, 'treble'),
      pitch('G♭4', 'G', 'b', 4, 66, 'treble'),
      pitch('C♭5', 'C', 'b', 5, 71, 'treble')
    ]
  },
  {
    id: 'd-flat-seven-low',
    qaLabel: 'Case 5 · 低音区 D♭7',
    symbol: 'D♭7',
    root: { letter: 'D', accidental: -1 },
    qualityId: 'dominant7',
    inversion: '原位',
    register: 'low',
    writtenPitches: [
      pitch('D♭2', 'D', 'b', 2, 37, 'bass'),
      pitch('F2', 'F', null, 2, 41, 'bass'),
      pitch('A♭2', 'A', 'b', 2, 44, 'bass'),
      pitch('C♭3', 'C', 'b', 3, 47, 'bass')
    ]
  },
  {
    id: 'a-augmented-high-second',
    qaLabel: 'Case 6 · 高音区 Aaug',
    symbol: 'Aaug',
    root: { letter: 'A', accidental: 0 },
    qualityId: 'augmented',
    inversion: '第二转位',
    register: 'high',
    writtenPitches: [
      pitch('E♯5', 'E', '#', 5, 77, 'treble'),
      pitch('A5', 'A', null, 5, 81, 'treble'),
      pitch('C♯6', 'C', '#', 6, 85, 'treble')
    ]
  },
  {
    id: 'b-flat-diminished-seven-double-flat',
    qaLabel: '附加 · B♭dim7 双降号',
    symbol: 'B♭dim7',
    root: { letter: 'B', accidental: -1 },
    qualityId: 'diminished7',
    inversion: '原位',
    register: 'middle',
    writtenPitches: [
      pitch('B♭3', 'B', 'b', 3, 58, 'bass'),
      pitch('D♭4', 'D', 'b', 4, 61, 'treble'),
      pitch('F♭4', 'F', 'b', 4, 64, 'treble'),
      pitch('A♭♭4', 'A', 'bb', 4, 67, 'treble')
    ]
  },
  {
    id: 'b-diminished-seven-natural',
    qaLabel: '附加 · Bdim7 自然号',
    symbol: 'Bdim7',
    root: { letter: 'B', accidental: 0 },
    qualityId: 'diminished7',
    inversion: '原位',
    register: 'middle',
    writtenPitches: [
      pitch('B♮3', 'B', 'n', 3, 59, 'bass'),
      pitch('D4', 'D', null, 4, 62, 'treble'),
      pitch('F4', 'F', null, 4, 65, 'treble'),
      pitch('A♭4', 'A', 'b', 4, 68, 'treble')
    ]
  }
]

export const CHORD_MOCK_STATES: readonly ChordMockState[] = [
  {
    id: 'arpeggio-ready',
    label: 'A · ARPEGGIO READY',
    block: 'secondary',
    arpeggio: 'active',
    prompt: '请按谱面顺序弹奏分解和弦'
  },
  {
    id: 'arpeggio-wrong',
    label: 'B · ARPEGGIO WRONG',
    block: 'secondary',
    arpeggio: 'wrong',
    prompt: '分解顺序错误 · 松开琴键后从头重试'
  },
  {
    id: 'wait-release-to-block',
    label: 'C · WAIT RELEASE TO BLOCK',
    block: 'secondary',
    arpeggio: 'completed',
    prompt: '分解完成 · 请松开琴键'
  },
  {
    id: 'block-ready',
    label: 'D · BLOCK READY',
    block: 'active',
    arpeggio: 'completed',
    prompt: '请弹奏柱式和弦'
  },
  {
    id: 'block-wrong-restart',
    label: 'E · BLOCK WRONG / RESTART',
    block: 'wrong',
    arpeggio: 'completed',
    prompt: '柱式错误 · 松开琴键后从分解重新开始'
  },
  {
    id: 'question-correct',
    label: 'F · QUESTION CORRECT',
    block: 'completed',
    arpeggio: 'completed',
    prompt: '正确'
  }
]

export const DEFAULT_CHORD_MOCK_CASE_ID = 'c-sharp-major-seven-first'
export const DEFAULT_CHORD_MOCK_STATE_ID: ChordMockStateId = 'arpeggio-ready'

export function getChordMockCase(id: string): ChordMockCase {
  return CHORD_MOCK_CASES.find((item) => item.id === id) ?? CHORD_MOCK_CASES[0]
}

export function getChordMockState(id: ChordMockStateId): ChordMockState {
  return CHORD_MOCK_STATES.find((item) => item.id === id) ?? CHORD_MOCK_STATES[0]
}
import type { ChordQualityId, WrittenPitchClass } from './musicTheory/chords'
