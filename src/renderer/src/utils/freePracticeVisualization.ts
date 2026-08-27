import { MIDI_HIGHEST_NOTE, MIDI_LOWEST_NOTE } from './midiNotes'
import { spellMidiPitch } from './musicPitchSpelling'
import type { MusicNotationPitch } from './musicNotationTypes'
import type { MidiEventRecord } from '../types'

export const FREE_PRACTICE_HISTORY_CAPACITY = 10
export const FREE_PRACTICE_CHORD_WINDOW_MS = 70

export interface FreePracticeAttack {
  id: string
  midiNumber: number
  timestamp: number
}

export interface FreePracticeAttackColumn {
  id: string
  firstAttackAt: number
  lastAttackAt: number
  midiNumbers: readonly number[]
}

export interface FreePracticeNotationColumn {
  id: string
  pitches: readonly MusicNotationPitch[]
}

export interface FreePracticeVisualizationState {
  history: readonly FreePracticeAttackColumn[]
  lastNoteOnEventId: number
}

function isDisplayableMidiNumber(midiNumber: number): boolean {
  return Number.isInteger(midiNumber) && midiNumber >= MIDI_LOWEST_NOTE && midiNumber <= MIDI_HIGHEST_NOTE
}

export function appendFreePracticeAttacks(
  history: readonly FreePracticeAttackColumn[],
  attacks: readonly FreePracticeAttack[],
  capacity = FREE_PRACTICE_HISTORY_CAPACITY,
  chordWindowMs = FREE_PRACTICE_CHORD_WINDOW_MS
): FreePracticeAttackColumn[] {
  const next = history.map((column) => ({ ...column, midiNumbers: [...column.midiNumbers] }))
  const normalizedAttacks = attacks
    .filter((attack) => isDisplayableMidiNumber(attack.midiNumber) && Number.isFinite(attack.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)

  for (const attack of normalizedAttacks) {
    const lastColumn = next[next.length - 1]
    const canJoinLastColumn = lastColumn != null
      && attack.timestamp - lastColumn.firstAttackAt <= chordWindowMs
      && attack.timestamp >= lastColumn.firstAttackAt
      && !lastColumn.midiNumbers.includes(attack.midiNumber)

    if (canJoinLastColumn) {
      lastColumn.lastAttackAt = attack.timestamp
      lastColumn.midiNumbers = [...lastColumn.midiNumbers, attack.midiNumber].sort((left, right) => left - right)
      continue
    }

    next.push({
      id: attack.id,
      firstAttackAt: attack.timestamp,
      lastAttackAt: attack.timestamp,
      midiNumbers: [attack.midiNumber]
    })
  }

  return next.slice(-Math.max(1, Math.floor(capacity)))
}

export function createFreePracticeVisualizationState(): FreePracticeVisualizationState {
  return {
    history: [],
    lastNoteOnEventId: 0
  }
}

/**
 * Consumes the application's already-normalized MIDI stream.
 * The first noteOn creates a visible column immediately; later nearby noteOns
 * merge into that existing column without any timer or deferred chord wait.
 */
export function reduceFreePracticeVisualizationEvent(
  state: FreePracticeVisualizationState,
  event: MidiEventRecord
): FreePracticeVisualizationState {
  if (
    event.type !== 'noteOn'
    || (event.velocity ?? 0) <= 0
    || typeof event.midiNumber !== 'number'
    || event.id <= state.lastNoteOnEventId
  ) return state

  return {
    history: appendFreePracticeAttacks(state.history, [{
      id: `midi-attack-${event.id}`,
      midiNumber: event.midiNumber,
      timestamp: event.timestamp
    }]),
    lastNoteOnEventId: event.id
  }
}

export function createFreePracticeNotationColumns(
  history: readonly FreePracticeAttackColumn[]
): FreePracticeNotationColumn[] {
  return history.map((column) => ({
    id: column.id,
    pitches: column.midiNumbers.map((midiNumber) => spellMidiPitch(midiNumber, 'C', 'grand'))
  }))
}
