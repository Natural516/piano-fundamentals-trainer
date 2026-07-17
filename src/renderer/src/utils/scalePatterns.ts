import type { TargetEvent } from './practiceTypes'
import type { MajorScaleKey, MajorScalePattern, ScalePracticeMode, ScalePracticeStep } from './scaleTypes'

export const SCALE_MEASURE_BEATS = 4

export const SCALE_PRACTICE_MODES: Array<{ id: ScalePracticeMode; name: string; description: string }> = [
  {
    id: 'right-ascending',
    name: '右手上行',
    description: '右手从主音向上弹一个八度。'
  },
  {
    id: 'left-ascending',
    name: '左手上行',
    description: '左手使用低八度音区向上弹奏。'
  },
  {
    id: 'right-up-down',
    name: '右手上行 + 下行',
    description: '右手上行到高主音后返回。'
  },
  {
    id: 'left-up-down',
    name: '左手上行 + 下行',
    description: '左手低八度上行后返回。'
  },
  {
    id: 'both-ascending',
    name: '双手同向上行',
    description: '左右手相隔一个八度，同向上行。'
  }
]

export const MAJOR_SCALE_PATTERNS: MajorScalePattern[] = [
  {
    key: 'C',
    name: 'C 大调',
    notes: [60, 62, 64, 65, 67, 69, 71, 72],
    noteNames: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    accidentals: []
  },
  {
    key: 'G',
    name: 'G 大调',
    notes: [55, 57, 59, 60, 62, 64, 66, 67],
    noteNames: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4'],
    accidentals: ['F#']
  },
  {
    key: 'D',
    name: 'D 大调',
    notes: [62, 64, 66, 67, 69, 71, 73, 74],
    noteNames: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'],
    accidentals: ['F#', 'C#']
  },
  {
    key: 'A',
    name: 'A 大调',
    notes: [57, 59, 61, 62, 64, 66, 68, 69],
    noteNames: ['A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G#4', 'A4'],
    accidentals: ['F#', 'C#', 'G#']
  },
  {
    key: 'E',
    name: 'E 大调',
    notes: [64, 66, 68, 69, 71, 73, 75, 76],
    noteNames: ['E4', 'F#4', 'G#4', 'A4', 'B4', 'C#5', 'D#5', 'E5'],
    accidentals: ['F#', 'C#', 'G#', 'D#']
  },
  {
    key: 'B',
    name: 'B 大调',
    notes: [59, 61, 63, 64, 66, 68, 70, 71],
    noteNames: ['B3', 'C#4', 'D#4', 'E4', 'F#4', 'G#4', 'A#4', 'B4'],
    accidentals: ['F#', 'C#', 'G#', 'D#', 'A#']
  },
  {
    key: 'F#',
    name: 'F# 大调',
    notes: [54, 56, 58, 59, 61, 63, 65, 66],
    noteNames: ['F#3', 'G#3', 'A#3', 'B3', 'C#4', 'D#4', 'E#4', 'F#4'],
    accidentals: ['F#', 'C#', 'G#', 'D#', 'A#', 'E#']
  },
  {
    key: 'F',
    name: 'F 大调',
    notes: [53, 55, 57, 58, 60, 62, 64, 65],
    noteNames: ['F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4'],
    accidentals: ['Bb']
  },
  {
    key: 'Bb',
    name: 'Bb 大调',
    notes: [58, 60, 62, 63, 65, 67, 69, 70],
    noteNames: ['Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'],
    accidentals: ['Bb', 'Eb']
  },
  {
    key: 'Eb',
    name: 'Eb 大调',
    notes: [51, 53, 55, 56, 58, 60, 62, 63],
    noteNames: ['Eb3', 'F3', 'G3', 'Ab3', 'Bb3', 'C4', 'D4', 'Eb4'],
    accidentals: ['Bb', 'Eb', 'Ab']
  },
  {
    key: 'Ab',
    name: 'Ab 大调',
    notes: [56, 58, 60, 61, 63, 65, 67, 68],
    noteNames: ['Ab3', 'Bb3', 'C4', 'Db4', 'Eb4', 'F4', 'G4', 'Ab4'],
    accidentals: ['Bb', 'Eb', 'Ab', 'Db']
  },
  {
    key: 'Db',
    name: 'Db 大调',
    notes: [49, 51, 53, 54, 56, 58, 60, 61],
    noteNames: ['Db3', 'Eb3', 'F3', 'Gb3', 'Ab3', 'Bb3', 'C4', 'Db4'],
    accidentals: ['Bb', 'Eb', 'Ab', 'Db', 'Gb']
  }
]

