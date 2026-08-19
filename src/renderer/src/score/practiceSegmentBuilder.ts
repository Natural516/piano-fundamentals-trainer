import type { ScoreDocument } from './musicXmlTypes'
import { buildScoreTimeV2, groupPerformanceAttacks, mergeTiedPerformanceEvents, type ScoreEventV2 } from './scoreTimeV2'

export interface PracticeSegmentEvent {
  sourceEventId: string
  partIndex: number
  practiceTick: number
  originalAbsoluteTick: number
  originalMeasure: number
  originalBeat: number
  duration: number
  staff: number
  hand: 'left' | 'right' | 'both'
  voice: string
  midiPitch: number | null
  tieStart: boolean
  tieStop: boolean
  type: 'note' | 'rest' | 'chord'
}

export interface PracticeExpectedUnit {
  practiceTick: number
  originalAbsoluteTick: number
  originalMeasure: number
  originalBeat: number
  expectedMidi: number[]
  rest: boolean
  tieStart: boolean
  events: PracticeSegmentEvent[]
  staff: number | null
  hand: 'left' | 'right' | 'both' | null
  sourceEventIds: string[]
}

export interface PracticeSegment {
  scoreId: string
  startMeasure: number
  endMeasure: number
  handMode: 'left' | 'right' | 'both'
  sourceStartAbsoluteTick: number
  duration: number
  events: PracticeSegmentEvent[]
  expectedUnits: PracticeExpectedUnit[]
  displayMeasures: number[]
  segmentBoundaryRetrigger: boolean
}

export interface PracticeSegmentOptions {
  startMeasure?: number
  endMeasure?: number
  handMode?: 'left' | 'right' | 'both'
  includeTiesFromPrevious?: boolean
  segmentBoundaryRetrigger?: boolean
}

function handForStaff(score: ScoreDocument, partIndex: number, staff: number): 'left' | 'right' | 'both' {
  const measures = score.parts[partIndex]?.measures ?? []
  const clef = measures.flatMap((measure) => measure.clefs).find((entry) => entry.staff === staff)
  if (clef?.sign === 'F') return 'left'
  if (clef?.sign === 'G') return 'right'
  const staffCount = measures.reduce((maximum, measure) => Math.max(maximum, measure.staves ?? 1), 1)
  if (staffCount > 1) return staff === 2 ? 'left' : 'right'
  return staff === 2 ? 'left' : 'right'
}

/**
 * THE shared practice-segment builder for Wait / Realtime / Teaching Playback.
 * Practice ticks are rebased so the first playable event is tick 0, while each
 * event keeps its original absolute tick / measure / beat for evidence.
 */
