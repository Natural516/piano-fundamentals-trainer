import type { SightReadingResult } from '../hooks/useSightReadingPractice'
import {
  STAFF_MODE_LABELS,
  type SightReadingNote,
  type SightReadingStaffMode
} from '../utils/sightReadingNotes'
import { getStaffBottomLinePosition } from '../utils/staffPosition'

interface SightReadingStaffProps {
  feedback: SightReadingResult
  note: SightReadingNote | null
  showNoteName: boolean
  staffMode: SightReadingStaffMode
}

interface StaffGeometry {
  bottomLineY: number
  lineYs: number[]
  stepHeight: number
  topLineY: number
}

const singleStaffGeometry: StaffGeometry = {
  lineYs: [54, 68, 82, 96, 110],
  topLineY: 54,
  bottomLineY: 110,
  stepHeight: 7
}

const grandStaffGeometry: Record<SightReadingNote['clef'], StaffGeometry> = {
  treble: {
    lineYs: [34, 48, 62, 76, 90],
    topLineY: 34,
    bottomLineY: 90,
    stepHeight: 7
  },
  bass: {
    lineYs: [118, 132, 146, 160, 174],
    topLineY: 118,
    bottomLineY: 174,
    stepHeight: 7
  }
}

function getNoteY(note: SightReadingNote, geometry: StaffGeometry): number {
  return geometry.bottomLineY -
    (note.staffPosition - getStaffBottomLinePosition(note.clef)) * geometry.stepHeight
}

function getLedgerLineYs(noteY: number, geometry: StaffGeometry): number[] {
  const ledgerLines: number[] = []

  if (noteY > geometry.bottomLineY) {
    for (
      let y = geometry.bottomLineY + geometry.stepHeight * 2;
      y <= noteY + 1;
      y += geometry.stepHeight * 2
    ) {
      ledgerLines.push(y)
    }
  }

  if (noteY < geometry.topLineY) {
    for (
      let y = geometry.topLineY - geometry.stepHeight * 2;
      y >= noteY - 1;
      y -= geometry.stepHeight * 2
    ) {
      ledgerLines.push(y)
    }
  }

  return ledgerLines
}

function ClefGlyph({ clef, grand }: { clef: SightReadingNote['clef']; grand: boolean }): JSX.Element {
  if (clef === 'bass') {
    return (
      <text
        className="sight-clef-glyph sight-bass-clef-glyph"
        x={grand ? 74 : 76}
        y={grand ? 169 : 110}
        aria-hidden="true"
      >
        𝄢
      </text>
    )
  }

  return (
    <text
      className="sight-clef-glyph sight-treble-clef"
      x={grand ? 72 : 72}
      y={grand ? 111 : 142}
      aria-hidden="true"
    >
      𝄞
    </text>
  )
}

function StaffLines({ geometry }: { geometry: StaffGeometry }): JSX.Element {
  return (
    <g className="sight-staff-lines">
      {geometry.lineYs.map((y) => <line key={y} x1="64" y1={y} x2="468" y2={y} />)}
    </g>
  )
}

function NoteMark({ geometry, note }: { geometry: StaffGeometry; note: SightReadingNote }): JSX.Element {
  const noteY = getNoteY(note, geometry)
  const ledgerLines = getLedgerLineYs(noteY, geometry)

  return (
    <>
      {ledgerLines.map((y) => (
        <line key={y} className="sight-ledger" x1="278" y1={y} x2="336" y2={y} />
      ))}
      <g className="sight-note">
        <ellipse cx="307" cy={noteY} rx="17" ry="11" transform={`rotate(-18 307 ${noteY})`} />
        <line x1="323" y1={noteY - 3} x2="323" y2={noteY - 55} />
      </g>
    </>
  )
}

export function SightReadingStaff({
  feedback,
  note,
  showNoteName,
  staffMode
}: SightReadingStaffProps): JSX.Element {
  const isGrandStaff = staffMode === 'grand'
  const geometry = note
    ? (isGrandStaff ? grandStaffGeometry[note.clef] : singleStaffGeometry)
    : singleStaffGeometry
  const feedbackClass = feedback ? `has-${feedback}` : ''

  return (
    <div className={`sight-staff-card ${isGrandStaff ? 'is-grand-staff' : ''} ${feedbackClass}`} aria-label={STAFF_MODE_LABELS[staffMode]}>
      <svg
        className="sight-staff"
        viewBox={isGrandStaff ? '0 0 520 218' : '0 0 520 210'}
        role="img"
      >
        <title>{note ? `${STAFF_MODE_LABELS[staffMode]} ${note.noteName}` : '识谱练习'}</title>

        {isGrandStaff ? (
          <>
            <StaffLines geometry={grandStaffGeometry.treble} />
            <StaffLines geometry={grandStaffGeometry.bass} />
            <g className="sight-grand-staff-connector" aria-hidden="true">
              <line x1="64" y1="34" x2="64" y2="174" />
              <line x1="64" y1="34" x2="76" y2="34" />
              <line x1="64" y1="174" x2="76" y2="174" />
            </g>
            <ClefGlyph clef="treble" grand />
            <ClefGlyph clef="bass" grand />
          </>
        ) : (
          <>
            <StaffLines geometry={singleStaffGeometry} />
            <ClefGlyph clef={staffMode} grand={false} />
          </>
        )}

        {note ? (
          <NoteMark geometry={geometry} note={note} />
        ) : (
          <text className="sight-staff-placeholder" x="290" y={isGrandStaff ? 106 : 88} textAnchor="middle">
            点击开始练习
          </text>
        )}
      </svg>

      {showNoteName && note ? (
        <div className="sight-note-name">
          <span>{STAFF_MODE_LABELS[staffMode]}</span>
          <strong>{note.noteName}</strong>
        </div>
      ) : null}
    </div>
  )
}