function transposeNoteName(noteName: string, semitones: number): string {
  const match = noteName.match(/^([A-G](?:#|b)?)(-?\d+)$/)

  if (!match) {
    return noteName
  }

  const octaveShift = Math.trunc(semitones / 12)
  return `${match[1]}${Number(match[2]) + octaveShift}`
}

function shiftScale(scale: MajorScalePattern, semitones: number): { notes: number[]; noteNames: string[] } {
  return {
    notes: scale.notes.map((note) => note + semitones),
    noteNames: scale.noteNames.map((noteName) => transposeNoteName(noteName, semitones))
  }
}

function getAscendingSteps(scale: MajorScalePattern, mode: ScalePracticeMode): ScalePracticeStep[] {
  if (mode === 'left-ascending') {
    const shifted = shiftScale(scale, -12)
    return shifted.notes.map((note, index) => ({
      id: `left-${index + 1}`,
      index,
      notes: [note],
      noteNames: [shifted.noteNames[index]],
      label: shifted.noteNames[index],
      hand: 'left'
    }))
  }

  if (mode === 'both-ascending') {
    const left = shiftScale(scale, -12)
    return scale.notes.map((rightNote, index) => ({
      id: `both-${index + 1}`,
      index,
      notes: [left.notes[index], rightNote],
      noteNames: [left.noteNames[index], scale.noteNames[index]],
      label: `${left.noteNames[index]} + ${scale.noteNames[index]}`,
      hand: 'both'
    }))
  }

  return scale.notes.map((note, index) => ({
    id: `right-${index + 1}`,
    index,
    notes: [note],
    noteNames: [scale.noteNames[index]],
    label: scale.noteNames[index],
    hand: 'right'
  }))
}

function mirrorDown(steps: ScalePracticeStep[]): ScalePracticeStep[] {
  return steps.slice(0, -1).reverse().map((step, downIndex) => ({
    ...step,
    id: `${step.id}-down-${downIndex + 1}`,
    index: steps.length + downIndex
  }))
}

export function getMajorScaleByKey(key: MajorScaleKey): MajorScalePattern {
  return MAJOR_SCALE_PATTERNS.find((scale) => scale.key === key) ?? MAJOR_SCALE_PATTERNS[0]
}

export function getScalePracticeModeName(mode: ScalePracticeMode): string {
  return SCALE_PRACTICE_MODES.find((candidate) => candidate.id === mode)?.name ?? SCALE_PRACTICE_MODES[0].name
}

export function createScalePracticeSteps(scale: MajorScalePattern, mode: ScalePracticeMode): ScalePracticeStep[] {
  const baseSteps = getAscendingSteps(scale, mode)

  if (mode === 'right-up-down' || mode === 'left-up-down') {
    return [...baseSteps, ...mirrorDown(baseSteps)]
  }

  return baseSteps
}

export function createScaleTargets(
  scale: MajorScalePattern,
  mode: ScalePracticeMode,
  beatDurationMs: number
): TargetEvent[] {
  return createScalePracticeSteps(scale, mode).map((step, index) => ({
    id: `${scale.key}-${mode}-${index + 1}`,
    timeMs: index * beatDurationMs,
    notes: step.notes,
    durationMs: beatDurationMs,
    type: step.notes.length > 1 ? 'chord' : 'note',
    label: step.label,
    hand: step.hand
  }))
}
