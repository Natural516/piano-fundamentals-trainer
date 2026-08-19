import type { ScoreDocument, ScoreMeasure } from './musicXmlTypes'

export const INTERNAL_PPQ = 480

export interface EffectiveScoreAttributes {
  divisions: number
  fifths: number | null
  beats: number | null
  beatType: number | null
  staves: number
}

export interface ScoreEventV2 {
  id: string
  partIndex: number
  measureIndex: number
  measureNumber: number
  noteIndex: number
  onsetInMeasure: number
  absoluteOnset: number
  duration: number
  staff: number
  voice: string
  sourceDivisions: number
  writtenStep: string
  writtenAlter: number
  writtenOctave: number
  midiPitch: number | null
  tieStart: boolean
  tieStop: boolean
  type: 'note' | 'rest' | 'chord'
}

export interface ScoreTimeDocumentV2 {
  events: ScoreEventV2[]
  measureStartTicks: Array<{ partIndex: number; measureIndex: number; measureNumber: number; startTick: number }>
}

export class UnsupportedScoreFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedScoreFormatError'
  }
}

function toCanonicalTicks(duration: number, divisions: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const safeDivisions = Math.max(1, divisions)
  return Math.round((duration * INTERNAL_PPQ) / safeDivisions)
}

function resolveAttributes(previous: EffectiveScoreAttributes, measure: ScoreMeasure): EffectiveScoreAttributes {
  return {
    divisions: measure.divisions ?? previous.divisions,
    fifths: measure.keySignature !== null ? measure.keySignature : previous.fifths,
    beats: measure.timeBeats !== null ? measure.timeBeats : previous.beats,
    beatType: measure.timeBeatType !== null ? measure.timeBeatType : previous.beatType,
    staves: measure.staves ?? previous.staves
  }
}

const DEFAULT_ATTRIBUTES: EffectiveScoreAttributes = {
  divisions: 1,
  fifths: null,
  beats: null,
  beatType: null,
  staves: 1
}

/**
 * Score Time Model V2.
 *
 * A single document cursor per part (NOT per voice) advances on every
 * non-chord note/rest; chord tones share the previous note's onset without
 * advancing. All durations are converted from source divisions to canonical
 * INTERNAL_PPQ ticks, so a whole note is always 4 quarter beats regardless of
 * mid-measure divisions changes. Attributes inherit across measures.
 */
export function buildScoreTimeV2(score: ScoreDocument): ScoreTimeDocumentV2 {
  const events: ScoreEventV2[] = []
  const measureStartTicks: ScoreTimeDocumentV2['measureStartTicks'] = []

  score.parts.forEach((part, partIndex) => {
    let attributes = { ...DEFAULT_ATTRIBUTES }
    let documentCursor = 0

    part.measures.forEach((measure, measureIndex) => {
      attributes = resolveAttributes(attributes, measure)
      const measureStartTick = documentCursor
      let furthestDocumentCursor = documentCursor
      measureStartTicks.push({
        partIndex,
        measureIndex,
        measureNumber: measure.number,
        startTick: measureStartTick
      })
      let lastNoteOnset: number | null = null

      for (const event of measure.timeEvents) {
        if (event.kind === 'backup') {
          documentCursor = Math.max(0, documentCursor - toCanonicalTicks(event.duration, attributes.divisions))
          continue
        }
        if (event.kind === 'forward') {
          documentCursor += toCanonicalTicks(event.duration, attributes.divisions)
          furthestDocumentCursor = Math.max(furthestDocumentCursor, documentCursor)
          continue
        }

        const note = measure.notes[event.noteIndex]
        if (!note) continue
        const onsetInMeasure: number = note.isChordTone && lastNoteOnset !== null
          ? lastNoteOnset
          : documentCursor - measureStartTick
        const duration = toCanonicalTicks(note.duration, attributes.divisions)

        if (!note.isChordTone) {
          documentCursor = measureStartTick + onsetInMeasure + duration
          furthestDocumentCursor = Math.max(furthestDocumentCursor, documentCursor)
          lastNoteOnset = onsetInMeasure
        }

        events.push({
          id: `ev-p${partIndex}-m${measure.number}-o${onsetInMeasure}-${event.noteIndex}`,
          partIndex,
          measureIndex,
          measureNumber: measure.number,
          noteIndex: event.noteIndex,
          onsetInMeasure,
          absoluteOnset: measureStartTick + onsetInMeasure,
          duration,
          staff: note.staff ?? 1,
          voice: note.voice,
          sourceDivisions: attributes.divisions,
          writtenStep: note.step,
          writtenAlter: note.alter,
          writtenOctave: note.octave,
          midiPitch: note.midiNumber,
          tieStart: note.tieStart,
          tieStop: note.tieStop,
          type: note.type === 'rest' ? 'rest' : note.isChordTone ? 'chord' : 'note'
        })
      }

      // MusicXML traversal can finish on a shorter voice after <backup>.
      // The next measure starts after the furthest score position reached by
      // any voice/staff, never at the traversal cursor's final position.
      documentCursor = furthestDocumentCursor
    })
  })

  return { events, measureStartTicks }
}

export interface TiedPerformanceEvent {
  midiPitch: number
  attackTick: number
  releaseTick: number
  measureNumber: number
  staff: number
  partIndex: number
  voice: string
  sourceEventIds: string[]
}

