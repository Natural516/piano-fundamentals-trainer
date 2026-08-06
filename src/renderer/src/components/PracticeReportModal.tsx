import type { ReactNode } from 'react'

interface PracticeReportModalProps {
  children: ReactNode
  title: string
}

export function PracticeReportModal({ children, title }: PracticeReportModalProps): JSX.Element {
  return (
    <div className="practice-report-backdrop">
      <section className="practice-report-modal" role="dialog" aria-modal="true" aria-labelledby="practice-report-title">
        <header className="practice-report-modal__header">
          <span>Practice Report</span>
          <h3 id="practice-report-title">{title}</h3>
        </header>
        <div className="practice-report-modal__body">{children}</div>
      </section>
    </div>
  )
}
