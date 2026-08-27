import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Accidental,
  Formatter,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
  type ElementStyle
} from 'vexflow/bravura'
import { ensureMusicNotationFont } from '../utils/musicNotationFont'
import {
  FREE_PRACTICE_STAFF_GEOMETRY,
  getFreePracticeStaffGeometrySnapshot,
  getFreePracticeStaffSlotPositions
} from '../utils/freePracticeStaffGeometry'
import type { FreePracticeNotationColumn } from '../utils/freePracticeVisualization'
import type { MusicNotationPitch, MusicStaffClef } from '../utils/musicNotationTypes'

interface FreePracticeStaffRendererProps {
  columns: readonly FreePracticeNotationColumn[]
  latestEventId: number
  ariaLabel: string
  onRenderReady?: (eventId: number, commitAt: number) => void
}

const STAFF_INK_COLOR = '#171717'
const TRANSPARENT_STEM_STYLE = {
  fillStyle: 'rgba(0, 0, 0, 0)',
  strokeStyle: 'rgba(0, 0, 0, 0)'
} as const

function setContextColor(context: ReturnType<Renderer['getContext']>, color: string): void {
  context.setFillStyle(color)
  context.setStrokeStyle(color)
}

function drawFixedStave(
  context: ReturnType<Renderer['getContext']>,
  stave: Stave
): void {
  const style = { fillStyle: STAFF_INK_COLOR, strokeStyle: STAFF_INK_COLOR }
  stave.setStyle(style)
  stave.getModifiers().forEach((modifier) => modifier.setStyle(style))
  context.save()
  setContextColor(context, STAFF_INK_COLOR)
  stave.setContext(context).drawWithStyle()
  context.restore()
}

function createNeutralAttackNote(
  pitches: readonly MusicNotationPitch[],
  clef: MusicStaffClef,
  style: ElementStyle
): StaveNote | GhostNote {
  if (pitches.length === 0) return new GhostNote('q')

  const note = new StaveNote({
    keys: pitches.map((pitch) => pitch.vexFlowKey),
    duration: 'q',
    clef
  })
  pitches.forEach((pitch, index) => {
    if (pitch.displayAccidental) {
      note.addModifier(new Accidental(pitch.displayAccidental).setStyle(style), index)
    }
  })
  note.setStyle(style)
  note.setStemStyle(TRANSPARENT_STEM_STYLE)
  note.setLedgerLineStyle(style)
  return note
}

function drawFixedAttackSlots(
  context: ReturnType<Renderer['getContext']>,
  trebleStave: Stave,
  bassStave: Stave,
  columns: readonly FreePracticeNotationColumn[]
): void {
  const geometry = FREE_PRACTICE_STAFF_GEOMETRY
  const visibleColumns = columns.slice(-geometry.slotCount)
  const style = { fillStyle: STAFF_INK_COLOR, strokeStyle: STAFF_INK_COLOR }
  const paddedColumns = Array.from({ length: geometry.slotCount }, (_, index) => visibleColumns[index] ?? null)
  const trebleTickables = paddedColumns.map((column) => createNeutralAttackNote(
    column?.pitches.filter((pitch) => pitch.clef === 'treble') ?? [],
    'treble',
    style
  ))
  const bassTickables = paddedColumns.map((column) => createNeutralAttackNote(
    column?.pitches.filter((pitch) => pitch.clef === 'bass') ?? [],
    'bass',
    style
  ))
  const voiceTime = { numBeats: geometry.slotCount, beatValue: 4 }
  const trebleVoice = new Voice(voiceTime)
    .setMode(Voice.Mode.SOFT)
    .setStave(trebleStave)
    .addTickables(trebleTickables)
  const bassVoice = new Voice(voiceTime)
    .setMode(Voice.Mode.SOFT)
    .setStave(bassStave)
    .addTickables(bassTickables)

  const formatter = new Formatter()
    .joinVoices([trebleVoice, bassVoice])
    .format([trebleVoice, bassVoice], geometry.formatWidth, { context })
  getFreePracticeStaffSlotPositions().forEach((slotX, index) => {
    trebleTickables[index].getTickContext().setX(slotX)
    bassTickables[index].getTickContext().setX(slotX)
  })
  formatter.postFormat()
  context.save()
  setContextColor(context, STAFF_INK_COLOR)
  trebleVoice.draw(context, trebleStave)
  bassVoice.draw(context, bassStave)
  context.restore()
}