export function buildPracticeSegment(score: ScoreDocument, options: PracticeSegmentOptions = {}): PracticeSegment {
  const startMeasure = Math.max(1, options.startMeasure ?? 1)
  const endMeasure = Math.max(startMeasure, options.endMeasure ?? Number.MAX_SAFE_INTEGER)
  const handMode = options.handMode ?? 'both'
  const segmentBoundaryRetrigger = options.segmentBoundaryRetrigger ?? false
  const { events: scoreEvents } = buildScoreTimeV2(score)
  const performanceAttackGroups = groupPerformanceAttacks(mergeTiedPerformanceEvents(scoreEvents))
  const performanceAttackEventIds = new Set(performanceAttackGroups.flatMap((group) => group.sourceEventIds))
  const performanceAttackOrder = new Map(
    performanceAttackGroups.flatMap((group) => group.sourceEventIds).map((sourceEventId, index) => [sourceEventId, index])
  )

  const selected = scoreEvents
    .filter((event) => event.measureNumber >= startMeasure && event.measureNumber <= endMeasure)
    .filter((event) => handMode === 'both' || handForStaff(score, event.partIndex, event.staff) === handMode)

  const sourceStartAbsoluteTick = selected.length > 0
    ? Math.min(...selected.map((event) => event.absoluteOnset))
    : 0

  const events: PracticeSegmentEvent[] = selected
    .sort((left, right) =>
      left.absoluteOnset - right.absoluteOnset ||
      left.partIndex - right.partIndex ||
      left.staff - right.staff ||
      left.noteIndex - right.noteIndex
    )
    .map((event) => ({
      sourceEventId: event.id,
      partIndex: event.partIndex,
      practiceTick: event.absoluteOnset - sourceStartAbsoluteTick,
      originalAbsoluteTick: event.absoluteOnset,
      originalMeasure: event.measureNumber,
      originalBeat: event.onsetInMeasure / 480 + 1,
      duration: event.duration,
      staff: event.staff,
      hand: handForStaff(score, event.partIndex, event.staff),
      voice: event.voice,
      midiPitch: event.midiPitch,
      tieStart: event.tieStart,
      tieStop: event.tieStop,
      type: event.type
    }))

  const grouped = new Map<string, { practiceTick: number; originalAbsoluteTick: number; originalMeasure: number; originalBeat: number; segmentEvents: PracticeSegmentEvent[] }>()
  for (const event of events) {
    const onsetKey = String(event.originalAbsoluteTick)
    const group = grouped.get(onsetKey) ?? {
      practiceTick: event.practiceTick,
      originalAbsoluteTick: event.originalAbsoluteTick,
      originalMeasure: event.originalMeasure,
      originalBeat: event.originalBeat,
      segmentEvents: []
    }
    group.segmentEvents.push(event)
    grouped.set(onsetKey, group)
  }

  const expectedUnits: PracticeExpectedUnit[] = [...grouped.entries()]
    .map(([, group]) => {
      const expectedMidi = group.segmentEvents
        .filter((event) => {
          if (event.midiPitch === null) return false
          if (segmentBoundaryRetrigger && group.practiceTick === 0 && event.tieStop) return true
          return performanceAttackEventIds.has(event.sourceEventId)
        })
        .map((event) => event.midiPitch as number)
        .sort((left, right) => left - right)
      const attackSourceEventIds = group.segmentEvents
        .filter((event) => {
          if (segmentBoundaryRetrigger && group.practiceTick === 0 && event.tieStop) return event.midiPitch !== null
          return performanceAttackEventIds.has(event.sourceEventId)
        })
        .map((event) => event.sourceEventId)
        .sort((left, right) => (performanceAttackOrder.get(left) ?? 0) - (performanceAttackOrder.get(right) ?? 0))
      return {
        practiceTick: group.practiceTick,
        originalAbsoluteTick: group.originalAbsoluteTick,
        originalMeasure: group.originalMeasure,
        originalBeat: group.originalBeat,
        expectedMidi: [...new Set(expectedMidi)],
        rest: group.segmentEvents.every((event) => event.type === 'rest'),
        tieStart: group.segmentEvents.some((event) => event.tieStart),
        events: group.segmentEvents,
        staff: new Set(group.segmentEvents.map((event) => event.staff)).size === 1
          ? group.segmentEvents[0]?.staff ?? null
          : null,
        hand: (() => {
          const hands = new Set(group.segmentEvents.filter((event) => event.midiPitch !== null).map((event) => event.hand))
          if (hands.size === 0) return null
          return hands.size === 1 ? [...hands][0] : 'both'
        })(),
        sourceEventIds: attackSourceEventIds
      }
    })
    .sort((left, right) => left.practiceTick - right.practiceTick)
    .map((unit, index) => ({ ...unit }))

  const displayMeasures: number[] = []
  for (let measure = startMeasure; measure <= endMeasure; measure += 1) {
    displayMeasures.push(measure)
  }

  return {
    scoreId: score.title,
    startMeasure,
    endMeasure,
    handMode,
    sourceStartAbsoluteTick,
    duration: events.length > 0 ? Math.max(...events.map((event) => event.practiceTick + event.duration)) : 0,
    events,
    expectedUnits,
    displayMeasures,
    segmentBoundaryRetrigger
  }
}

export function eventToScoreV2Like(event: PracticeSegmentEvent): ScoreEventV2 {
  return {
    id: event.sourceEventId,
    partIndex: event.partIndex,
    measureIndex: 0,
    measureNumber: event.originalMeasure,
    stableMeasureId: `segment:measure:${event.originalMeasure}`,
    displayMeasureNumber: String(event.originalMeasure),
    measureSequenceIndex: Math.max(0, event.originalMeasure - 1),
    noteIndex: 0,
    onsetInMeasure: Math.round((event.originalBeat - 1) * 480),
    absoluteOnset: event.practiceTick,
    duration: event.duration,
    staff: event.staff,
    voice: event.voice,
    sourceDivisions: 480,
    writtenStep: '',
    writtenAlter: 0,
    writtenOctave: 4,
    midiPitch: event.midiPitch,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
    type: event.type
  }
}
