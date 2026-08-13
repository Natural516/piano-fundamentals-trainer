import type { ScoreExpectedUnit, ScoreTimeline } from './musicXmlTypes'

interface FollowCandidate {
  index: number
  cost: number
  lastMatchedIndex: number
}

export interface FollowStepResult {
  unitId: string
  outcome: 'correct' | 'wrong' | 'extra' | 'skip'
}

export interface FollowCoreOptions {
  beatDurationMs?: number
  timeCostWeight?: number
  pitchCost?: number
  skipCost?: number
  beamSize?: number
}

/**
 * Follow-Me alignment: a small beam of position candidates is advanced by each
 * observed note. Candidates that match the current unit get low cost; wrong
 * notes, skips and time drift add cost. The best candidate wins, so stopping,
 * slight slow/fast, one skipped note or one extra note do not permanently
 * misalign the piece.
 */
export class FollowScoreCore {
  private readonly units: ScoreExpectedUnit[]
  private readonly beatDurationMs: number
  private readonly timeCostWeight: number
  private readonly pitchCost: number
  private readonly skipCost: number
  private readonly beamSize: number
  private candidates: FollowCandidate[] = [{ index: 0, cost: 0, lastMatchedIndex: -1 }]
  private readonly stepResults: FollowStepResult[] = []
  private complete = false

  constructor(timeline: ScoreTimeline, options: FollowCoreOptions = {}) {
    this.units = timeline.units
    this.beatDurationMs = options.beatDurationMs ?? 500
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
    return this.complete ? null : this.units[Math.min(...this.candidates.map((candidate) => candidate.index))] ?? null
  }

  get results(): FollowStepResult[] {
    return this.stepResults
  }

  reset(): void {
    this.candidates = [{ index: 0, cost: 0, lastMatchedIndex: -1 }]
    this.stepResults.length = 0
    this.complete = false
  }

  observeNoteOn(midiNumber: number, elapsedMs: number): 'correct' | 'wrong' | 'complete' {
    if (this.complete) return 'complete'

    const nextCandidates: FollowCandidate[] = []
    let advanced = false

    for (const candidate of this.candidates) {
      const unit = this.units[candidate.index]
      if (!unit) continue

      const expectedTime = unit.onsetIndex * this.beatDurationMs
      const timeCost = Math.abs(elapsedMs - expectedTime) * this.timeCostWeight

      if (unit.expectedMidi.includes(midiNumber)) {
        const nextIndex = candidate.index + 1
        nextCandidates.push({
          index: nextIndex,
          cost: candidate.cost + timeCost,
          lastMatchedIndex: candidate.index
        })
        advanced = true
      } else {
        // Wrong note for the current unit: record cost but stay.
        nextCandidates.push({ ...candidate, cost: candidate.cost + this.pitchCost })
        // Alternative: skip this unit and try matching the next one.
        const nextUnit = this.units[candidate.index + 1]
        if (nextUnit && nextUnit.expectedMidi.includes(midiNumber)) {
          nextCandidates.push({
            index: candidate.index + 2,
            cost: candidate.cost + this.skipCost + timeCost,
            lastMatchedIndex: candidate.index + 1
          })
          advanced = true
        }
      }
    }

    if (nextCandidates.length === 0) return 'wrong'

    this.candidates = nextCandidates
      .sort((left, right) => left.cost - right.cost)
      .slice(0, this.beamSize)

    const best = this.candidates[0]
    if (best.lastMatchedIndex > this.lastRecordedIndex) {
      for (let index = this.lastRecordedIndex + 1; index <= best.lastMatchedIndex; index += 1) {
        const unit = this.units[index]
        if (!unit) continue
        this.stepResults.push({
          unitId: unit.id,
          outcome: index === best.lastMatchedIndex ? 'correct' : 'skip'
        })
      }
      this.lastRecordedIndex = best.lastMatchedIndex
    }

    if (this.candidates.some((candidate) => candidate.index >= this.units.length)) {
      this.complete = true
      return 'complete'
    }

    return advanced ? 'correct' : 'wrong'
  }

  private lastRecordedIndex = -1
}
