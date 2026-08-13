import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useState } from 'react'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { PIANO_AUDIO_MODE_LABELS, type PianoAudioMode } from '../audio/pianoAudioTypes'
import { useAiCoach } from '../hooks/useAiCoach'

interface SettingsPageProps {
  onBackHome: () => void
  pianoAudio: UsePianoAudioResult
}

const audioModeOptions: PianoAudioMode[] = ['builtin', 'silent', 'external']

export function SettingsPage({ onBackHome, pianoAudio }: SettingsPageProps): JSX.Element {
  const ai = useAiCoach()
  const [aiStatus, setAiStatus] = useState('')
  const [draftEndpoint, setDraftEndpoint] = useState(ai.settings.config.endpoint)
  const [draftModel, setDraftModel] = useState(ai.settings.config.model)
  const [draftApiKey, setDraftApiKey] = useState(ai.settings.config.apiKey)

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

        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div>
              <h3>AI 教练</h3>
              <p>OpenAI 兼容接口（支持 DeepSeek 等）。API Key 仅保存在本机，不写入日志与备份导出。</p>
            </div>
          </div>
          <div className="settings-ai">
            <div className="tolerance-control"><span>启用 AI 教练</span><div className="segmented-control">
              <button className={ai.settings.enabled ? 'is-active' : ''} type="button" onClick={() => ai.setSettings({ ...ai.settings, enabled: true })}>启用</button>
              <button className={!ai.settings.enabled ? 'is-active' : ''} type="button" onClick={() => ai.setSettings({ ...ai.settings, enabled: false })}>停用</button>
            </div></div>
            <label className="midi-field"><span>Endpoint</span>
              <input className="midi-select" type="url" value={draftEndpoint} placeholder="https://api.deepseek.com/v1/chat/completions" onChange={(event) => setDraftEndpoint(event.target.value)} />
            </label>
            <label className="midi-field"><span>Model</span>
              <input className="midi-select" type="text" value={draftModel} placeholder="deepseek-chat" onChange={(event) => setDraftModel(event.target.value)} />
            </label>
            <label className="midi-field"><span>API Key（仅本机保存）</span>
              <input className="midi-select" type="password" value={draftApiKey} placeholder="sk-..." onChange={(event) => setDraftApiKey(event.target.value)} />
            </label>
            <div className="settings-audio__actions">
              <AppButton
                variant="secondary"
                onClick={() => {
                  ai.setSettings({
                    ...ai.settings,
                    config: { ...ai.settings.config, endpoint: draftEndpoint, model: draftModel, apiKey: draftApiKey }
                  })
                  setAiStatus('已保存（Key 仅存本机）')
                }}
              >
                保存 AI 设置
              </AppButton>
              <AppButton
                variant="ghost"
                onClick={() => {
                  ai.setSettings({
                    ...ai.settings,
                    config: { ...ai.settings.config, endpoint: draftEndpoint, model: draftModel, apiKey: draftApiKey }
                  })
                  void ai.testConnection().then(setAiStatus)
                }}
              >
                测试连接
              </AppButton>
            </div>
            {aiStatus ? <p className="settings-audio__status">{aiStatus}</p> : null}
            <p className="settings-audio__status">未配置 AI 时，识谱、节奏、和弦、教材、曲谱、记录、统计与计划全部正常。</p>
          </div>
        </AppCard>

      </div>
    </section>
  )
}
