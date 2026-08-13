import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { ThemeSwitcher } from './ThemeSwitcher'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { PIANO_AUDIO_MODE_LABELS, type PianoAudioMode } from '../audio/pianoAudioTypes'

interface SettingsPageProps {
  onBackHome: () => void
  pianoAudio: UsePianoAudioResult
}

const audioModeOptions: PianoAudioMode[] = ['builtin', 'silent', 'external']

export function SettingsPage({ onBackHome, pianoAudio }: SettingsPageProps): JSX.Element {
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

        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div>
              <h3>音频 / 钢琴发声</h3>
              <p>选择钢琴发声方式；静音与外部软音源模式下判定与节拍器不受影响。</p>
            </div>
          </div>
          <div className="settings-audio">
            <div className="settings-audio__row">
              <span>钢琴发声</span>
              <div className="segmented-control">
                {audioModeOptions.map((option) => (
                  <button
                    key={option}
                    className={pianoAudio.mode === option ? 'is-active' : ''}
                    type="button"
                    onClick={() => pianoAudio.setMode(option)}
                  >
                    {PIANO_AUDIO_MODE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-audio__row">
              <span>钢琴音量</span>
              <div className="settings-audio__slider">
                <input
                  aria-label="钢琴音量"
                  type="range"
                  min="0"
                  max="100"
                  value={pianoAudio.pianoVolume}
                  onChange={(event) => pianoAudio.setPianoVolume(Number(event.target.value))}
                />
                <strong>{pianoAudio.pianoVolume}</strong>
              </div>
            </div>
            <p className="settings-audio__status">
              状态：{pianoAudio.samplerStatus.message}
              {pianoAudio.samplerStatus.sampleCount > 0
                ? `（${pianoAudio.samplerStatus.sampleCount} 个采样锚点）`
                : ' — 可放置 Salamander Grand Piano V2（CC BY 3.0）到 assets/samples/salamander 后自动加载'}
            </p>
            <div className="settings-audio__actions">
              <AppButton variant="secondary" onClick={() => void pianoAudio.testPlayChord()}>测试发声</AppButton>
            </div>
          </div>
        </AppCard>

      </div>
    </section>
  )
}
