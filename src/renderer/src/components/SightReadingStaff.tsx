import type { SightReadingNote } from '../utils/sightReadingNotes'
import { CLEF_LABELS } from '../utils/sightReadingNotes'
import { getStaffBottomLinePosition } from '../utils/staffPosition'

interface SightReadingStaffProps {
  note: SightReadingNote | null
  showNoteName: boolean
}

const staffLineY = [44, 60, 76, 92, 108]
const topLineY = 44
const bottomLineY = 108
const stepHeight = 8

function getNoteY(note: SightReadingNote): number {
  return bottomLineY - (note.staffPosition - getStaffBottomLinePosition(note.clef)) * stepHeight
}

function getLedgerLineYs(noteY: number): number[] {
  const ledgerLines: number[] = []

  if (noteY > bottomLineY) {
    for (let y = bottomLineY + stepHeight * 2; y <= noteY + 1; y += stepHeight * 2) {
      ledgerLines.push(y)
    }
  }

  if (noteY < topLineY) {
    for (let y = topLineY - stepHeight * 2; y >= noteY - 1; y -= stepHeight * 2) {
      ledgerLines.push(y)
    }
  }

  return ledgerLines
}

function ClefMark({ clef }: { clef: SightReadingNote['clef'] }): JSX.Element {
  if (clef === 'bass') {
    return (
      <g className="sight-bass-clef" aria-hidden="true">
        <path d="M145 58c20 6 20 34 1 49-13 10-29 15-48 17" />
        <circle cx="124" cy="58" r="10" />
        <circle cx="162" cy="68" r="4" />
        <circle cx="162" cy="90" r="4" />
      </g>
    )
  }

  return (
    <g className="sight-clef" aria-hidden="true">
      <path d="M126 121c-20-8-24-35-5-47 17-11 40 1 37 23-2 21-30 28-44 12" />
      <path d="M145 124c-14-24-11-48 8-76 10-16 9-31-1-40-11 16-14 36-8 61 6 24 16 45 16 63 0 18-15 30-34 25" />
      <circle cx="142" cy="94" r="5" />
    </g>
  )
}

export function SightReadingStaff({ note, showNoteName }: SightReadingStaffProps): JSX.Element {
  const noteY = note ? getNoteY(note) : null
  const ledgerLineYs = noteY !== null ? getLedgerLineYs(noteY) : []

  return (
    <div className="sight-staff-card" aria-label="单谱号五线谱">
      <svg className="sight-staff" viewBox="0 0 520 180" role="img">
        <title>{note ? `${CLEF_LABELS[note.clef]} ${note.noteName}` : '识谱练习'}</title>
        <g className="sight-staff-lines">
          {staffLineY.map((y) => (
            <line key={y} x1="82" y1={y} x2="462" y2={y} />
          ))}
        </g>

        <ClefMark clef={note?.clef ?? 'treble'} />

        {ledgerLineYs.map((y) => (
          <line key={y} className="sight-ledger" x1="264" y1={y} x2="318" y2={y} />
        ))}

        {noteY !== null ? (
          <g className="sight-note">
            <ellipse cx="292" cy={noteY} rx="18" ry="12" transform={`rotate(-18 292 ${noteY})`} />
            <line x1="309" y1={noteY - 3} x2="309" y2={noteY - 64} />
          </g>
        ) : (
          <text className="sight-staff-placeholder" x="260" y="92" textAnchor="middle">
            点击开始练习
          </text>
        )}
      </svg>

      {showNoteName && note ? (
        <div className="sight-note-name">
          <span>{CLEF_LABELS[note.clef]}</span>
          <strong>{note.noteName}</strong>
        </div>
      ) : null}
    </div>
  )
}