export interface TieMergeWarning {
  code: 'ORPHAN_TIE_STOP' | 'OVERLAPPING_TIE_START' | 'DISCONTINUOUS_TIE'
  eventId: string
  message: string
}

export interface TieMergeResult {
  events: TiedPerformanceEvent[]
  warnings: TieMergeWarning[]
}

export interface PerformanceAttackGroup {
  attackTick: number
  events: TiedPerformanceEvent[]
  pitches: number[]
  sourceEventIds: string[]
  measureNumbers: number[]
  staffs: number[]
  voices: string[]
}

/**
 * Merges a tie chain into performance events: one attack per chain and one
 * release at the end. Notated notes remain separate in the display model.
 */
export function mergeTiedPerformanceEventsWithDiagnostics(events: ScoreEventV2[]): TieMergeResult {
  const performanceEvents: TiedPerformanceEvent[] = []
  const warnings: TieMergeWarning[] = []
  const activeChains = new Map<string, TiedPerformanceEvent>()
  const ordered = [...events].sort((left, right) =>
    left.absoluteOnset - right.absoluteOnset ||
    left.partIndex - right.partIndex ||
    left.staff - right.staff ||
    left.noteIndex - right.noteIndex
  )

  const createAttack = (event: ScoreEventV2): TiedPerformanceEvent => ({
    midiPitch: event.midiPitch as number,
    attackTick: event.absoluteOnset,
    releaseTick: event.absoluteOnset + event.duration,
    measureNumber: event.measureNumber,
    staff: event.staff,
    partIndex: event.partIndex,
    voice: event.voice,
    sourceEventIds: [event.id]
  })

  for (const event of ordered) {
    if (event.type === 'rest' || event.midiPitch === null) continue
    const key = `${event.partIndex}:${event.staff}:${event.voice}:${event.midiPitch}`
    const active = activeChains.get(key)

    if (event.tieStop) {
      const isContinuous = Boolean(active) && Math.abs(event.absoluteOnset - active!.releaseTick) <= 1
      if (active) {
        if (!isContinuous) {
          warnings.push({
            code: 'DISCONTINUOUS_TIE',
            eventId: event.id,
            message: `Tie continuation ${event.id} is not continuous with its active chain; notation tie semantics were preserved.`
          })
        }
        active.releaseTick = Math.max(active.releaseTick, event.absoluteOnset + event.duration)
        active.sourceEventIds.push(event.id)
        if (!event.tieStart) activeChains.delete(key)
        continue
      }

      warnings.push({
        code: 'ORPHAN_TIE_STOP',
        eventId: event.id,
        message: `Tie stop ${event.id} has no matching active chain; treated as a standalone attack.`
      })
      const standalone = createAttack(event)
      performanceEvents.push(standalone)
      if (event.tieStart) activeChains.set(key, standalone)
      continue
    }

    const attack = createAttack(event)
    performanceEvents.push(attack)
    if (event.tieStart) {
      if (active) {
        warnings.push({
          code: 'OVERLAPPING_TIE_START',
          eventId: event.id,
          message: `Tie start ${event.id} overlaps an unfinished chain; both attacks are preserved.`
        })
      }
      activeChains.set(key, attack)
    }
  }

  return {
    events: performanceEvents.sort((left, right) =>
      left.attackTick - right.attackTick || left.midiPitch - right.midiPitch
    ),
    warnings
  }
}

export function mergeTiedPerformanceEvents(events: ScoreEventV2[]): TiedPerformanceEvent[] {
  return mergeTiedPerformanceEventsWithDiagnostics(events).events
}

/**
 * Exact performance attack groups. Integer canonical ticks are the only
 * simultaneity key: staff, hand, voice, part and parser traversal order never
 * split or merge a target.
 */
export function groupPerformanceAttacks(events: TiedPerformanceEvent[]): PerformanceAttackGroup[] {
  const groups = new Map<number, TiedPerformanceEvent[]>()
  for (const event of [...events].sort((left, right) =>
    left.attackTick - right.attackTick ||
    left.midiPitch - right.midiPitch ||
    left.partIndex - right.partIndex ||
    left.staff - right.staff
  )) {
    const group = groups.get(event.attackTick) ?? []
    group.push(event)
    groups.set(event.attackTick, group)
  }

  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([attackTick, groupEvents]) => ({
      attackTick,
      events: groupEvents,
      pitches: groupEvents.map((event) => event.midiPitch).sort((left, right) => left - right),
      // Only the first notation event creates the attack. Tie continuation
      // source IDs must never become a later/current Wait highlight.
      sourceEventIds: groupEvents
        .map((event) => event.sourceEventIds[0])
        .filter((id): id is string => typeof id === 'string'),
      measureNumbers: [...new Set(groupEvents.map((event) => event.measureNumber))].sort((left, right) => left - right),
      staffs: [...new Set(groupEvents.map((event) => event.staff))].sort((left, right) => left - right),
      voices: [...new Set(groupEvents.map((event) => event.voice))].sort()
    }))
}

export function buildScorePerformanceAttackGroups(score: ScoreDocument): PerformanceAttackGroup[] {
  return groupPerformanceAttacks(mergeTiedPerformanceEvents(buildScoreTimeV2(score).events))
}
