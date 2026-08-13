import type { ReactNode } from 'react'
import { AppButton } from './AppButton'

interface PracticeReportModalProps {
  children: ReactNode
  title: string
  onBack?: () => void
  onRepeat?: () => void
}

export function PracticeReportModal({
  children,
  title,
  onBack,
  onRepeat
}: PracticeReportModalProps): JSX.Element {
  return (
    <div className="practice-report-backdrop">
      <section className="practice-report-modal" role="dialog" aria-modal="true" aria-labelledby="practice-report-title">
        <header className="practice-report-modal__header">
          <div>
            <span>Practice Report</span>
            <h3 id="practice-report-title">{title}</h3>
          </div>
          {onBack ? (
            <button
              className="practice-drawer-close"
              type="button"
              aria-label="关闭报告"
              title="关闭"
              onClick={onBack}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="practice-report-modal__body">{children}</div>
        {onBack || onRepeat ? (
          <footer className="practice-report-actions">
            {onRepeat ? <AppButton onClick={onRepeat}>再练一次</AppButton> : null}
            {onBack ? <AppButton variant="secondary" onClick={onBack}>返回</AppButton> : null}
          </footer>
        ) : null}
      </section>
    </div>
  )
}
