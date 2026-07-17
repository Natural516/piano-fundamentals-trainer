import type { CoordinationPattern, CoordinationStepResult } from '../utils/coordinationTypes'

interface CoordinationGridViewProps {
  pattern: CoordinationPattern
  currentPosition: number
  results: CoordinationStepResult[]
}

function getCellClassName(
  result: CoordinationStepResult | undefined,
  isCurrent: boolean,
  isRest: boolean
): string {
  return [
    'coordination-grid-cell',
    isCurrent ? 'is-current' : '',
    isRest ? 'is-rest' : '',
    result ? `result-${result.type}` : '',
    result?.syncWarning ? 'has-sync-warning' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function formatNotes(noteNames: string[]): string {
  return noteNames.length > 0 ? noteNames.join(' + ') : '休'
}

export function CoordinationGridView({
  pattern,
  currentPosition,
  results
}: CoordinationGridViewProps): JSX.Element {
  const resultByPosition = new Map(results.map((result) => [result.position, result]))

  return (
    <div className="coordination-grid-view">
      <div className="coordination-grid-row coordination-label-row">
        <span className="coordination-row-heading">格位</span>
        {pattern.steps.map((step) => (
          <span key={`label-${step.position}`}>{step.label}</span>
        ))}
      </div>

      <div className="coordination-grid-row">
        <strong className="coordination-row-heading">左手</strong>
        {pattern.steps.map((step) => {
          const result = resultByPosition.get(step.position)
          return (
            <span
              key={`left-${step.position}`}
              className={getCellClassName(result, currentPosition === step.position, step.leftNotes.length === 0)}
              title={result?.message}
            >
              {formatNotes(step.leftNoteNames)}
            </span>
          )
        })}
      </div>

      <div className="coordination-grid-row">
        <strong className="coordination-row-heading">右手</strong>
        {pattern.steps.map((step) => {
          const result = resultByPosition.get(step.position)
          return (
            <span
              key={`right-${step.position}`}
              className={getCellClassName(result, currentPosition === step.position, step.rightNotes.length === 0)}
              title={result?.message}
            >
              {formatNotes(step.rightNoteNames)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

