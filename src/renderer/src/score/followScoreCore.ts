import type { ScoreExpectedUnit, ScoreTimeline } from './musicXmlTypes'

interface FollowCandidate {
  index: number
  cost: number
  pressed: number[]
}

export interface FollowStepResult {
  unitId: string
  outcome: 'correct' | 'wrong' | 'extra' | 'skip'
}

export interface FollowCoreOptions {
  beatDurationMs?: number
  msPerTick?: number
  timeCostWeight?: number
  pitchCost?: number
  skipCost?: number
  beamSize?: number
}

/**
 * Follow-Me alignment:
 * - a chord unit advances only when the FULL expected pitch set has been
 *   played (partial chords accumulate without advancing);
 * - rest / tie-only units auto-skip so they never deadlock;
 * - wrong/extra notes cost but stay; a skip candidate recovers position;
 * - reset clears every candidate and recorded result.
 */
export class FollowScoreCore {
  private readonly units: ScoreExpectedUnit[]
  private readonly msPerTick: number
  private readonly timeCostWeight: number
  private readonly pitchCost: number
  private readonly skipCost: number
  private readonly beamSize: number
  private candidates: FollowCandidate[] = [{ index: 0, cost: 0, pressed: [] }]
  private readonly stepResults: FollowStepResult[] = []
  private readonly recordedUnitIds = new Set<string>()
  private complete = false

  constructor(timeline: ScoreTimeline, options: FollowCoreOptions = {}) {
    this.units = timeline.units
    this.msPerTick = options.msPerTick ?? options.beatDurationMs ?? 500
    this.timeCostWeight = options.timeCostWeight ?? 0.6
    this.pitchCost = options.pitchCost ?? 2
    this.skipCost = options.skipCost ?? 3
    this.beamSize = options.beamSize ?? 4
  }

  get isComplete(): boolean {
    return this.complete
  }

  get currentIndex(): number {
    return this.complete ? this.units.length : Math.min(...this.candidates.map((candidate) => candidate.index))
  }

  get currentUnit(): ScoreExpectedUnit | null {
    if (this.complete || this.candidates.length === 0) return null
    return this.units[Math.min(...this.candidates.map((candidate) => candidate.index))] ?? null
  }

  get results(): FollowStepResult[] {
    return this.stepResults
  }

  reset(): void {
    this.candidates = [{ index: 0, cost: 0, pressed: [] }]
    this.stepResults.length = 0
    this.recordedUnitIds.clear()
    this.complete = false
  }

  observeNoteOn(midiNumber: number, elapsedMs: number): 'correct' | 'wrong' | 'complete' {
    if (this.complete) return 'complete'

    const nextCandidates: FollowCandidate[] = []
    let advanced = false

    for (const candidate of this.candidates) {
      let working = { ...candidate, pressed: [...candidate.pressed] }
      working = this.skipAutoUnits(working)

      const unit = this.units[working.index]
      if (!unit) {
        nextCandidates.push(working)
        continue
      }

      const expectedTime = unit.expectedTick * this.msPerTick
      const timeCost = Math.abs(elapsedMs - expectedTime) * this.timeCostWeight

      if (unit.expectedMidi.includes(midiNumber)) {
        const pressed = Array.from(new Set([...working.pressed, midiNumber]))
        const satisfied = unit.expectedMidi.every((note) => pressed.includes(note))

        if (satisfied) {
          this.recordCorrect(unit, working.index)
          nextCandidates.push({ index: working.index + 1, cost: working.cost + timeCost, pressed: [] })
          advanced = true
        } else {
          // Partial chord: accumulate without advancing.
          nextCandidates.push({ ...working, pressed, cost: working.cost + timeCost * 0.4 })
          advanced = true
        }
        continue
      }

      // Wrong/extra note: stay with a pitch cost.
      nextCandidates.push({ ...working, cost: working.cost + this.pitchCost })
      // Alternative: skip this unit and try the next one.
      const skipped = this.skipAutoUnits({ index: working.index + 1, cost: working.cost + this.skipCost + timeCost, pressed: [] })
      const nextUnit = this.units[skipped.index]
      if (nextUnit && nextUnit.expectedMidi.includes(midiNumber)) {
        const pressed = [midiNumber]
        const satisfied = nextUnit.expectedMidi.every((note) => pressed.includes(note))
        if (satisfied) {
          this.recordCorrect(nextUnit, skipped.index)
          nextCandidates.push({ index: skipped.index + 1, cost: skipped.cost, pressed: [] })
          advanced = true
        } else {
          nextCandidates.push({ ...skipped, pressed, cost: skipped.cost + timeCost * 0.4 })
          advanced = true
        }
      } else if (nextUnit) {
        nextCandidates.push(skipped)
        advanced = true
      }
    }

    if (nextCandidates.length === 0) return 'wrong'

    this.candidates = nextCandidates
      .sort((left, right) => left.cost - right.cost)
      .slice(0, this.beamSize)

    if (this.candidates.some((candidate) => candidate.index >= this.units.length)) {
      this.complete = true
      return 'complete'
    }

    return advanced ? 'correct' : 'wrong'
  }

  private skipAutoUnits(candidate: FollowCandidate): FollowCandidate {
    let working = candidate
    while (working.index < this.units.length) {
      const unit = this.units[working.index]
      if (!unit.rest && unit.expectedMidi.length > 0) break
      this.recordSkip(unit, working.index)
      working = { ...working, index: working.index + 1, pressed: [] }
    }
    return working
  }

  private recordCorrect(unit: ScoreExpectedUnit, index: number): void {
    const unitId = unit?.id ?? `unit-${index}`
    if (this.recordedUnitIds.has(unitId)) return
    this.recordedUnitIds.add(unitId)
    this.stepResults.push({ unitId, outcome: 'correct' })
  }

  private recordSkip(unit: ScoreExpectedUnit, index: number): void {
    const unitId = unit?.id ?? `unit-${index}`
    if (this.recordedUnitIds.has(unitId)) return
    this.recordedUnitIds.add(unitId)
    this.stepResults.push({ unitId, outcome: 'skip' })
  }
}
