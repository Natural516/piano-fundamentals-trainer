import { useMemo } from 'react'
import type { SightReadingResult } from '../hooks/useSightReadingPractice'
import type { MajorKeyId } from '../utils/musicKeySignatures'
import {
  STAFF_MODE_LABELS,
  type SightReadingNote,
  type SightReadingStaffMode
} from '../utils/sightReadingNotes'
import { MusicStaffRenderer } from './MusicStaffRenderer'

interface SightReadingStaffProps {
  feedback: SightReadingResult
  keySignature: MajorKeyId
  note: SightReadingNote | null
  showNoteName: boolean
  staffMode: SightReadingStaffMode
}

export function SightReadingStaff({
  feedback,
  keySignature,
  note,
  showNoteName,
  staffMode
}: SightReadingStaffProps): JSX.Element {
  const feedbackClass = feedback ? `has-${feedback}` : ''
  const title = note
    ? `${STAFF_MODE_LABELS[staffMode]} ${note.noteName}`
    : `${STAFF_MODE_LABELS[staffMode]}识谱练习`
  const notationNotes = useMemo(() => note ? [note.notation] : [], [note])

  return (
    <div className={`sight-staff-card ${staffMode === 'grand' ? 'is-grand-staff' : ''} ${feedbackClass}`}>
      <MusicStaffRenderer
        ariaLabel={title}
        feedback={feedback}
        keySignature={keySignature}
        notes={notationNotes}
        staffMode={staffMode}
      />

      {showNoteName && note ? (
        <div className="sight-note-name">
          <span>{STAFF_MODE_LABELS[staffMode]}</span>
          <strong>{note.noteName}</strong>
        </div>
      ) : null}
    </div>
  )
}
