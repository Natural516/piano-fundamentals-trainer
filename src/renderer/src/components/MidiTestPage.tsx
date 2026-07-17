import { useState } from 'react'
import type { UseAudioEngineResult } from '../hooks/useAudioEngine'
import type { UseMidiResult } from '../hooks/useMidi'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'

interface MidiTestPageProps {
  midi: UseMidiResult
  audioEngine: UseAudioEngineResult
  onBackHome: () => void
}

function formatEventTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

function ActiveNoteCard({ note }: { note: ActiveMidiNote }): JSX.Element {
  return (
    <article className="active-note-card">
      <strong>{note.noteName}</strong>
      <span>MIDI {note.midiNumber}</span>
      <span>velocity {note.velocity}</span>
    </article>
  )
}


function getAudioStatusLabel(status: UseAudioEngineResult['audioStatus']): string {
  const labels: Record<UseAudioEngineResult['audioStatus'], string> = {
    idle: '未启动',
    ready: '已就绪',
    suspended: '已暂停',
    unsupported: '不支持',
    error: '启动失败'
  }

  return labels[status]
}

function AudioMonitoringCard({ audioEngine }: { audioEngine: UseAudioEngineResult }): JSX.Element {
  return (
    <section className="midi-panel audio-monitor-panel">
      <div className="panel-title-row">
        <div>
          <h3>{'音频监听'}</h3>
          <p>{'本地监听只影响软件发声，不影响 MIDI 输入和日志'}</p>
        </div>
        <span className={`audio-status-badge status-${audioEngine.audioStatus}`}>
          {getAudioStatusLabel(audioEngine.audioStatus)}
        </span>
      </div>

      <div className="audio-control-row">
        <div>
          <strong>{'本地监听'}</strong>
          <span>{audioEngine.localMonitoringEnabled ? '开启：MIDI 输入会触发内置钢琴音色' : '关闭：只显示 MIDI 输入，软件不发声'}</span>
        </div>
        <button
          className={`monitor-toggle ${audioEngine.localMonitoringEnabled ? 'is-on' : ''}`}
          type="button"
          onClick={() => void audioEngine.setLocalMonitoringEnabled(!audioEngine.localMonitoringEnabled)}
        >
          {audioEngine.localMonitoringEnabled ? '已开启' : '启用'}
        </button>
      </div>

      <label className="volume-control" htmlFor="audio-monitor-volume">
        <div>
          <span>{'音量'}</span>
          <strong>{audioEngine.volume}%</strong>
        </div>
        <input
          id="audio-monitor-volume"
          type="range"
          min="0"
          max="100"
          value={audioEngine.volume}
          onChange={(event) => audioEngine.setVolume(Number(event.target.value))}
        />
      </label>

      <p className="audio-monitor-note">
        {'如果你的电钢琴本身已经发声，可以关闭本地监听，避免双重声音。'}
      </p>

      {audioEngine.audioMessage ? <div className="midi-warning">{audioEngine.audioMessage}</div> : null}
    </section>
  )
}

function getEventName(event: MidiEventRecord): string {
  if (event.type === 'controlChange') {
    return event.controllerName || '控制器'
  }

  return event.noteName || '-'
}

function getEventNumber(event: MidiEventRecord): string {
  if (event.type === 'controlChange') {
    return typeof event.controllerNumber === 'number' ? 'CC' + String(event.controllerNumber) : '-'
  }

  return typeof event.midiNumber === 'number' ? String(event.midiNumber) : '-'
}

function getEventValue(event: MidiEventRecord): string {
  if (event.type === 'controlChange') {
    return typeof event.value === 'number' ? String(event.value) : '-'
  }

  return typeof event.velocity === 'number' ? String(event.velocity) : '-'
}

function getEventDetail(event: MidiEventRecord): string {
  if (event.type === 'controlChange' && event.controllerNumber === 64) {
    return '延音踏板 ' + (event.sustainPedalDown ? '踩下' : '松开')
  }

  return ''
}

