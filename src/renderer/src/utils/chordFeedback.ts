import { midiNumberToNoteName } from './midiNotes'
import type { ChordFeedback, ChordJudgementType, ChordTarget } from './chordTypes'

export function normalizeNotes(notes: number[]): number[] {
  return Array.from(new Set(notes)).sort((left, right) => left - right)
}

export function getMissingNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const inputSet = new Set(inputNotes)
  return expectedNotes.filter((note) => !inputSet.has(note))
}

export function getExtraNotes(expectedNotes: number[], inputNotes: number[]): number[] {
  const expectedSet = new Set(expectedNotes)
  return inputNotes.filter((note) => !expectedSet.has(note))
}

export function getJudgementType(missingNotes: number[], extraNotes: number[]): ChordJudgementType {
  if (missingNotes.length === 0 && extraNotes.length === 0) {
    return 'correct'
  }

  if (missingNotes.length > 0 && extraNotes.length > 0) {
    return 'wrong_note'
  }

  if (missingNotes.length > 0) {
    return 'missing_note'
  }

  return 'extra_note'
}

export function createChordFeedback(target: ChordTarget, inputNotes: number[]): ChordFeedback {
  const expectedNotes = normalizeNotes(target.notes)
  const cleanInputNotes = normalizeNotes(inputNotes)
  const missingNotes = getMissingNotes(expectedNotes, cleanInputNotes)
  const extraNotes = getExtraNotes(expectedNotes, cleanInputNotes)
  const type = getJudgementType(missingNotes, extraNotes)
  const missingText = missingNotes.length > 0 ? `缺少 ${missingNotes.map(midiNumberToNoteName).join(' / ')}` : ''
  const extraText = extraNotes.length > 0 ? `多出 ${extraNotes.map(midiNumberToNoteName).join(' / ')}` : ''
  const message = type === 'correct'
    ? '正确'
    : [missingText, extraText].filter(Boolean).join('，')

  return {
    type,
    target,
    inputNotes: cleanInputNotes,
    inputNoteNames: cleanInputNotes.map(midiNumberToNoteName),
    missingNotes,
    missingNoteNames: missingNotes.map(midiNumberToNoteName),
    extraNotes,
    extraNoteNames: extraNotes.map(midiNumberToNoteName),
    message
  }
}

export function createArpeggioFeedback(target: ChordTarget, inputNotes: number[], correct: boolean): ChordFeedback {
  const cleanInputNotes = normalizeNotes(inputNotes)

  return {
    type: correct ? 'correct' : 'wrong_note',
    target,
    inputNotes: cleanInputNotes,
    inputNoteNames: cleanInputNotes.map(midiNumberToNoteName),
    missingNotes: correct ? [] : target.notes.filter((note) => !cleanInputNotes.includes(note)),
    missingNoteNames: correct ? [] : target.notes.filter((note) => !cleanInputNotes.includes(note)).map(midiNumberToNoteName),
    extraNotes: correct ? [] : cleanInputNotes.filter((note) => !target.notes.includes(note)),
    extraNoteNames: correct ? [] : cleanInputNotes.filter((note) => !target.notes.includes(note)).map(midiNumberToNoteName),
    message: correct ? '分解和弦顺序正确' : '顺序错误，请从当前目标音继续'
  }
}
