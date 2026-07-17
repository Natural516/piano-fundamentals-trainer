import { navigationItems } from '../data'
import type { UseAudioEngineResult } from '../hooks/useAudioEngine'
import type { MidiSidebarStatus, PageId } from '../types'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { StatusBadge } from './StatusBadge'
import { VirtualKeyboard } from './VirtualKeyboard'

interface SidebarProps {
  currentPage: PageId
  midiStatus: MidiSidebarStatus
  audioEngine: UseAudioEngineResult
  onNavigate: (page: PageId) => void
}

function getMidiTone(connectionState: MidiSidebarStatus['connectionState']): 'danger' | 'success' | 'warning' {
  if (connectionState === 'connected') {
    return 'success'
  }

  if (connectionState === 'pending') {
    return 'warning'
  }

  return 'danger'
}

export function Sidebar({ currentPage, midiStatus, audioEngine, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <h1>钢琴基本功训练器</h1>
          <p>Piano Fundamentals Trainer</p>
        </div>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {navigationItems.map((item) => (
          <AppButton
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'is-active' : ''}`}
            variant="ghost"
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{item.label}</span>
          </AppButton>
        ))}
      </nav>

      <AppCard as="section" className="midi-card" aria-label="MIDI 状态">
        <div className="midi-card__header">
          <span>MIDI 设备</span>
          <StatusBadge className={`status-pill status-${midiStatus.connectionState}`} tone={getMidiTone(midiStatus.connectionState)}>
            {midiStatus.statusLabel}
          </StatusBadge>
        </div>
        <div className="midi-device">{midiStatus.deviceName}</div>
        <VirtualKeyboard />
        <div className="sidebar-audio-monitor">
          <div className="sidebar-audio-row">
            <span>本地监听</span>
            <AppButton
              className={`mini-monitor-toggle ${audioEngine.localMonitoringEnabled ? 'is-on' : ''}`}
              variant="ghost"
              onClick={() => void audioEngine.setLocalMonitoringEnabled(!audioEngine.localMonitoringEnabled)}
            >
              {audioEngine.localMonitoringEnabled ? '开启' : '关闭'}
            </AppButton>
          </div>
          <div className="sidebar-audio-row muted">
            <span>音量</span>
            <strong>{audioEngine.volume}%</strong>
          </div>
        </div>
        <AppButton
          className={`secondary-button ${currentPage === 'midi-test' ? 'is-active' : ''}`}
          variant="secondary"
          onClick={() => onNavigate('midi-test')}
        >
          MIDI 测试
        </AppButton>
      </AppCard>
    </aside>
  )
}