function getLatestEventSummary(event: MidiEventRecord | null): string {
  if (!event) {
    return '暂无事件'
  }

  if (event.type === 'controlChange') {
    return event.type + ' / ' + getEventNumber(event) + ' / ' + getEventName(event) + ' / value ' + getEventValue(event) + (getEventDetail(event) ? ' / ' + getEventDetail(event) : '')
  }

  return event.type + ' / ' + getEventName(event) + ' / velocity ' + getEventValue(event)
}

function MidiLogRow({ event }: { event: MidiEventRecord }): JSX.Element {
  return (
    <div className={`midi-log-row event-${event.type}`}>
      <time>{formatEventTime(event.timestamp)}</time>
      <span className="event-type">{event.type}</span>
      <span>{getEventName(event)}</span>
      <span>{getEventNumber(event)}</span>
      <span>{getEventValue(event)}</span>
      <span className="device-cell">
        {event.deviceName}
        {getEventDetail(event) ? <small>{getEventDetail(event)}</small> : null}
      </span>
    </div>
  )
}

function MidiEventSummaryCard({
  latestEvent,
  activeNoteCount,
  onOpenLog
}: {
  latestEvent: MidiEventRecord | null
  activeNoteCount: number
  onOpenLog: () => void
}): JSX.Element {
  return (
    <section className="midi-panel midi-event-summary-panel">
      <div className="panel-title-row">
        <div>
          <h3>事件摘要</h3>
          <p>MIDI 日志作为调试工具，可按需打开查看</p>
        </div>
        <span className="log-count-badge">{latestEvent ? '最近 1 条' : '暂无事件'}</span>
      </div>

      <div className="midi-event-summary-grid">
        <div>
          <span>最近事件</span>
          <strong>{getLatestEventSummary(latestEvent)}</strong>
        </div>
        <div>
          <span>按下音符</span>
          <strong>{activeNoteCount} 个</strong>
        </div>
        <div>
          <span>事件类型</span>
          <strong>{latestEvent?.type || '-'}</strong>
        </div>
      </div>

      <AppButton className="primary-log-button" onClick={onOpenLog}>
        查看事件日志
      </AppButton>
    </section>
  )
}

function ExternalAudioNoteCard(): JSX.Element {
  return (
    <section className="midi-panel external-audio-note-panel">
      <div className="panel-title-row">
        <div>
          <h3>外部音源</h3>
          <p>使用真实钢琴音色时的监听建议</p>
        </div>
      </div>
      <p>
        如果你使用 Garritan CFX、Pianoteq、Kontakt、DAW 等外部音源，可以在外部音源中直接选择同一个 MIDI 键盘作为输入，并关闭本软件的本地监听，避免双重声音。
      </p>
    </section>
  )
}

function MidiEventLogModal({ events, onClose }: { events: MidiEventRecord[]; onClose: () => void }): JSX.Element {
  return (
    <div className="midi-log-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="midi-log-modal" role="dialog" aria-modal="true" aria-labelledby="midi-log-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="midi-log-modal-header">
          <div>
            <h3 id="midi-log-modal-title">MIDI 事件日志</h3>
            <p>最新事件显示在最上方，保留最近 20 条 noteOn / noteOff / controlChange</p>
          </div>
          <AppButton className="modal-close-button" variant="secondary" onClick={onClose}>
            关闭
          </AppButton>
        </div>

        <div className="midi-log modal-midi-log">
          <div className="midi-log-row midi-log-head">
            <span>时间</span>
            <span>类型</span>
            <span>音名</span>
            <span>MIDI</span>
            <span>velocity / value</span>
            <span>设备</span>
          </div>
          {events.length > 0 ? (
            events.map((event, index) => (
              <MidiLogRow key={`${event.timestamp}-${event.type}-${event.midiNumber ?? event.controllerNumber}-${index}`} event={event} />
            ))
          ) : (
            <div className="empty-midi-state log-empty">暂无 MIDI 输入事件</div>
          )}
        </div>
      </section>
    </div>
  )
}

