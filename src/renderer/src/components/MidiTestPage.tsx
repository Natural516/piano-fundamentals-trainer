import { useState } from 'react'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import type { UseMidiResult } from '../hooks/useMidi'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { AppButton } from './AppButton'
import { EventLogIcon } from './EventLogIcon'
import { FullKeyboard } from './FullKeyboard'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { SettingsIcon } from './SettingsIcon'

interface MidiTestPageProps {
  midi: UseMidiResult
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
            events.map((event) => (
              <MidiLogRow key={event.id} event={event} />
            ))
          ) : (
            <div className="empty-midi-state log-empty">暂无 MIDI 输入事件</div>
          )}
        </div>
      </section>
    </div>
  )
}

export function MidiTestPage({ midi }: MidiTestPageProps): JSX.Element {
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('midi-test')
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const activeNoteNames = midi.activeNotes.map((note) => note.noteName).join(' / ')
  const hasInputs = midi.inputs.length > 0

  const openSettings = (): void => {
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  return (
    <section className="midi-test-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">连接与输入</span>
          <h2>MIDI 输入测试</h2>
          <p>选择输入设备后，按下电钢琴或 MIDI 键盘即可查看实时事件。</p>
        </div>
        <div className="midi-page-header__actions">
          <button className="midi-log-trigger" type="button" aria-label="查看 MIDI 事件日志" title="查看事件日志" onClick={() => setIsLogModalOpen(true)}>
            <EventLogIcon />
          </button>
          <button className="practice-settings-trigger" type="button" aria-label="MIDI 测试设置" title="MIDI 测试设置" onClick={openSettings}>
            <SettingsIcon />
          </button>
        </div>
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

        </div>
      </div>

      {showVirtualKeyboard ? (
        <section className="midi-panel keyboard-panel">
          <div className="panel-title-row">
            <div>
              <h3>虚拟钢琴键盘</h3>
              <p>范围 A0 到 C8，当前按下的琴键会同步高亮</p>
            </div>
          </div>
          <FullKeyboard activeNotes={midi.activeNotes} />
        </section>
      ) : null}

      {isLogModalOpen ? (
        <MidiEventLogModal events={midi.recentEvents} onClose={() => setIsLogModalOpen(false)} />
      ) : null}

      <PracticeSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="MIDI 测试设置">
        <div className="midi-setting-group">
          <span>显示虚拟键盘</span>
          <div className="segmented-control">
            <button className={draftShowVirtualKeyboard ? 'is-active' : ''} type="button" onClick={() => setDraftShowVirtualKeyboard(true)}>显示</button>
            <button className={!draftShowVirtualKeyboard ? 'is-active' : ''} type="button" onClick={() => setDraftShowVirtualKeyboard(false)}>隐藏</button>
          </div>
        </div>
      </PracticeSettingsDrawer>
    </section>
  )
}
