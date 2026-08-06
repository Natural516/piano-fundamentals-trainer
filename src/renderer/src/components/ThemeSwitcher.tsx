import { useThemeContext } from '../contexts/ThemeContext'
import type { ThemeMode } from '../utils/themeTypes'

interface ThemeOption {
  mode: ThemeMode
  label: string
  description: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { mode: 'dark', label: '深色', description: '适合暗光环境。' },
  { mode: 'light', label: '浅色', description: '白色主界面，适合明亮环境。' },
  { mode: 'system', label: '跟随系统', description: '自动跟随 Windows 外观设置。' }
]

export function ThemeSwitcher(): JSX.Element {
  const { mode, resolvedTheme, setMode } = useThemeContext()

  return (
    <div className="theme-switcher">
      <div className="theme-option-grid" role="radiogroup" aria-label="主题模式">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.mode}
            className={`theme-option ${mode === option.mode ? 'is-active' : ''}`}
            type="button"
            role="radio"
            aria-checked={mode === option.mode}
            onClick={() => setMode(option.mode)}
          >
            <span className={`theme-option-preview theme-option-preview-${option.mode}`} aria-hidden="true">
              <i />
              <i />
            </span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      <p className="theme-current-state" aria-live="polite">
        当前显示：{resolvedTheme === 'dark' ? '深色主题' : '浅色主题'}
        {mode === 'system' ? '（跟随系统）' : ''}
      </p>
    </div>
  )
}
