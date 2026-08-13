import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  type ElementStyle
} from 'vexflow/bravura'
import { ensureMusicNotationFont } from '../utils/musicNotationFont'
import type {
  MusicNotationFeedback,
  MusicNotationPitch,
  MusicStaffClef,
  MusicStaffMode
} from '../utils/musicNotationTypes'
import { MUSIC_STAFF_LAYOUT, createMusicStaffRenderModel } from '../utils/musicStaffModel'
import type { MajorKeyId } from '../utils/musicKeySignatures'

interface MusicStaffRendererProps {
  staffMode: MusicStaffMode
  keySignature: MajorKeyId
  notes: readonly MusicNotationPitch[]
  feedback: MusicNotationFeedback
  ariaLabel: string
}

const MIN_RENDER_WIDTH = 420
const MUSIC_STAFF_INK_COLOR = '#171717'

function readThemeColor(element: HTMLElement, variable: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(variable).trim() || fallback
}

function createStaveNote(
  notes: readonly MusicNotationPitch[],
  clef: MusicStaffClef,
  style: ElementStyle
): StaveNote | null {
  if (notes.length === 0) return null

  const staveNote = new StaveNote({
    keys: notes.map((note) => note.vexFlowKey),
    duration: 'w',
    clef
  })

  notes.forEach((note, index) => {
    if (note.displayAccidental) {
      staveNote.addModifier(new Accidental(note.displayAccidental).setStyle(style), index)
    }
  })

  staveNote.setStyle(style)
  staveNote.setLedgerLineStyle({
    fillStyle: MUSIC_STAFF_INK_COLOR,
    strokeStyle: MUSIC_STAFF_INK_COLOR
  })
  return staveNote
}

function setContextColor(context: ReturnType<Renderer['getContext']>, color: string): void {
  context.setFillStyle(color)
  context.setStrokeStyle(color)
}

function drawStyledStave(
  context: ReturnType<Renderer['getContext']>,
  stave: Stave,
  lineColor: string,
  symbolColor: string
): void {
  const lineStyle = { fillStyle: lineColor, strokeStyle: lineColor }
  const symbolStyle = { fillStyle: symbolColor, strokeStyle: symbolColor }
  stave.setStyle(lineStyle)
  stave.getModifiers().forEach((modifier) => {
    modifier.setStyle(modifier.getCategory() === 'Barline' ? lineStyle : symbolStyle)
  })
  context.save()
  setContextColor(context, lineColor)
  stave.setContext(context).drawWithStyle()
  context.restore()
}

function drawStyledConnector(
  context: ReturnType<Renderer['getContext']>,
  connector: StaveConnector,
  color: string
): void {
  const style = { fillStyle: color, strokeStyle: color }
  context.save()
  setContextColor(context, color)
  connector.setStyle(style).setContext(context).drawWithStyle()
  context.restore()
}

function drawNote(
  context: ReturnType<Renderer['getContext']>,
  stave: Stave,
  pitches: readonly MusicNotationPitch[],
  clef: MusicStaffClef,
  color: string
): void {
  const style = { fillStyle: color, strokeStyle: color }
  const note = createStaveNote(pitches, clef, style)
  if (!note) return
  context.save()
  setContextColor(context, color)
  Formatter.FormatAndDraw(context, stave, [note])
  context.restore()
}

function drawMusicStaff(
  container: HTMLDivElement,
  width: number,
  staffMode: MusicStaffMode,
  keySignature: MajorKeyId,
  notes: readonly MusicNotationPitch[],
  feedback: MusicNotationFeedback
): void {
  container.replaceChildren()
  const height = staffMode === 'grand' ? MUSIC_STAFF_LAYOUT.grand.height : MUSIC_STAFF_LAYOUT.single.height
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(Math.max(MIN_RENDER_WIDTH, width), height)
  const context = renderer.getContext()
  const feedbackVariable = feedback === 'correct'
    ? '--success'
    : feedback === 'wrong_note'
      ? '--danger'
      : feedback === 'timeout'
        ? '--warning'
        : null
  const noteColor = feedbackVariable
    ? readThemeColor(container, feedbackVariable, MUSIC_STAFF_INK_COLOR)
    : MUSIC_STAFF_INK_COLOR
  const staveWidth = Math.max(MIN_RENDER_WIDTH, width) - 64
  const staveX = 42

  if (staffMode !== 'grand') {
    const stave = new Stave(staveX, MUSIC_STAFF_LAYOUT.single.staveY, staveWidth)
      .addClef(staffMode)
      .addKeySignature(keySignature)
    drawStyledStave(context, stave, MUSIC_STAFF_INK_COLOR, MUSIC_STAFF_INK_COLOR)
    drawNote(context, stave, notes, staffMode, noteColor)
    return
  }

  const trebleStave = new Stave(staveX, MUSIC_STAFF_LAYOUT.grand.trebleStaveY, staveWidth)
    .addClef('treble')
    .addKeySignature(keySignature)
  const bassStave = new Stave(staveX, MUSIC_STAFF_LAYOUT.grand.bassStaveY, staveWidth)
    .addClef('bass')
    .addKeySignature(keySignature)

  drawStyledStave(context, trebleStave, MUSIC_STAFF_INK_COLOR, MUSIC_STAFF_INK_COLOR)
  drawStyledStave(context, bassStave, MUSIC_STAFF_INK_COLOR, MUSIC_STAFF_INK_COLOR)

  drawStyledConnector(
    context,
    new StaveConnector(trebleStave, bassStave).setType('brace'),
    MUSIC_STAFF_INK_COLOR
  )
  drawStyledConnector(
    context,
    new StaveConnector(trebleStave, bassStave).setType('singleLeft'),
    MUSIC_STAFF_INK_COLOR
  )

  drawNote(context, trebleStave, notes.filter((note) => note.clef === 'treble'), 'treble', noteColor)
  drawNote(context, bassStave, notes.filter((note) => note.clef === 'bass'), 'bass', noteColor)
}

export function MusicStaffRenderer(props: MusicStaffRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fontReady, setFontReady] = useState(false)
  const [fontError, setFontError] = useState('')
  const notesSignature = props.notes.map((note) => [
    note.midiNumber,
    note.vexFlowKey,
    note.displayAccidental,
    note.clef
  ].join(':')).join('|')
  const model = useMemo(
    () => createMusicStaffRenderModel(props),
    [notesSignature, props.feedback, props.keySignature, props.staffMode]
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
        drawMusicStaff(
          container,
          container.clientWidth,
          model.staffMode,
          model.keySignature,
          model.notes,
          model.feedback
        )
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
  }, [fontReady, model])

  return (
    <div
      ref={containerRef}
      className={`music-staff-renderer is-${model.staffMode}`}
      role="img"
      aria-label={props.ariaLabel}
      aria-busy={!fontReady && !fontError}
    >
      {fontError ? <span className="music-staff-renderer__error" role="alert">{fontError}</span> : null}
    </div>
  )
}
