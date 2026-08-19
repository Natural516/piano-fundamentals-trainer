import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice
} from 'vexflow/bravura'
import { ensureMusicNotationFont } from '../utils/musicNotationFont'
import { buildScoreTimeV2, INTERNAL_PPQ, type ScoreEventV2 } from '../score/scoreTimeV2'
import type { ScoreDocument, ScoreNoteModel } from '../score/musicXmlTypes'
import { getVexDurationSpec } from '../score/scoreEngraving'
import { buildScoreSheetLayout } from '../score/scoreSheetLayout'

interface ScoreSheetRendererProps {
  score: ScoreDocument
  startMeasure: number
  endMeasure: number
  currentMeasure: number | null
  currentSourceEventIds?: string[]
  ariaLabel: string
}

const TREBLE_Y = 22
const BASS_Y = 126

const SHARP_STEPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_STEPS = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

const ACCIDENTAL_GLYPH: Record<string, string> = {
  sharp: '#',
  flat: 'b',
  natural: 'n',
  'double-sharp': '##',
  'sharp-sharp': '##',
  'double-flat': 'bb',
  'flat-flat': 'bb'
}

const ALTER_GLYPH: Record<number, string> = {
  [-2]: 'bb',
  [-1]: 'b',
  1: '#',
  2: '##'
}

const FIFTHS_TO_KEY: Record<number, string> = {
  0: 'C',
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
  5: 'B',
  6: 'F#',
  7: 'C#',
  [-1]: 'F',
  [-2]: 'Bb',
  [-3]: 'Eb',
  [-4]: 'Ab',
  [-5]: 'Db',
  [-6]: 'Gb',
  [-7]: 'Cb'
}

function readThemeColor(container: HTMLElement, variable: string, fallback: string): string {
  return getComputedStyle(container).getPropertyValue(variable).trim() || fallback
}

function keyAlteration(step: string, fifths: number): number {
  if (fifths > 0) return SHARP_STEPS.slice(0, fifths).includes(step) ? 1 : 0
  if (fifths < 0) return FLAT_STEPS.slice(0, -fifths).includes(step) ? -1 : 0
  return 0
}

function accidentalFor(note: ScoreNoteModel, fifths: number): string | null {
  if (note.accidental) {
    return ACCIDENTAL_GLYPH[note.accidental] ?? null
  }
  if (note.alter !== 0 && keyAlteration(note.step, fifths) !== note.alter) {
    return ALTER_GLYPH[note.alter] ?? null
  }
  return null
}

function vexKey(note: ScoreNoteModel): string {
  return `${note.step.toLowerCase()}/${note.octave}`
}

function addDots(note: StaveNote, dotCount: number): void {
  for (let index = 0; index < dotCount; index += 1) Dot.buildAndAttach([note], { all: true })
}

function measureTicks(beats: number | null, beatType: number | null): number {
  if (!beats || !beatType) return INTERNAL_PPQ
  return Math.max(1, Math.round(beats * INTERNAL_PPQ * 4 / beatType))
}

interface RenderedNote {
  staveNote: StaveNote
  keyIndex: number
  midiPitch: number
  staff: number
  voice: string
  measureNumber: number
  systemIndex: number
  tieStart: boolean
  tieStop: boolean
}

