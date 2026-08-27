import type { ScoreExpectedUnit, ScoreTimeline } from './musicXmlTypes'

export interface WaitStepResult {
  unitId: string
  outcome: 'correct' | 'wrong' | 'skip'
  measure: number
  originalMeasure: number
  originalBeat: number
  practiceTick: number
  expectedMidi: number[]
  actualMidi: number | null
  hand: 'left' | 'right' | 'both' | null
  staff: number | null
  sourceEventIds: string[]
}

/**
 * Wait-mode engine: the current expected unit advances only when its required
 * new-onset notes have all been played. Rests and tie-only units auto-advance;
 * tie-started pitches stay sounding without re-pressing.
 */
export class WaitScoreCore {
  private readonly units: ScoreExpectedUnit[]
  private index = 0
  private pressed = new Set<number>()
  private sounding = new Set<number>()
  private readonly stepResults: WaitStepResult[] = []

  constructor(timeline: ScoreTimeline) {
    this.units = timeline.units
    this.advanceSkippable()
  }

  get currentIndex(): number {
    return this.index
  }

  get isComplete(): boolean {
    return this.index >= this.units.length
  }

  get results(): WaitStepResult[] {
    return this.stepResults
  }

  get currentUnit(): ScoreExpectedUnit | null {
    return this.isComplete ? null : this.units[this.index] ?? null
  }

  reset(): void {
    this.index = 0
    this.pressed.clear()
    this.sounding.clear()
    this.stepResults.length = 0
    this.advanceSkippable()
  }

  clearTransientInput(): void {
    this.pressed.clear()
  }

  processNoteOn(midiNumber: number, sourceEventId?: string): 'none' | 'wrong' | 'complete' {
    this.advanceSkippable()

    const unit = this.currentUnit
    if (!unit || unit.rest) return 'none'

    const required = unit.expectedMidi
    if (required.length === 0) {
      this.advanceSkippable()
      return 'none'
    }

    if (!required.includes(midiNumber)) {
      this.stepResults.push({
        unitId: unit.id,
        outcome: 'wrong',
        measure: unit.measure,
        originalMeasure: unit.originalMeasure,
        originalBeat: unit.originalBeat,
        practiceTick: unit.practiceTick,
        expectedMidi: required,
        actualMidi: midiNumber,
        hand: unit.hand,
        staff: unit.staff,
        sourceEventIds: unit.sourceEventIds
      })
      return 'wrong'
    }

    this.pressed.add(midiNumber)
    if (required.every((note) => this.pressed.has(note))) {
      this.stepResults.push({
        unitId: unit.id,
        outcome: 'correct',
        measure: unit.measure,
        originalMeasure: unit.originalMeasure,
        originalBeat: unit.originalBeat,
        practiceTick: unit.practiceTick,
        expectedMidi: required,
        actualMidi: midiNumber,
        hand: unit.hand,
        staff: unit.staff,
        sourceEventIds: unit.sourceEventIds
      })
      this.applyTies(unit)
      this.index += 1
      this.pressed.clear()
      this.advanceSkippable()
      return this.isComplete ? 'complete' : 'none'
    }

    return 'none'
  }

  private applyTies(unit: ScoreExpectedUnit): void {
    for (const note of unit.notes) {
      if (note.tieStart && note.midiNumber !== null) {
        this.sounding.add(note.midiNumber)
      }
      if (note.tieStop && note.midiNumber !== null) {
        this.sounding.delete(note.midiNumber)
      }
    }
  }

  private advanceSkippable(): void {
    while (!this.isComplete) {
      const unit = this.units[this.index]

      if (unit.rest || unit.expectedMidi.length === 0) {
        this.stepResults.push({
          unitId: unit.id,
          outcome: 'skip',
          measure: unit.measure,
          originalMeasure: unit.originalMeasure,
          originalBeat: unit.originalBeat,
          practiceTick: unit.practiceTick,
          expectedMidi: [],
          actualMidi: null,
          hand: unit.hand,
          staff: unit.staff,
          sourceEventIds: unit.sourceEventIds
        })
        this.index += 1
        this.pressed.clear()
        continue
      }

      break
    }
  }
}
