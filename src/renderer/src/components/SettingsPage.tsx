import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useEffect, useState } from 'react'
import { APP_LICENSES, APP_VERSION } from '../appInfo'
import { buildBackup, collectCurrentStorageState, exportBackupToFile, restoreFromBackup, validateBackup } from '../storage/backup'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { PIANO_AUDIO_MODE_LABELS, type PianoAudioMode } from '../audio/pianoAudioTypes'
import { useAiCoach } from '../hooks/useAiCoach'

interface SettingsPageProps {
  onOpenMidiTest: () => void
  pianoAudio: UsePianoAudioResult
}

const audioModeOptions: Array<{ mode: PianoAudioMode; description: string }> = [
  { mode: 'builtin', description: '训练器自身使用真实钢琴采样发声。' },
  { mode: 'silent', description: '只进行 MIDI 识别与训练，不在软件内发声。' }
]

export function SettingsPage({ onOpenMidiTest, pianoAudio }: SettingsPageProps): JSX.Element {
  const ai = useAiCoach()
  const [aiStatus, setAiStatus] = useState('')
  const [draftEndpoint, setDraftEndpoint] = useState(ai.settings.config.endpoint)
  const [draftModel, setDraftModel] = useState(ai.settings.config.model)
  const [draftApiKey, setDraftApiKey] = useState(ai.settings.config.apiKey)

  useEffect(() => {
    if (!draftApiKey && ai.settings.config.apiKey) setDraftApiKey(ai.settings.config.apiKey)
  }, [ai.settings.config.apiKey, draftApiKey])

  const persistAiSettings = async (next: typeof ai.settings): Promise<boolean> => {
    const result = await ai.setSettings(next)
    if (!result.success) {
      setAiStatus(`保存失败：${result.error ?? result.reason ?? '安全存储不可用'}`)
      return false
    }
    return true
  }

  return (
    <section className="settings-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">按需要调整</span>
          <h2>设置</h2>
          <p>常用的外观设置直接可见，其余选项只在需要时展开。</p>
        </div>
      </header>

      <div className="settings-content">
        <AppCard as="section" className="settings-card f2-theme-card">
          <div className="panel-title-row">
            <div>
              <h3>外观主题</h3>
              <p>主题切换会立即生效，不会中断 MIDI 输入或正在进行的练习。</p>
            </div>
          </div>
          <ThemeSwitcher />
        </AppCard>

        <details className="settings-card f2-settings-accordion">
          <summary>钢琴发声<small>音源方式、音量与试听</small></summary>
          <div className="f2-settings-accordion__body">
          <div className="settings-audio">
            <div className="settings-audio__row">
              <span>钢琴发声</span>
              <div className="settings-audio__mode-options">
                {audioModeOptions.map((option) => (
                  <button
                    key={option.mode}
                    className={pianoAudio.mode === option.mode ? 'is-active' : ''}
                    type="button"
                    onClick={() => pianoAudio.setMode(option.mode)}
                  >
                    <strong>{PIANO_AUDIO_MODE_LABELS[option.mode]}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-audio__row">
              <span>音量</span>
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
              当前状态：{pianoAudio.samplerStatus.message}
            </p>
            <div className="settings-audio__actions">
              <AppButton
                variant="secondary"
                disabled={pianoAudio.mode !== 'builtin'}
                onClick={() => void pianoAudio.testPlayChord()}
              >
                试听
              </AppButton>
              <AppButton variant="ghost" onClick={onOpenMidiTest}>MIDI 输入与测试</AppButton>
            </div>
          </div>
          </div>
        </details>

        <details className="settings-card f2-settings-accordion">
          <summary>练习助理<small>可选的补充建议；不影响基础练习功能</small></summary>
          <div className="f2-settings-accordion__body">
          <div className="settings-ai">
            <div className="tolerance-control"><span>启用 AI 教练</span><div className="segmented-control">
              <button className={ai.settings.enabled ? 'is-active' : ''} type="button" onClick={() => void persistAiSettings({ ...ai.settings, enabled: true })}>启用</button>
              <button className={!ai.settings.enabled ? 'is-active' : ''} type="button" onClick={() => void persistAiSettings({ ...ai.settings, enabled: false })}>停用</button>
            </div></div>
            <label className="midi-field"><span>接口地址</span>
              <input className="midi-select" type="url" value={draftEndpoint} placeholder="https://your-service.example/chat/completions" onChange={(event) => setDraftEndpoint(event.target.value)} />
            </label>
            <label className="midi-field"><span>模型名称</span>
              <input className="midi-select" type="text" value={draftModel} placeholder="deepseek-chat" onChange={(event) => setDraftModel(event.target.value)} />
            </label>
            <label className="midi-field"><span>访问密钥（仅保存在本机）</span>
              <input className="midi-select" type="password" value={draftApiKey} placeholder="sk-..." onChange={(event) => setDraftApiKey(event.target.value)} />
            </label>
            <div className="settings-audio__actions">
              <AppButton
                variant="secondary"
                onClick={() => {
                  void persistAiSettings({
                    ...ai.settings,
                    config: { ...ai.settings.config, endpoint: draftEndpoint, model: draftModel, apiKey: draftApiKey }
                  }).then((saved) => {
                    if (saved) setAiStatus('已保存（Key 使用系统加密存储）')
                  })
                }}
              >
                保存助理设置
              </AppButton>
              <AppButton
                variant="ghost"
                onClick={() => {
                  void persistAiSettings({
                    ...ai.settings,
                    config: { ...ai.settings.config, endpoint: draftEndpoint, model: draftModel, apiKey: draftApiKey }
                  }).then((saved) => {
                    if (saved) void ai.testConnection().then(setAiStatus)
                  })
                }}
              >
                测试连接
              </AppButton>
            </div>
            {aiStatus ? <p className="settings-audio__status">{aiStatus}</p> : null}
            <p className="settings-audio__status">未配置 AI 时，识谱、节奏、和弦、教材、曲谱、记录、统计与计划全部正常。</p>
          </div>
          </div>
        </details>

        <details className="settings-card f2-settings-accordion">
          <summary>备份与恢复<small>导出或恢复本机练习数据</small></summary>
          <div className="f2-settings-accordion__body">
          <p className="settings-audio__status">备份不会包含练习助理的访问密钥。</p>
          <div className="settings-audio__actions">
            <AppButton variant="secondary" onClick={() => exportBackupToFile(buildBackup(collectCurrentStorageState(), APP_VERSION))}>
              下载备份
            </AppButton>
            <input
              aria-label="恢复备份"
              className="score-practice-file"
              type="file"
              accept=".json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((text) => {
                  try {
                    const parsed = JSON.parse(text)
                    if (!validateBackup(parsed)) {
                      alert('备份结构无效，未修改任何现有数据')
                      return
                    }
                    const result = restoreFromBackup(parsed)
                    alert(result.message)
                  } catch {
                    alert('备份文件无法解析，未修改任何现有数据')
                  }
                })
              }}
            />
            <AppButton variant="ghost" onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[aria-label="恢复备份"]')
              input?.click()
            }}>恢复备份</AppButton>
          </div>
          </div>
        </details>

        <details className="settings-card f2-settings-accordion">
          <summary>关于<small>版本与第三方许可</small></summary>
          <div className="f2-settings-accordion__body">
          <p className="settings-audio__status">钢琴基本功训练器 · 版本 {APP_VERSION}</p>
          <ul className="settings-about-licenses">
            {APP_LICENSES.map((entry) => (
              <li key={entry.name}>{entry.name} {entry.version} · {entry.license} · {entry.usage}</li>
            ))}
          </ul>
          </div>
        </details>

      </div>
    </section>
  )
}