export function MidiTestPage({ midi, audioEngine, onBackHome }: MidiTestPageProps): JSX.Element {
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const activeNoteNames = midi.activeNotes.map((note) => note.noteName).join(' / ')
  const hasInputs = midi.inputs.length > 0

  return (
    <section className="midi-test-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">Web MIDI API</span>
          <h2>MIDI 输入测试</h2>
          <p>选择输入设备后，按下电钢琴或 MIDI 键盘即可查看实时事件。</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="midi-dashboard">
        <section className="midi-panel midi-device-panel">
          <div className="panel-title-row">
            <div>
              <h3>MIDI 设备</h3>
              <p>权限、设备列表与当前输入选择</p>
            </div>
            <AppButton className="ghost-button" variant="secondary" onClick={() => void midi.refreshDevices()}>
              刷新设备
            </AppButton>
          </div>

          <div className="midi-status-grid">
            <div className={`permission-badge permission-${midi.permissionStatus}`}>
              <span>Web MIDI 权限</span>
              <strong>{midi.permissionLabel}</strong>
            </div>
            <div className={`permission-badge status-${midi.sidebarStatus.connectionState}`}>
              <span>连接状态</span>
              <strong>{midi.sidebarStatus.statusLabel}</strong>
            </div>
          </div>

          {!midi.isSupported ? (
            <div className="midi-warning">
              当前环境不支持 Web MIDI API，请使用支持 MIDI 的 Chromium / Electron 环境。
            </div>
          ) : null}

          {midi.permissionStatus === 'denied' ? (
            <div className="midi-warning">
              MIDI 权限未授予，请允许软件访问 MIDI 设备后重试。
            </div>
          ) : null}

          <label className="midi-select-label" htmlFor="midi-input-select">
            MIDI 输入设备
          </label>
          <div className="midi-select-row">
            <select
              id="midi-input-select"
              className="midi-select"
              value={midi.selectedInputId}
              disabled={!hasInputs}
              onChange={(event) => midi.selectInput(event.target.value)}
            >
              <option value="">请选择 MIDI 输入设备</option>
              {midi.inputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {input.name}
                </option>
              ))}
            </select>
          </div>

          {hasInputs ? (
            <div className="device-list">
              {midi.inputs.map((input) => (
                <button
                  key={input.id}
                  className={`device-list-item ${midi.selectedInputId === input.id ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => midi.selectInput(input.id)}
                >
                  <span>{input.name}</span>
                  <small>{input.manufacturer || '未知厂商'} · {input.connection}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-midi-state">
              未检测到 MIDI 输入设备，请连接电钢琴或 MIDI 键盘后刷新。
            </div>
          )}
        </section>

        <div className="midi-live-column">
          <section className="midi-panel current-input-panel">
            <div className="panel-title-row">
              <div>
                <h3>当前输入</h3>
                <p>实时显示当前按下的音符、MIDI 编号与力度</p>
              </div>
            </div>

            <div className="current-note-display">
              <span>当前按下</span>
              <strong>{activeNoteNames || '暂无按键'}</strong>
            </div>

            <div className="active-notes-grid">
              {midi.activeNotes.length > 0 ? (
                midi.activeNotes.map((note) => <ActiveNoteCard key={note.midiNumber} note={note} />)
              ) : (
                <div className="empty-midi-state compact">等待 MIDI 输入事件</div>
              )}
            </div>

            <div className="latest-event-box">
              <span>最近事件</span>
              <strong>{getLatestEventSummary(midi.latestEvent)}</strong>
            </div>
          </section>

          <AudioMonitoringCard audioEngine={audioEngine} />

          <MidiEventSummaryCard
            latestEvent={midi.latestEvent}
            activeNoteCount={midi.activeNotes.length}
            onOpenLog={() => setIsLogModalOpen(true)}
          />

          <ExternalAudioNoteCard />
        </div>
      </div>

      <section className="midi-panel keyboard-panel">
        <div className="panel-title-row">
          <div>
            <h3>虚拟钢琴键盘</h3>
            <p>范围 A0 到 C8，当前按下的琴键会同步高亮</p>
          </div>
        </div>
        <FullKeyboard activeNotes={midi.activeNotes} />
      </section>

      {isLogModalOpen ? (
        <MidiEventLogModal events={midi.recentEvents} onClose={() => setIsLogModalOpen(false)} />
      ) : null}
    </section>
  )
}
