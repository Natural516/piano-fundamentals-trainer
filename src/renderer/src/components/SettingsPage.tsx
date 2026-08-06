import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { ThemeSwitcher } from './ThemeSwitcher'

interface SettingsPageProps {
  onBackHome: () => void
}

export function SettingsPage({ onBackHome }: SettingsPageProps): JSX.Element {
  return (
    <section className="settings-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">Preferences</span>
          <h2>设置</h2>
          <p>调整钢琴基本功训练器的本地显示偏好。</p>
        </div>
        <AppButton className="ghost-button" variant="ghost" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="settings-content">
        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div>
              <h3>外观 / 主题</h3>
              <p>主题切换会立即生效，不会中断 MIDI 输入或正在进行的练习。</p>
            </div>
          </div>
          <ThemeSwitcher />
        </AppCard>

      </div>
    </section>
  )
}
