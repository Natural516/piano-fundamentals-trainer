import { AppButton } from './AppButton'

interface PracticeExitConfirmModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function PracticeExitConfirmModal({
  isOpen,
  onCancel,
  onConfirm
}: PracticeExitConfirmModalProps): JSX.Element | null {
  if (!isOpen) return null

  return (
    <div className="practice-exit-backdrop">
      <section
        className="practice-exit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="practice-exit-title"
        aria-describedby="practice-exit-description"
      >
        <h3 id="practice-exit-title">当前练习尚未完成，确定退出吗？</h3>
        <p id="practice-exit-description">本次未完成练习将不会保存。</p>
        <div>
          <AppButton variant="secondary" onClick={onCancel}>继续练习</AppButton>
          <AppButton onClick={onConfirm}>确认退出</AppButton>
        </div>
      </section>
    </div>
  )
}
