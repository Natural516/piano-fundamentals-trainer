import type { ActiveMidiNote } from '../types'

interface MiniKeyboardProps {
  activeNotes: ActiveMidiNote[]
  targetNotes: number[]
  correctNotes?: number[]
  wrongNotes?: number[]
}

const MINI_KEYBOARD_LOWEST = 48
const MINI_KEYBOARD_HIGHEST = 84
const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

export function MiniKeyboard({
  activeNotes,
  targetNotes,
  correctNotes = [],
  wrongNotes = []
}: MiniKeyboardProps): JSX.Element {
  const activeSet = new Set(activeNotes.map((note) => note.midiNumber))
  const targetSet = new Set(targetNotes)
  const correctSet = new Set(correctNotes)
  const wrongSet = new Set(wrongNotes)
  const keys: number[] = []

  for (let midiNumber = MINI_KEYBOARD_LOWEST; midiNumber <= MINI_KEYBOARD_HIGHEST; midiNumber += 1) {
    keys.push(midiNumber)
  }

  return (
    <div className="mini-keyboard" aria-label="局部钢琴键盘" role="img">
      <div className="mini-keyboard__whites">
        {keys
          .filter((midiNumber) => !BLACK_KEY_PITCH_CLASSES.has(midiNumber % 12))
          .map((midiNumber) => {
            const classes = [
              'mini-key',
              'mini-key--white',
              activeSet.has(midiNumber) ? 'is-active' : '',
              targetSet.has(midiNumber) ? 'is-target' : '',
              correctSet.has(midiNumber) ? 'is-correct' : '',
              wrongSet.has(midiNumber) ? 'is-wrong' : ''
            ].filter(Boolean).join(' ')
            return <span key={midiNumber} className={classes} />
          })}
      </div>
      <div className="mini-keyboard__blacks">
        {keys
          .filter((midiNumber) => BLACK_KEY_PITCH_CLASSES.has(midiNumber % 12))
          .map((midiNumber) => {
            const classes = [
              'mini-key',
              'mini-key--black',
              activeSet.has(midiNumber) ? 'is-active' : '',
              targetSet.has(midiNumber) ? 'is-target' : '',
              correctSet.has(midiNumber) ? 'is-correct' : '',
              wrongSet.has(midiNumber) ? 'is-wrong' : ''
            ].filter(Boolean).join(' ')
            return <span key={midiNumber} className={classes} />
          })}
      </div>
    </div>
  )
}