function drawSheet(
  container: HTMLDivElement,
  score: ScoreDocument,
  startMeasure: number,
  endMeasure: number,
  currentMeasure: number | null,
  currentSourceEventIds: string[]
): void {
  container.replaceChildren()
  const measures = score.parts[0]?.measures ?? []
  const byNumber = new Map(measures.map((measure) => [measure.number, measure]))
  const displayMeasures: number[] = []
  for (let measureNumber = startMeasure; measureNumber <= endMeasure; measureNumber += 1) {
    if (byNumber.has(measureNumber)) displayMeasures.push(measureNumber)
  }
  if (displayMeasures.length === 0) return

  const time = buildScoreTimeV2(score)
  const eventsByMeasure = new Map<number, ScoreEventV2[]>()
  for (const event of time.events) {
    if (event.measureNumber < startMeasure || event.measureNumber > endMeasure) continue
    const list = eventsByMeasure.get(event.measureNumber) ?? []
    list.push(event)
    eventsByMeasure.set(event.measureNumber, list)
  }

  const inkColor = readThemeColor(container, '--text-primary', '#171717')
  const paperColor = readThemeColor(container, '--bg-card', '#ffffff')

  let runningFifths: number | null = null
  let runningBeats: number | null = null
  let runningBeatType: number | null = null
  const hasBassStaff = score.parts.some((part) => part.measures.some((measure) =>
    (measure.staves ?? 1) > 1 || measure.clefs.some((clef) => clef.staff === 2 || clef.sign === 'F')
  )) || displayMeasures.some((measureNumber) =>
    (eventsByMeasure.get(measureNumber) ?? []).some((event) => event.staff === 2)
  )
  const layout = buildScoreSheetLayout(displayMeasures, container.clientWidth || 920, hasBassStaff)
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(layout.width, layout.height)
  const context = renderer.getContext()
  const style = { fillStyle: inkColor, strokeStyle: inkColor }
  const tieQueue = new Map<string, Array<{ note: RenderedNote }>>()
  const ties: StaveTie[] = []

  container.dataset.systemCount = String(layout.systems.length)
  const measurePlacement = new Map<number, {
    measureWidth: number
    startX: number
    systemIndex: number
    systemMeasureIndex: number
    systemTop: number
  }>()
  for (const system of layout.systems) {
    system.measureNumbers.forEach((measureNumber, systemMeasureIndex) => {
      measurePlacement.set(measureNumber, {
        measureWidth: system.measureWidth,
        startX: system.startX,
        systemIndex: system.index,
        systemMeasureIndex,
        systemTop: system.top
      })
    })
  }

  displayMeasures.forEach((measureNumber, index) => {
    const measure = byNumber.get(measureNumber)
    const placement = measurePlacement.get(measureNumber)
    if (!measure || !placement) return
    const events = (eventsByMeasure.get(measureNumber) ?? []).sort(
      (left, right) => left.onsetInMeasure - right.onsetInMeasure || left.noteIndex - right.noteIndex
    )
    const fifths = measure.keySignature ?? runningFifths ?? 0
    const beats = measure.timeBeats ?? runningBeats ?? 4
    const beatType = measure.timeBeatType ?? runningBeatType ?? 4
    const showHeader = index === 0 || placement.systemMeasureIndex === 0 || fifths !== runningFifths || beats !== runningBeats || beatType !== runningBeatType
    runningFifths = fifths
    runningBeats = beats
    runningBeatType = beatType
    const x = placement.startX + placement.systemMeasureIndex * placement.measureWidth
    const systemTop = placement.systemTop
    context.save()
    context.setFillStyle(currentMeasure === measureNumber ? 'rgba(121, 100, 242, 0.14)' : 'rgba(121, 100, 242, 0.035)')
    context.fillRect(x, systemTop + 8, placement.measureWidth, layout.systemHeight - 16)
    context.restore()
    if (currentMeasure === measureNumber) {
      context.save()
      context.setStrokeStyle('rgba(121, 100, 242, 0.55)')
      context.beginPath().rect(x + 1, systemTop + 9, placement.measureWidth - 2, layout.systemHeight - 18).stroke().closePath()
      context.restore()
    }

    const trebleStave = new Stave(x, systemTop + TREBLE_Y, placement.measureWidth)
    const bassStave = hasBassStaff ? new Stave(x, systemTop + BASS_Y, placement.measureWidth) : null
    const keyName = FIFTHS_TO_KEY[fifths] ?? 'C'
    if (showHeader || index === 0) {
      trebleStave.addClef('treble').addKeySignature(keyName).addTimeSignature(`${beats}/${beatType}`)
      bassStave?.addClef('bass').addKeySignature(keyName)
    }

    const staffs: Array<{ stave: Stave; staffNumber: number }> = [{ stave: trebleStave, staffNumber: 1 }]
    if (bassStave) staffs.push({ stave: bassStave, staffNumber: 2 })

    for (const { stave, staffNumber } of staffs) {
      stave.setStyle(style)
      stave.setContext(context)
      stave.drawWithStyle()
    }

    if (bassStave && placement.systemMeasureIndex === 0) {
      context.save()
      context.setFillStyle(inkColor)
      context.setStrokeStyle(inkColor)
      const brace = new StaveConnector(trebleStave, bassStave).setType('brace')
      const left = new StaveConnector(trebleStave, bassStave).setType('singleLeft')
      brace.setStyle(style).setContext(context).drawWithStyle()
      left.setStyle(style).setContext(context).drawWithStyle()
      context.restore()
    }

    const renderedNotes: RenderedNote[] = []
    for (const { stave, staffNumber } of staffs) {
      const staffEvents = events.filter((event) => event.staff === staffNumber)
      if (staffEvents.length === 0) {
        const voice = new Voice({ numBeats: beats, beatValue: beatType })
        voice.setMode(Voice.Mode.SOFT)
        const restSpec = getVexDurationSpec(null, measureTicks(beats, beatType))
        const rest = new StaveNote({ keys: ['b/4'], duration: `${restSpec.duration}r` })
        addDots(rest, restSpec.dotCount)
        rest.setStyle(style)
        voice.addTickables([rest])
        new Formatter().joinVoices([voice]).formatToStave([voice], stave)
        voice.draw(context, stave)
        continue
      }

      const eventsByVoice = new Map<string, ScoreEventV2[]>()
      for (const event of staffEvents) {
        const voiceEvents = eventsByVoice.get(event.voice) ?? []
        voiceEvents.push(event)
        eventsByVoice.set(event.voice, voiceEvents)
      }
      const voices: Voice[] = []
      const tuplets: Tuplet[] = []
      for (const voiceEvents of eventsByVoice.values()) {
        const groups = new Map<number, ScoreEventV2[]>()
        for (const event of voiceEvents) {
          const group = groups.get(event.onsetInMeasure) ?? []
          group.push(event)
          groups.set(event.onsetInMeasure, group)
        }
        const tickables: StaveNote[] = []
        let activeTuplet: { actualNotes: number; normalNotes: number; members: StaveNote[] } | null = null
        let cursor = 0
        for (const [onset, group] of [...groups.entries()].sort((left, right) => left[0] - right[0])) {
          if (onset > cursor) {
            const gapSpec = getVexDurationSpec(null, onset - cursor)
            const gapRest = new StaveNote({ keys: ['b/4'], duration: `${gapSpec.duration}r` })
            addDots(gapRest, gapSpec.dotCount)
            gapRest.setStyle(style)
            tickables.push(gapRest)
          }
          const duration = Math.max(1, group[0].duration)
          const isRest = group.every((event) => event.type === 'rest')
          const notes = group.map((event) => measure.notes[event.noteIndex]).filter(Boolean)
          const spec = getVexDurationSpec(notes[0] ?? null, duration)
          const staveNote = new StaveNote({
            keys: isRest ? ['b/4'] : notes.map(vexKey),
            duration: `${spec.duration}${isRest ? 'r' : ''}`,
            clef: staffNumber === 2 ? 'bass' : 'treble'
          })
          addDots(staveNote, spec.dotCount)
          const isExpected = group.some((event) => currentSourceEventIds.includes(event.id))
          const noteStyle = isExpected ? { fillStyle: '#7c5cff', strokeStyle: '#7c5cff' } : style
          if (!isRest) {
            notes.forEach((note, keyIndex) => {
              const accidental = accidentalFor(note, fifths)
              if (accidental) staveNote.addModifier(new Accidental(accidental).setStyle(noteStyle), keyIndex)
            })
          }
          staveNote.setStyle(noteStyle)
          tickables.push(staveNote)
          if (spec.tuplet) {
            if (!activeTuplet || activeTuplet.actualNotes !== spec.tuplet.actualNotes || activeTuplet.normalNotes !== spec.tuplet.normalNotes) {
              activeTuplet = { ...spec.tuplet, members: [] }
            }
            activeTuplet.members.push(staveNote)
            if (activeTuplet.members.length === activeTuplet.actualNotes) {
              tuplets.push(new Tuplet(activeTuplet.members, {
                numNotes: activeTuplet.actualNotes,
                notesOccupied: activeTuplet.normalNotes
              }))
              activeTuplet = null
            }
          } else {
            activeTuplet = null
          }
          if (!isRest) {
            group.forEach((event, keyIndex) => renderedNotes.push({
              staveNote,
              keyIndex,
              midiPitch: event.midiPitch ?? 0,
              staff: staffNumber,
              voice: event.voice,
              measureNumber,
              systemIndex: placement.systemIndex,
              tieStart: event.tieStart,
              tieStop: event.tieStop
            }))
          }
          cursor = Math.max(cursor, onset + duration)
        }
        const total = measureTicks(beats, beatType)
        if (cursor < total) {
          const fillSpec = getVexDurationSpec(null, total - cursor)
          const fillRest = new StaveNote({ keys: ['b/4'], duration: `${fillSpec.duration}r` })
          addDots(fillRest, fillSpec.dotCount)
          fillRest.setStyle(style)
          tickables.push(fillRest)
        }
        const voice = new Voice({ numBeats: beats, beatValue: beatType })
        voice.setMode(Voice.Mode.SOFT)
        voice.addTickables(tickables)
        voices.push(voice)
      }
      new Formatter().joinVoices(voices).formatToStave(voices, stave)
      for (const voice of voices) voice.draw(context, stave)
      for (const tuplet of tuplets) tuplet.setContext(context).draw()
    }

    for (const rendered of renderedNotes) {
      const queueKey = `${rendered.staff}:${rendered.voice}:${rendered.midiPitch}`
      if (rendered.tieStart) {
        const queue = tieQueue.get(queueKey) ?? []
        queue.push({ note: rendered })
        tieQueue.set(queueKey, queue)
      }
      if (rendered.tieStop) {
        const queue = tieQueue.get(queueKey) ?? []
        const start = queue.shift()
        if (start) {
          if (start.note.systemIndex === rendered.systemIndex) {
            ties.push(new StaveTie(
              {
                firstNote: start.note.staveNote,
                lastNote: rendered.staveNote,
                firstIndexes: [start.note.keyIndex],
                lastIndexes: [rendered.keyIndex]
              },
              ''
            ))
          } else {
            ties.push(
              new StaveTie({ firstNote: start.note.staveNote, firstIndexes: [start.note.keyIndex] }, ''),
              new StaveTie({ lastNote: rendered.staveNote, lastIndexes: [rendered.keyIndex] }, '')
            )
          }
        }
      }
    }
  })

  for (const tie of ties) {
    tie.setStyle(style)
    tie.setContext(context)
    tie.drawWithStyle()
  }

  const svg = container.querySelector('svg')
  if (svg) {
    svg.style.background = paperColor
  }

  const currentPlacement = currentMeasure === null ? null : measurePlacement.get(currentMeasure)
  if (currentPlacement) container.dataset.currentSystem = String(currentPlacement.systemIndex)
  else delete container.dataset.currentSystem
}

