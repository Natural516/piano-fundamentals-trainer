import { useEffect, useRef, type ReactNode } from 'react'
import { AppButton } from './AppButton'

interface PracticeSettingsDrawerProps {
  children: ReactNode
  isOpen: boolean
  isLocked?: boolean
  onClose: () => void
  onSave: () => void
  title?: string
}

export function PracticeSettingsDrawer({
  children,
  isOpen,
  isLocked = false,
  onClose,
  onSave,
  title = '练习设置'
}: PracticeSettingsDrawerProps): JSX.Element | null {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="practice-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <aside className="practice-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="practice-settings-title">
        <header className="practice-settings-drawer__header">
          <div>
            <span>Practice Settings</span>
            <h3 id="practice-settings-title">{title}</h3>
          </div>
          <button
            ref={closeButtonRef}
            className="practice-drawer-close"
            type="button"
            aria-label="关闭练习设置"
            title="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {isLocked ? <p className="practice-settings-locked">请结束当前练习后修改设置。</p> : null}

        <div className="practice-settings-drawer__body">{children}</div>

        <footer className="practice-settings-drawer__footer">
          <AppButton variant="secondary" onClick={onClose}>取消</AppButton>
          <AppButton disabled={isLocked} onClick={onSave}>保存设置</AppButton>
        </footer>
      </aside>
    </div>
  )
}
