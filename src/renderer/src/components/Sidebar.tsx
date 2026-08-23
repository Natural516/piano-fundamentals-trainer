import { navigationItems } from '../data'
import type { MidiSidebarStatus, PageId } from '../types'
import { AppButton } from './AppButton'

interface SidebarProps {
  currentPage: PageId
  midiStatus: MidiSidebarStatus
  onNavigate: (page: PageId) => void
}

export function Sidebar({ currentPage, midiStatus, onNavigate }: SidebarProps): JSX.Element {
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
          <p>专注练好每一轮</p>
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

      <div className={`midi-status-compact is-${midiStatus.connectionState}`} aria-label={`MIDI ${midiStatus.statusLabel}`}>
        <i aria-hidden="true" />
        <div>
          <span>{midiStatus.statusLabel}</span>
          <small>{midiStatus.deviceName}</small>
        </div>
      </div>
    </aside>
  )
}