function drawFreePracticeStaff(
  container: HTMLDivElement,
  columns: readonly FreePracticeNotationColumn[]
): void {
  const geometry = FREE_PRACTICE_STAFF_GEOMETRY
  container.replaceChildren()
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(geometry.width, geometry.height)
  const svg = container.querySelector('svg')
  svg?.setAttribute('viewBox', geometry.viewBox)
  svg?.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  const context = renderer.getContext()
  const staveOptions = { spacingBetweenLinesPx: geometry.staffLineSpacing }
  const trebleStave = new Stave(
    geometry.staveX,
    geometry.trebleStaveY,
    geometry.staveWidth,
    staveOptions
  ).addClef('treble').addKeySignature('C')
  const bassStave = new Stave(
    geometry.staveX,
    geometry.bassStaveY,
    geometry.staveWidth,
    staveOptions
  ).addClef('bass').addKeySignature('C')

  drawFixedStave(context, trebleStave)
  drawFixedStave(context, bassStave)
  const connectorStyle = { fillStyle: STAFF_INK_COLOR, strokeStyle: STAFF_INK_COLOR }
  context.save()
  setContextColor(context, STAFF_INK_COLOR)
  new StaveConnector(trebleStave, bassStave)
    .setType('brace')
    .setStyle(connectorStyle)
    .setContext(context)
    .drawWithStyle()
  new StaveConnector(trebleStave, bassStave)
    .setType('singleLeft')
    .setStyle(connectorStyle)
    .setContext(context)
    .drawWithStyle()
  context.restore()
  drawFixedAttackSlots(context, trebleStave, bassStave, columns)
}

function diagnosticNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function FreePracticeStaffRenderer({
  columns,
  latestEventId,
  ariaLabel,
  onRenderReady
}: FreePracticeStaffRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const onRenderReadyRef = useRef(onRenderReady)
  const [fontReady, setFontReady] = useState(false)
  const [fontError, setFontError] = useState('')
  onRenderReadyRef.current = onRenderReady
  const columnsSignature = columns.map((column) => `${column.id}:${column.pitches.map((pitch) => [
    pitch.midiNumber,
    pitch.vexFlowKey,
    pitch.displayAccidental,
    pitch.clef
  ].join(':')).join(',')}`).join('|')

  useEffect(() => {
    let cancelled = false
    void ensureMusicNotationFont()
      .then(() => {
        if (!cancelled) setFontReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFontError(error instanceof Error ? error.message : '本地音乐字体加载失败。')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !fontReady) return
    drawFreePracticeStaff(container, columns)
    if (latestEventId > 0) onRenderReadyRef.current?.(latestEventId, diagnosticNow())
    return () => container.replaceChildren()
  }, [columnsSignature, fontReady, latestEventId, columns])

  const geometry = getFreePracticeStaffGeometrySnapshot()
  return (
    <div
      ref={containerRef}
      className="free-practice-staff-renderer"
      role="img"
      aria-label={ariaLabel}
      aria-busy={!fontReady && !fontError}
      data-view-box={geometry.viewBox}
      data-treble-y={geometry.trebleStaveY}
      data-bass-y={geometry.bassStaveY}
      data-staff-line-spacing={geometry.staffLineSpacing}
      data-slot-count={geometry.slotCount}
      data-notehead-scale={geometry.noteheadScale}
      data-clef-scale={geometry.clefScale}
    >
      {fontError ? <span className="music-staff-renderer__error" role="alert">{fontError}</span> : null}
    </div>
  )
}
