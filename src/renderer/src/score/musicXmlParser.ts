import { childNumber, childText, findChild, findChildren, parseXml, type XmlElement } from './xmlMiniParser'
import type {
  ScoreDocument,
  ScoreMeasure,
  ScoreNoteModel,
  ScorePartModel
} from './musicXmlTypes'

const STEP_OFFSET: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
}

export function parseMusicXml(source: string): ScoreDocument {
  const root = parseXml(source)
  if (root.tag !== 'score-partwise' && root.tag !== 'score-timewise') {
    throw new Error(`Unsupported MusicXML root: ${root.tag}`)
  }

  const work = findChild(root, 'work')
  const title = (work ? childText(work, 'work-title') : '') || childText(root, 'movement-title') || 'Untitled'
  const parts: ScorePartModel[] = []

  for (const partElement of findChildren(root, 'part')) {
    const partId = partElement.attributes.id ?? ''
    const partListPart = findPartListPart(root, partId)
    const name = partListPart ? childText(partListPart, 'part-name') : partId
    const measures = findChildren(partElement, 'measure').map(parseMeasure)
    parts.push({ id: partId, name, measures })
  }

  const firstTempo = parts[0]?.measures.find((measure) => measure.tempoBpm !== null)?.tempoBpm ?? null

  return {
    title,
    parts,
    defaultTempoBpm: firstTempo
  }
}

function findPartListPart(root: XmlElement, partId: string): XmlElement | null {
  const partList = findChild(root, 'part-list')
  if (!partList) return null
  return findChildren(partList, 'score-part').find((element) => element.attributes.id === partId) ?? null
}

function parseMeasure(element: XmlElement): ScoreMeasure {
  const measure: ScoreMeasure = {
    number: Number(element.attributes.number) || 0,
    implicit: element.attributes.implicit === 'yes',
    notes: [],
    timeEvents: [],
    keySignature: null,
    timeBeats: null,
    timeBeatType: null,
    tempoBpm: null,
    divisions: null
  }

  for (const child of element.children) {
    if (typeof child === 'string') continue

    if (child.tag === 'attributes') {
      measure.divisions = childNumber(child, 'divisions') ?? measure.divisions
      const key = findChild(child, 'key')
      if (key) {
        const fifths = childNumber(key, 'fifths')
        measure.keySignature = fifths ?? measure.keySignature
      }
      const time = findChild(child, 'time')
      if (time) {
        measure.timeBeats = childNumber(time, 'beats') ?? measure.timeBeats
        measure.timeBeatType = childNumber(time, 'beat-type') ?? measure.timeBeatType
      }
      continue
    }

    if (child.tag === 'direction') {
      const sound = findChild(child, 'sound')
      const tempo = sound ? Number(sound.attributes.tempo) : NaN
      if (Number.isFinite(tempo)) measure.tempoBpm = tempo
      continue
    }

    if (child.tag === 'note') {
      const note = parseNote(child, measure.notes.length)
      if (note) {
        measure.timeEvents.push({ kind: 'note', noteIndex: measure.notes.length })
        measure.notes.push(note)
      }
      continue
    }

    if (child.tag === 'backup') {
      const duration = childNumber(child, 'duration')
      if (duration !== null) {
        measure.timeEvents.push({ kind: 'backup', duration })
      }
      continue
    }

    if (child.tag === 'forward') {
      const duration = childNumber(child, 'duration')
      if (duration !== null) {
        measure.timeEvents.push({ kind: 'forward', duration })
      }
      continue
    }
  }

  return measure
}

function parseNote(element: XmlElement, index: number): ScoreNoteModel | null {
  const rest = findChild(element, 'rest') !== null
  const pitch = rest ? null : findChild(element, 'pitch')
  const step = pitch ? childText(pitch, 'step').toUpperCase() : ''
  const alter = pitch ? (childNumber(pitch, 'alter') ?? 0) : 0
  const octave = pitch ? (childNumber(pitch, 'octave') ?? 4) : 4
  const duration = childNumber(element, 'duration') ?? 0
  const voice = childText(element, 'voice') || '1'
  const staff = childNumber(element, 'staff') ?? 1
  const tieStart = findChildren(element, 'tie').some((tie) => tie.attributes.type === 'start')
  const tieStop = findChildren(element, 'tie').some((tie) => tie.attributes.type === 'stop')
  const tieContinue = findChildren(element, 'tie').some((tie) => tie.attributes.type === 'continue')
  const accidental = findChild(element, 'accidental')?.text ?? null
  const grace = findChild(element, 'grace') !== null

  const midiNumber = rest ? null : stepToMidi(step, alter, octave)

  return {
    id: `note-${index}`,
    type: rest ? 'rest' : 'note',
    midiNumber,
    step,
    alter,
    octave,
    duration,
    voice,
    staff,
    isChordTone: findChild(element, 'chord') !== null,
    tie: tieStart ? 'start' : tieStop ? 'stop' : tieContinue ? 'continue' : null,
    accidental: accidental || null,
    isGrace: grace
  }
}

export function stepToMidi(step: string, alter: number, octave: number): number {
  const base = STEP_OFFSET[step.toUpperCase()] ?? 0
  return (octave + 1) * 12 + base + alter
}

export function loadMusicXmlDocument(xmlText: string): ScoreDocument {
  return parseMusicXml(xmlText)
}
