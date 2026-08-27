import type { ActiveMidiNote } from '../types'
import { VirtualPianoKeyboard } from './VirtualPianoKeyboard'

interface FullKeyboardProps {
  activeNotes: ActiveMidiNote[]
  correctNotes?: number[]
  targetNotes?: number[]
  wrongNotes?: number[]
}

export function FullKeyboard({
  activeNotes,
  correctNotes = [],
  targetNotes = [],
  wrongNotes = []
}: FullKeyboardProps): JSX.Element {
  return (
    <VirtualPianoKeyboard
      pressedNotes={activeNotes.map((note) => note.midiNumber)}
      correctNotes={correctNotes}
      targetNotes={targetNotes}
      wrongNotes={wrongNotes}
      labels="octaves"
    />
  )
}
