import type { ReactNode } from 'react'

interface PracticeFeedbackNoticeProps {
  detail?: ReactNode
  label: string
  resultType: string
  title: string
}

export function PracticeFeedbackNotice({
  detail,
  label,
  resultType,
  title
}: PracticeFeedbackNoticeProps): JSX.Element {
  return (
    <div className={`practice-feedback-notice result-${resultType}`} role="status" aria-live="polite">
      <span>{label}</span>
      <strong>{title}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}
