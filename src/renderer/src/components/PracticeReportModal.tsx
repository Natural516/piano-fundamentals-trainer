import type { ReactNode } from 'react'
import { AppButton } from './AppButton'

interface PracticeReportModalProps {
  children: ReactNode
  title: string
  onBack?: () => void
  onRepeat?: () => void
  primaryAction?: 'repeat' | 'back'
  backLabel?: string
  repeatLabel?: string
}

export function PracticeReportModal({
  children,
  title,
  onBack,
  onRepeat,
  primaryAction = 'repeat',
  backLabel = '完成',
  repeatLabel = '再练一次'
}: PracticeReportModalProps): JSX.Element {
  return (
    <div className="practice-report-backdrop">
      <section className="practice-report-modal" role="dialog" aria-modal="true" aria-labelledby="practice-report-title">
        <header className="practice-report-modal__header">
          <div>
            <span>本轮回顾</span>
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
            {primaryAction === 'back' ? (
              <>
                {onRepeat ? <AppButton variant="secondary" onClick={onRepeat}>{repeatLabel}</AppButton> : null}
                {onBack ? <AppButton onClick={onBack}>{backLabel}</AppButton> : null}
              </>
            ) : (
              <>
                {onRepeat ? <AppButton onClick={onRepeat}>{repeatLabel}</AppButton> : null}
                {onBack ? <AppButton variant="secondary" onClick={onBack}>{backLabel}</AppButton> : null}
              </>
            )}
          </footer>
        ) : null}
      </section>
    </div>
  )
}
