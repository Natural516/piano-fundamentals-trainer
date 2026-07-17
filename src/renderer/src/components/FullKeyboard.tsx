import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ActiveMidiNote } from '../types'
import { getPianoKeyRange } from '../utils/midiNotes'

interface FullKeyboardProps {
  activeNotes: ActiveMidiNote[]
  correctNotes?: number[]
  targetNotes?: number[]
  wrongNotes?: number[]
}

const pianoKeys = getPianoKeyRange()
const whiteKeys = pianoKeys.filter((key) => !key.isBlack)
const blackKeys = pianoKeys
  .filter((key) => key.isBlack)
  .map((key) => ({
    ...key,
    whiteKeysBefore: pianoKeys
      .filter((candidate) => candidate.midiNumber < key.midiNumber && !candidate.isBlack).length
  }))

function shouldShowWhiteLabel(noteName: string, isActive: boolean): boolean {
  return isActive || noteName === 'A0' || noteName === 'C8' || noteName.startsWith('C')
}

function getKeyClassName({
  isActive,
  isCorrect,
  isTarget,
  isWrong,
  keyType
}: {
  isActive: boolean
  isCorrect: boolean
  isTarget: boolean
  isWrong: boolean
  keyType: 'black' | 'white'
}): string {
  return [
    keyType === 'white' ? 'full-white-key' : 'full-black-key',
    isTarget ? 'is-target' : '',
    isActive ? 'is-active' : '',
    isCorrect ? 'is-correct' : '',
    isWrong ? 'is-wrong' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export function FullKeyboard({
  activeNotes,
  correctNotes = [],
  targetNotes = [],
  wrongNotes = []
}: FullKeyboardProps): JSX.Element {
  const activeMidiNumbers = useMemo(
    () => new Set(activeNotes.map((note) => note.midiNumber)),
    [activeNotes]
  )
  const correctMidiNumbers = useMemo(() => new Set(correctNotes), [correctNotes])
  const targetMidiNumbers = useMemo(() => new Set(targetNotes), [targetNotes])
  const wrongMidiNumbers = useMemo(() => new Set(wrongNotes), [wrongNotes])

  return (
    <div className="full-keyboard-shell" aria-label="88 键虚拟钢琴键盘">
      <div className="keyboard-scroll">
        <div className="full-keyboard">
          <div className="full-keyboard__white">
            {whiteKeys.map((key) => {
              const isActive = activeMidiNumbers.has(key.midiNumber)
              const isCorrect = correctMidiNumbers.has(key.midiNumber)
              const isTarget = targetMidiNumbers.has(key.midiNumber)
              const isWrong = wrongMidiNumbers.has(key.midiNumber)

              return (
                <div
                  key={key.midiNumber}
                  className={getKeyClassName({ isActive, isCorrect, isTarget, isWrong, keyType: 'white' })}
                  title={`${key.noteName} / MIDI ${key.midiNumber}`}
                >
                  {shouldShowWhiteLabel(key.noteName, isActive || isTarget || isCorrect || isWrong) ? <span>{key.noteName}</span> : null}
                </div>
              )
            })}
          </div>

          <div className="full-keyboard__black" aria-hidden="true">
            {blackKeys.map((key) => {
              const isActive = activeMidiNumbers.has(key.midiNumber)
              const isCorrect = correctMidiNumbers.has(key.midiNumber)
              const isTarget = targetMidiNumbers.has(key.midiNumber)
              const isWrong = wrongMidiNumbers.has(key.midiNumber)
              const leftPercent = (key.whiteKeysBefore / whiteKeys.length) * 100
              const style = { '--key-left': `${leftPercent}%` } as CSSProperties

              return (
                <div
                  key={key.midiNumber}
                  className={getKeyClassName({ isActive, isCorrect, isTarget, isWrong, keyType: 'black' })}
                  style={style}
                  title={`${key.noteName} / MIDI ${key.midiNumber}`}
                >
                  {isActive || isTarget || isCorrect || isWrong ? <span>{key.noteName}</span> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