export function ScoreSheetRenderer(props: ScoreSheetRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fontReady, setFontReady] = useState(false)
  const [fontError, setFontError] = useState('')
  const signature = useMemo(
    () => `${props.score.title}|${props.startMeasure}-${props.endMeasure}|${props.currentMeasure ?? ''}`,
    [props.currentMeasure, props.endMeasure, props.score, props.startMeasure]
  )

  useEffect(() => {
    let cancelled = false
    void ensureMusicNotationFont()
      .then(() => {
        if (!cancelled) setFontReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFontError(error instanceof Error ? error.message : '本地音乐字体加载失败。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !fontReady) return

    let frameId = 0
    const redraw = (): void => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        drawSheet(container, props.score, props.startMeasure, props.endMeasure, props.currentMeasure, props.currentSourceEventIds ?? [])
      })
    }
    const resizeObserver = new ResizeObserver(redraw)
    const themeObserver = new MutationObserver(redraw)
    resizeObserver.observe(container)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
    redraw()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      container.replaceChildren()
    }
  }, [fontReady, props.currentMeasure, props.currentSourceEventIds, props.endMeasure, props.score, props.startMeasure, signature])

  return (
    <div
      ref={containerRef}
      className="score-sheet-renderer"
      role="img"
      aria-label={props.ariaLabel}
      aria-busy={!fontReady && !fontError}
    >
      {fontError ? <span className="music-staff-renderer__error" role="alert">{fontError}</span> : null}
    </div>
  )
}
