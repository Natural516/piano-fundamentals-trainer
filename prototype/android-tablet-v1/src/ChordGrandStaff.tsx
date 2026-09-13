import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  TickContext,
  type ElementStyle
} from 'vexflow/bravura'
import { ensureMusicNotationFont } from '../../../src/renderer/src/utils/musicNotationFont'
import type {
  ChordClef,
  ChordGroupVisualState,
  ChordWrittenPitch
} from './chordPracticeMocks'

interface ChordGrandStaffProps {
  arpeggioState: ChordGroupVisualState
  blockState: ChordGroupVisualState
  pitches: readonly ChordWrittenPitch[]
  symbol: string
}

const MIN_RENDER_WIDTH = 760
const RENDER_HEIGHT = 344
const DRAWING_SCALE = 1.33
const STAFF_INK = '#171717'
const SECONDARY_INK = '#747b77'
const GROUP_CENTER_BOUNDARY_RATIO = 0.5
const GROUP_SEPARATION_RATIO = 0.13
const ARPEGGIO_LEFT_PADDING_RATIO = 0.12
const BLOCK_RIGHT_PADDING_RATIO = 0.08

function readThemeColor(element: HTMLElement, variable: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(variable).trim() || fallback
}

function colorForState(container: HTMLElement, state: ChordGroupVisualState): string {
  if (state === 'completed') return readThemeColor(container, '--success', '#2c7b58')
  if (state === 'wrong') return readThemeColor(container, '--danger', '#b34545')
  if (state === 'secondary') return SECONDARY_INK
  return STAFF_INK
}

function setContextColor(context: ReturnType<Renderer['getContext']>, color: string): void {
  context.setFillStyle(color)
  context.setStrokeStyle(color)
}

function drawStave(
  context: ReturnType<Renderer['getContext']>,
  stave: Stave
): void {
  const style = { fillStyle: STAFF_INK, strokeStyle: STAFF_INK }
  stave.setStyle(style)
  stave.getModifiers().forEach((modifier) => modifier.setStyle(style))
  context.save()
  setContextColor(context, STAFF_INK)
  stave.setContext(context).drawWithStyle()
  context.restore()
}

function drawConnector(
  context: ReturnType<Renderer['getContext']>,
  connector: StaveConnector
): void {
  const style = { fillStyle: STAFF_INK, strokeStyle: STAFF_INK }
  context.save()
  setContextColor(context, STAFF_INK)
  connector.setStyle(style).setContext(context).drawWithStyle()
  context.restore()
}

function createNote(
  pitches: readonly ChordWrittenPitch[],
  clef: ChordClef,
  style: ElementStyle
): StaveNote | null {
  if (pitches.length === 0) return null
  const note = new StaveNote({
    clef,
    duration: 'w',
    keys: pitches.map((pitch) => pitch.vexFlowKey)
  })
  pitches.forEach((pitch, index) => {
    if (pitch.accidental) {
      note.addModifier(new Accidental(pitch.accidental).setStyle(style), index)
    }
  })
  note.setStyle(style)
  note.setLedgerLineStyle({ fillStyle: style.fillStyle, strokeStyle: style.strokeStyle })
  return note
}

function drawAt(
  context: ReturnType<Renderer['getContext']>,
  stave: Stave,
  pitches: readonly ChordWrittenPitch[],
  clef: ChordClef,
  x: number,
  color: string
): void {
  const style = { fillStyle: color, strokeStyle: color }
  const note = createNote(pitches, clef, style)
  if (!note) return
  note.setContext(context).setStave(stave)
  new TickContext().addTickable(note).preFormat().setX(x)
  context.save()
  setContextColor(context, color)
  note.draw()
  context.restore()
}

function drawGrandStaff(
  container: HTMLDivElement,
  width: number,
  pitches: readonly ChordWrittenPitch[],
  blockState: ChordGroupVisualState,
  arpeggioState: ChordGroupVisualState
): void {
  container.replaceChildren()
  const renderWidth = Math.max(MIN_RENDER_WIDTH, width)
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(renderWidth, RENDER_HEIGHT)
  const context = renderer.getContext()
  context.scale(DRAWING_SCALE, DRAWING_SCALE)

  const logicalWidth = renderWidth / DRAWING_SCALE
  const staveX = 42
  const staveWidth = logicalWidth - 76
  const trebleStave = new Stave(staveX, 26, staveWidth).addClef('treble')
  const bassStave = new Stave(staveX, 128, staveWidth).addClef('bass')

  drawStave(context, trebleStave)
  drawStave(context, bassStave)
  drawConnector(context, new StaveConnector(trebleStave, bassStave).setType('brace'))
  drawConnector(context, new StaveConnector(trebleStave, bassStave).setType('singleLeft'))

  const blockColor = colorForState(container, blockState)
  const arpeggioColor = colorForState(container, arpeggioState)
  const centerOwnershipBoundary = staveX + staveWidth * GROUP_CENTER_BOUNDARY_RATIO
  const groupSeparation = staveWidth * GROUP_SEPARATION_RATIO
  const arpeggioStart = staveX + staveWidth * ARPEGGIO_LEFT_PADDING_RATIO
  const arpeggioEnd = centerOwnershipBoundary - groupSeparation
  const blockRegionStart = centerOwnershipBoundary + groupSeparation
  const blockRegionEnd = staveX + staveWidth * (1 - BLOCK_RIGHT_PADDING_RATIO)
  const blockX = (blockRegionStart + blockRegionEnd) / 2

  pitches.forEach((pitch, index) => {
    const denominator = Math.max(1, pitches.length - 1)
    const x = arpeggioStart + (arpeggioEnd - arpeggioStart) * index / denominator
    const stave = pitch.clef === 'treble' ? trebleStave : bassStave
    drawAt(context, stave, [pitch], pitch.clef, x, arpeggioColor)
  })

  drawAt(context, trebleStave, pitches.filter((pitch) => pitch.clef === 'treble'), 'treble', blockX, blockColor)
  drawAt(context, bassStave, pitches.filter((pitch) => pitch.clef === 'bass'), 'bass', blockX, blockColor)
}

export function ChordGrandStaff({
  arpeggioState,
  blockState,
  pitches,
  symbol
}: ChordGrandStaffProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fontReady, setFontReady] = useState(false)
  const [fontError, setFontError] = useState('')
  const pitchSignature = useMemo(
    () => pitches.map((pitch) => [
      pitch.spelling,
      pitch.soundingMidiNumber,
      pitch.vexFlowKey,
      pitch.accidental,
      pitch.clef
    ].join(':')).join('|'),
    [pitches]
  )

  useEffect(() => {
    let cancelled = false
    void ensureMusicNotationFont()
      .then(() => { if (!cancelled) setFontReady(true) })
      .catch((error: unknown) => {
        if (!cancelled) setFontError(error instanceof Error ? error.message : '本地音乐字体加载失败。')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !fontReady) return

    let frameId = 0
    const redraw = (): void => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        drawGrandStaff(container, container.clientWidth, pitches, blockState, arpeggioState)
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
  }, [arpeggioState, blockState, fontReady, pitchSignature, pitches])

  return (
    <div
      ref={containerRef}
      aria-busy={!fontReady && !fontError}
      aria-label={`${symbol}：左侧分解和弦，右侧柱式和弦`}
      className="chord-grand-staff"
      role="img"
    >
      {fontError ? <span className="music-staff-renderer__error" role="alert">{fontError}</span> : null}
    </div>
  )
}
