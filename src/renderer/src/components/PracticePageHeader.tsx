import type { ReactNode } from 'react'
import { SettingsIcon } from './SettingsIcon'

interface PracticePageHeaderProps {
  eyebrow: string
  onOpenSettings: () => void
  controls?: ReactNode
  summary: string
  title: string
}

export function PracticePageHeader({
  eyebrow,
  controls,
  onOpenSettings,
  summary,
  title
}: PracticePageHeaderProps): JSX.Element {
  return (
    <header className="midi-page-header practice-page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p className="practice-settings-summary">{summary}</p>
      </div>
      <div className="practice-page-header__actions">
        {controls}
        <button
          className="practice-settings-trigger"
          type="button"
          aria-label="练习设置"
          title="练习设置"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  )
}
