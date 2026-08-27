import { useMemo, type CSSProperties } from 'react'
import {
  createVirtualPianoLayout,
  type VirtualPianoRange
} from '../utils/virtualPianoLayout'

export type VirtualPianoLabelMode = 'none' | 'octaves' | 'active' | 'all'

export interface VirtualPianoKeyboardProps {
  pressedNotes: readonly number[]
  targetNotes?: readonly number[]
  correctNotes?: readonly number[]
  wrongNotes?: readonly number[]
  disabled?: boolean
  range?: VirtualPianoRange
  labels?: VirtualPianoLabelMode
  fitToWidth?: boolean
  ariaLabel?: string
}

function getKeyClassName({
  isPressed,
  isCorrect,
  isTarget,
  isWrong,
  keyType
}: {
  isPressed: boolean
  isCorrect: boolean
  isTarget: boolean
  isWrong: boolean
  keyType: 'black' | 'white'
}): string {
  return [
    keyType === 'white' ? 'full-white-key' : 'full-black-key',
    isTarget ? 'is-target' : '',
    isPressed ? 'is-active' : '',
    isCorrect ? 'is-correct' : '',
    isWrong ? 'is-wrong' : ''
  ].filter(Boolean).join(' ')
}

function shouldShowLabel(
  labelMode: VirtualPianoLabelMode,
  noteName: string,
  isEmphasized: boolean
): boolean {
  if (labelMode === 'all') return true
  if (labelMode === 'active') return isEmphasized
  if (labelMode === 'octaves') {
    return isEmphasized || noteName === 'A0' || noteName === 'C8' || noteName.startsWith('C')
  }
  return false
}

export function VirtualPianoKeyboard({
  pressedNotes,
  targetNotes = [],
  correctNotes = [],
  wrongNotes = [],
  disabled = false,
  range = [21, 108],
  labels = 'octaves',
  fitToWidth = false,
  ariaLabel = '88 键虚拟钢琴键盘'
}: VirtualPianoKeyboardProps): JSX.Element {
  const layout = useMemo(() => createVirtualPianoLayout(range), [range[0], range[1]])
  const pressedMidiNumbers = useMemo(() => new Set(pressedNotes), [pressedNotes])
  const targetMidiNumbers = useMemo(() => new Set(targetNotes), [targetNotes])
  const correctMidiNumbers = useMemo(() => new Set(correctNotes), [correctNotes])
  const wrongMidiNumbers = useMemo(() => new Set(wrongNotes), [wrongNotes])

  const renderKeyState = (midiNumber: number): {
    isPressed: boolean
    isCorrect: boolean
    isTarget: boolean
    isWrong: boolean
  } => ({
    isPressed: !disabled && pressedMidiNumbers.has(midiNumber),
    isCorrect: correctMidiNumbers.has(midiNumber),
    isTarget: targetMidiNumbers.has(midiNumber),
    isWrong: wrongMidiNumbers.has(midiNumber)
  })

  return (
    <div
      className={`full-keyboard-shell virtual-piano-keyboard${fitToWidth ? ' is-fit-to-width' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      data-start-midi={layout.range[0]}
      data-end-midi={layout.range[1]}
    >
      <div className="keyboard-scroll">
        <div className="full-keyboard">
          <div className="full-keyboard__white">
            {layout.whiteKeys.map((key) => {
              const state = renderKeyState(key.midiNumber)
              const emphasized = state.isPressed || state.isTarget || state.isCorrect || state.isWrong
              return (
                <div
                  key={key.midiNumber}
                  className={getKeyClassName({ ...state, keyType: 'white' })}
                  data-midi-number={key.midiNumber}
                  title={`${key.noteName} / MIDI ${key.midiNumber}`}
                >
                  {shouldShowLabel(labels, key.noteName, emphasized) ? <span>{key.noteName}</span> : null}
                </div>
              )
            })}
          </div>

          <div className="full-keyboard__black" aria-hidden="true">
            {layout.blackKeys.map((key) => {
              const state = renderKeyState(key.midiNumber)
              const emphasized = state.isPressed || state.isTarget || state.isCorrect || state.isWrong
              const style = { '--key-left': `${key.leftPercent}%` } as CSSProperties
              return (
                <div
                  key={key.midiNumber}
                  className={getKeyClassName({ ...state, keyType: 'black' })}
                  data-midi-number={key.midiNumber}
                  style={style}
                  title={`${key.noteName} / MIDI ${key.midiNumber}`}
                >
                  {shouldShowLabel(labels, key.noteName, emphasized) ? <span>{key.noteName}</span> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
