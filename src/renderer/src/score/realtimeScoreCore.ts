import type { ScoreExpectedUnit, ScoreTimeline } from './musicXmlTypes'

export interface RealtimeStepResult {
  unitId: string
  outcome: 'correct' | 'wrong' | 'missing' | 'extra' | 'early' | 'late'
  offsetMs: number
}

export interface RealtimeCoreOptions {
  toleranceMs?: number
  beatDurationMs?: number
  skipWindowMs?: number
}

/**
 * Realtime alignment: the timeline runs on continuous time. Each unit has an
 * expected time (unitIndex * beatDurationMs). Notes inside the on-time window
 * are correct; early/late record an offset. A unit that passes its window
 * without a full match is marked missing/wrong and the cursor advances, so a
 * single mistake does not permanently misalign the rest.
 */
export class RealtimeScoreCore {
  private readonly units: ScoreExpectedUnit[]
  private readonly toleranceMs: number
  private readonly beatDurationMs: number
  private readonly skipWindowMs: number
  private index = 0
  private pressed = new Set<number>()
  private readonly stepResults: RealtimeStepResult[] = []

  constructor(timeline: ScoreTimeline, options: RealtimeCoreOptions = {}) {
    this.units = timeline.units
    this.toleranceMs = options.toleranceMs ?? 180
    this.beatDurationMs = options.beatDurationMs ?? 500
    this.skipWindowMs = options.skipWindowMs ?? this.toleranceMs * 2
  }

  get currentIndex(): number {
    return this.index
  }

  get isComplete(): boolean {
    return this.index >= this.units.length
  }

  get results(): RealtimeStepResult[] {
    return this.stepResults
  }

  get currentUnit(): ScoreExpectedUnit | null {
    return this.isComplete ? null : this.units[this.index] ?? null
  }

  reset(): void {
    this.index = 0
    this.pressed.clear()
    this.stepResults.length = 0
  }

  advanceTo(elapsedMs: number): void {
    while (!this.isComplete) {
      const unit = this.units[this.index]
      if (unit.rest) {
        this.stepResults.push({ unitId: unit.id, outcome: 'correct', offsetMs: 0 })
        this.index += 1
        continue
      }
      if (unit.expectedMidi.length === 0) {
        this.index += 1
        continue
      }

      const expectedTime = this.expectedTimeFor(unit)
      if (elapsedMs > expectedTime + this.skipWindowMs) {
        this.stepResults.push({
          unitId: unit.id,
          outcome: this.pressed.size === 0 ? 'missing' : 'wrong',
          offsetMs: Math.round(elapsedMs - expectedTime)
        })
        this.index += 1
        this.pressed.clear()
        continue
      }
      break
    }
  }

  processNoteOn(midiNumber: number, elapsedMs: number): 'correct' | 'wrong' | 'early' | 'late' | 'none' | 'complete' {
    this.advanceTo(elapsedMs)
    const unit = this.currentUnit
    if (!unit || unit.rest || unit.expectedMidi.length === 0) return 'none'

    const expectedTime = this.expectedTimeFor(unit)
    const offset = elapsedMs - expectedTime

    if (!unit.expectedMidi.includes(midiNumber)) {
      this.stepResults.push({ unitId: unit.id, outcome: 'extra', offsetMs: Math.round(offset) })
      return 'wrong'
    }

    this.pressed.add(midiNumber)
    if (Math.abs(offset) > this.toleranceMs) {
      if (this.unitSatisfied(unit)) {
        const outcome = offset < 0 ? 'early' : 'late'
        this.stepResults.push({ unitId: unit.id, outcome, offsetMs: Math.round(offset) })
        this.index += 1
        this.pressed.clear()
        return this.isComplete ? 'complete' : outcome
      }
      return 'none'
    }

    if (this.unitSatisfied(unit)) {
      this.stepResults.push({ unitId: unit.id, outcome: 'correct', offsetMs: Math.round(offset) })
      this.index += 1
      this.pressed.clear()
      return this.isComplete ? 'complete' : 'correct'
    }

    return 'none'
  }

  private expectedTimeFor(unit: ScoreExpectedUnit): number {
    return unit.onsetIndex * this.beatDurationMs
  }

  private unitSatisfied(unit: ScoreExpectedUnit): boolean {
    return unit.expectedMidi.every((note) => this.pressed.has(note))
  }
}
