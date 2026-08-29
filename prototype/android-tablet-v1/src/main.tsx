import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MusicStaffRenderer } from '../../../src/renderer/src/components/MusicStaffRenderer'
import { spellMidiPitch } from '../../../src/renderer/src/utils/musicPitchSpelling'
import type { MusicNotationFeedback } from '../../../src/renderer/src/utils/musicNotationTypes'
import './styles.css'

type ScreenId =
  | 'home'
  | 'sight-ready'
  | 'sight-active'
  | 'sight-correct'
  | 'sight-wrong'
  | 'sight-result'
  | 'history'
  | 'settings'
  | 'midi'
  | 'update'

type IconName =
  | 'arrow-left'
  | 'bluetooth'
  | 'book'
  | 'chart'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'close'
  | 'history'
  | 'home'
  | 'info'
  | 'moon'
  | 'pause'
  | 'play'
  | 'refresh'
  | 'settings'
  | 'stop'
  | 'sun'

interface ScreenOption {
  id: ScreenId
  label: string
  shortLabel: string
}

interface ViewportMetrics {
  dpr: number
  innerHeight: number
  innerWidth: number
  safeArea: { top: number; right: number; bottom: number; left: number }
  screenHeight: number
  screenWidth: number
  usableHeight: number
  usableWidth: number
  visualHeight: number
  visualWidth: number
}

const screens: ScreenOption[] = [
  { id: 'home', label: '首页', shortLabel: '首页' },
  { id: 'sight-ready', label: '识谱 · 准备', shortLabel: 'READY' },
  { id: 'sight-active', label: '识谱 · 进行中', shortLabel: 'ACTIVE' },
  { id: 'sight-correct', label: '识谱 · 正确反馈', shortLabel: 'CORRECT' },
  { id: 'sight-wrong', label: '识谱 · 错误反馈', shortLabel: 'WRONG' },
  { id: 'sight-result', label: '识谱 · 结果', shortLabel: 'RESULT' },
  { id: 'history', label: '练习记录', shortLabel: '记录' },
  { id: 'settings', label: '设置', shortLabel: '设置' },
  { id: 'midi', label: 'MIDI 连接状态', shortLabel: 'MIDI' },
  { id: 'update', label: '检查更新', shortLabel: '更新' }
]

const productNavigation = [
  { id: 'home' as const, label: '首页', icon: 'home' as const },
  { id: 'sight-ready' as const, label: '识谱', icon: 'book' as const },
  { id: 'history' as const, label: '记录', icon: 'history' as const },
  { id: 'settings' as const, label: '设置', icon: 'settings' as const }
]

function Icon({ name, size = 24 }: { name: IconName; size?: number }): JSX.Element {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8
  }

  const body = (() => {
    switch (name) {
      case 'home':
        return <><path {...common} d="M3.5 10.6 12 3.8l8.5 6.8" /><path {...common} d="M5.7 9.2v10h12.6v-10M9.5 19.2v-5.7h5v5.7" /></>
      case 'book':
        return <><path {...common} d="M4 5.2c3.2-.8 5.8-.2 8 1.8v13c-2.2-2-4.8-2.6-8-1.8zM20 5.2c-3.2-.8-5.8-.2-8 1.8v13c2.2-2 4.8-2.6 8-1.8z" /><path {...common} d="M12 7v13" /></>
      case 'history':
        return <><path {...common} d="M4.2 8.2A8.8 8.8 0 1 1 3.4 14" /><path {...common} d="M4.2 3.8v4.7h4.7M12 7.4v5l3.2 1.9" /></>
      case 'settings':
        return <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19.2 13.8c.1-.6.1-1.2 0-1.8l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.6-.9L14.9 4h-4l-.4 3.2c-.6.2-1.1.5-1.6.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 1.8l-2 1.5 2 3.4 2.4-1c.5.4 1 .7 1.6.9l.4 3.2h4l.4-3.2c.6-.2 1.1-.5 1.6-.9l2.4 1 2-3.4z" /></>
      case 'bluetooth':
        return <path {...common} d="m8 7 8 10V7l-8 10 8-5-8-5z" />
      case 'play':
        return <path {...common} d="m9 6 9 6-9 6z" />
      case 'pause':
        return <><path {...common} d="M8.5 6v12M15.5 6v12" /></>
      case 'stop':
        return <rect {...common} x="7" y="7" width="10" height="10" rx="1.5" />
      case 'check':
        return <path {...common} d="m5 12.5 4.2 4.1L19.5 6.8" />
      case 'close':
        return <><path {...common} d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></>
      case 'arrow-left':
        return <><path {...common} d="m14.5 5-7 7 7 7" /><path {...common} d="M8 12h12" /></>
      case 'refresh':
        return <><path {...common} d="M19.4 8.2A8 8 0 1 0 20 14" /><path {...common} d="M19.5 3.8v4.7h-4.7" /></>
      case 'chevron':
        return <path {...common} d="m9 5 7 7-7 7" />
      case 'sun':
        return <><circle {...common} cx="12" cy="12" r="4" /><path {...common} d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
      case 'moon':
        return <path {...common} d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2z" />
      case 'clock':
        return <><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="M12 7v5.5l3.5 2" /></>
      case 'chart':
        return <><path {...common} d="M5 20V9M12 20V4M19 20v-7" /><path {...common} d="M3 20h18" /></>
      case 'info':
        return <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M12 10.8V17M12 7.2h.01" /></>
    }
  })()

  return <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>{body}</svg>
}

function navigate(screen: ScreenId): void {
  window.location.hash = screen
}

function readScreen(): ScreenId {
  const value = window.location.hash.replace(/^#\/?/, '') as ScreenId
  return screens.some((screen) => screen.id === value) ? value : 'home'
}

function measureViewport(): ViewportMetrics {
  const probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)'
  ].join(';')
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const safeArea = {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0
  }
  probe.remove()

  const visualWidth = window.visualViewport?.width ?? document.documentElement.clientWidth
  const visualHeight = window.visualViewport?.height ?? document.documentElement.clientHeight
  return {
    dpr: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    safeArea,
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    usableHeight: Math.max(0, visualHeight - safeArea.top - safeArea.bottom),
    usableWidth: Math.max(0, visualWidth - safeArea.left - safeArea.right),
    visualHeight,
    visualWidth
  }
}

function useViewportMetrics(): ViewportMetrics | null {
  const [metrics, setMetrics] = useState<ViewportMetrics | null>(() => (
    typeof window === 'undefined' ? null : measureViewport()
  ))

  useEffect(() => {
    const update = (): void => setMetrics(measureViewport())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return metrics
}

function MidiStatusButton({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <button className={`midi-status ${compact ? 'is-compact' : ''}`} type="button" onClick={() => navigate('midi')}>
      <span className="midi-status__signal"><Icon name="bluetooth" size={18} /></span>
      {!compact ? <span><strong>FP-30X</strong><small>已连接</small></span> : null}
      <i aria-label="已连接" />
    </button>
  )
}

function ProductHeader({ title, onBack }: { title: string; onBack?: () => void }): JSX.Element {
  return (
    <header className="product-header">
      <div className="product-header__left">
        {onBack ? (
          <button className="icon-button" aria-label="返回" type="button" onClick={onBack}>
            <Icon name="arrow-left" />
          </button>
        ) : (
          <div className="brand-mark" aria-hidden="true"><span>♩</span><i /></div>
        )}
        <div>
          <small>PIANO FUNDAMENTALS</small>
          <strong>{title}</strong>
        </div>
      </div>
      <MidiStatusButton />
    </header>
  )
}

function BottomNavigation({ active }: { active: 'home' | 'sight' | 'history' | 'settings' }): JSX.Element {
  return (
    <nav className="bottom-navigation" aria-label="主要导航">
      {productNavigation.map((item) => {
        const itemActive = item.id.startsWith('sight') ? active === 'sight' : item.id === active
        return (
          <button className={itemActive ? 'is-active' : ''} key={item.id} type="button" onClick={() => navigate(item.id)}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ProductFrame({
  active,
  children,
  title
}: {
  active: 'home' | 'sight' | 'history' | 'settings'
  children: ReactNode
  title: string
}): JSX.Element {
  return (
    <div className="product-frame">
      <ProductHeader title={title} />
      <main className="product-content">{children}</main>
      <BottomNavigation active={active} />
    </div>
  )
}

function NotationPaper({
  feedback = null,
  noteFeedback = feedback,
  midiNumber = 71,
  empty = false,
  label = '大谱表识谱题目'
}: {
  feedback?: MusicNotationFeedback
  noteFeedback?: MusicNotationFeedback
  midiNumber?: number
  empty?: boolean
  label?: string
}): JSX.Element {
  const notes = useMemo(
    () => empty ? [] : [spellMidiPitch(midiNumber, 'C', 'grand')],
    [empty, midiNumber]
  )

  return (
    <div className={`notation-paper ${feedback ? `has-${feedback}` : ''}`}>
      <MusicStaffRenderer
        ariaLabel={label}
        feedback={noteFeedback}
        keySignature="C"
        notes={notes}
        staffMode="grand"
      />
    </div>
  )
}

function HomeScreen(): JSX.Element {
  return (
    <ProductFrame active="home" title="今天，读几页新音符">
      <section className="home-hero">
        <div className="home-hero__copy">
          <span className="eyebrow">今日练习</span>
          <h1>让眼睛先认出，<br />再让手指弹出来。</h1>
          <p>大谱表 · 20 题 · 每题固定 5 秒</p>
          <button className="primary-action" type="button" onClick={() => navigate('sight-ready')}>
            <Icon name="play" />
            开始识谱练习
          </button>
        </div>
        <div className="home-hero__notation" aria-hidden="true">
          <span className="floating-note note-one">♪</span>
          <span className="floating-note note-two">♩</span>
          <NotationPaper midiNumber={67} label="识谱练习预览" />
        </div>
      </section>

      <section className="home-glance" aria-label="今日概览">
        <button className="glance-item" type="button" onClick={() => navigate('history')}>
          <span className="glance-icon"><Icon name="chart" /></span>
          <span><small>上次练习</small><strong>85% 正确率</strong><em>今天 09:42 · 20 题</em></span>
          <Icon name="chevron" size={20} />
        </button>
        <button className="glance-item" type="button" onClick={() => navigate('midi')}>
          <span className="glance-icon is-blue"><Icon name="bluetooth" /></span>
          <span><small>MIDI 输入</small><strong>Roland FP-30X</strong><em>连接稳定，可以开始</em></span>
          <span className="status-dot" />
        </button>
        <button className="glance-item" type="button" onClick={() => navigate('update')}>
          <span className="glance-icon is-amber"><Icon name="refresh" /></span>
          <span><small>应用版本</small><strong>Android V1 Prototype</strong><em>已是最新版本</em></span>
          <Icon name="chevron" size={20} />
        </button>
      </section>
    </ProductFrame>
  )
}

function SightReadyScreen(): JSX.Element {
  return (
    <ProductFrame active="sight" title="识谱练习">
      <section className="ready-layout">
        <div className="ready-stage">
          <div className="section-heading">
            <div><span className="eyebrow">练习预览</span><h1>大谱表识谱</h1></div>
            <span className="ready-badge">准备就绪</span>
          </div>
          <NotationPaper empty label="大谱表练习预览" />
        </div>

        <aside className="ready-controls">
          <div>
            <span className="eyebrow">本轮设置</span>
            <h2>20 个音符</h2>
            <p>看到音符后，在 FP-30X 上弹出对应琴键。</p>
          </div>
          <div className="setting-summary">
            <div><small>谱表</small><strong>大谱表</strong></div>
            <div><small>调性</small><strong>C 大调</strong></div>
            <div><small>题数</small><strong>20</strong></div>
            <div><small>每题时限</small><strong>固定 5 秒</strong></div>
          </div>
          <div className="ready-device"><span><Icon name="bluetooth" /></span><div><strong>Roland FP-30X 已连接</strong><small>弹一个键确认后即可开始</small></div><i /></div>
          <button className="primary-action is-wide" type="button" onClick={() => navigate('sight-active')}>
            <Icon name="play" />开始练习
          </button>
        </aside>
      </section>
    </ProductFrame>
  )
}

function PracticeFocusHeader({ screen }: { screen: ScreenId }): JSX.Element {
  return (
    <header className="focus-header">
      <button className="focus-back" type="button" onClick={() => navigate('sight-ready')}>
        <Icon name="arrow-left" /><span>结束本轮</span>
      </button>
      <div className="focus-progress">
        <span>识谱练习</span>
        <strong>第 7 题 <em>/ 20</em></strong>
      </div>
      <div className="focus-actions">
        <MidiStatusButton compact />
        <button className="outline-action" type="button"><Icon name="pause" /><span>暂停</span></button>
      </div>
      <div className="focus-time-track" aria-label="本题剩余时间"><span className={screen === 'sight-wrong' ? 'is-warning' : ''} /></div>
    </header>
  )
}

function PracticeMetric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }): JSX.Element {
  return <div className={`focus-metric ${tone ? `is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function SightFocusScreen({ state }: { state: 'active' | 'correct' | 'wrong' }): JSX.Element {
  const isCorrect = state === 'correct'
  const isWrong = state === 'wrong'
  const screen: ScreenId = isCorrect ? 'sight-correct' : isWrong ? 'sight-wrong' : 'sight-active'
  const feedback: MusicNotationFeedback = isCorrect ? 'correct' : isWrong ? 'wrong_note' : null

  return (
    <div className={`focus-frame ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''}`}>
      <PracticeFocusHeader screen={screen} />
      <main className="focus-content">
        <div className="focus-prompt">
          <span>{isCorrect ? '回答正确' : isWrong ? '这次弹错了' : '请弹出这个音'}</span>
          {isCorrect ? <strong><Icon name="check" /> B4</strong> : null}
          {isWrong ? <strong><Icon name="close" /> 目标 B4 · 弹成 C5</strong> : null}
        </div>
        <section className="focus-stage">
          <NotationPaper
            feedback={feedback}
            noteFeedback={isWrong ? null : feedback}
            midiNumber={71}
            label="当前题目 B4"
          />
        </section>
        <div className="focus-footer">
          <PracticeMetric label="已完成" value="6" />
          <PracticeMetric label="正确" value={isCorrect ? '6' : '5'} tone="success" />
          <PracticeMetric label="错误" value={isWrong ? '2' : '1'} tone={isWrong ? 'danger' : undefined} />
          <PracticeMetric label="当前连对" value={isCorrect ? '4' : isWrong ? '0' : '3'} />
          <PracticeMetric label="正确率" value={isWrong ? '71%' : '86%'} />
        </div>
      </main>
    </div>
  )
}

function SightResultScreen(): JSX.Element {
  return (
    <ProductFrame active="sight" title="本轮完成">
      <section className="result-layout">
        <div className="result-score">
          <span className="eyebrow">识谱练习结果</span>
          <div className="score-ring"><strong>85</strong><span>%</span><small>正确率</small></div>
          <h1>本轮正确率 85%，<br />再留意两个易错音。</h1>
          <p>大谱表 · C 大调 · 20 题 · 固定 5 秒</p>
        </div>
        <div className="result-details">
          <div className="result-metrics">
            <div><span>完成</span><strong>20</strong></div>
            <div><span>正确</span><strong className="success-text">17</strong></div>
            <div><span>错误</span><strong className="danger-text">2</strong></div>
            <div><span>超时</span><strong>1</strong></div>
            <div><span>平均反应</span><strong>1.24<small> 秒</small></strong></div>
            <div><span>最高连对</span><strong>9</strong></div>
          </div>
          <div className="result-note">
            <span className="result-note__icon"><Icon name="info" /></span>
            <div><small>本轮最需要留意</small><strong>B3 与 F4</strong><p>这两个音各出现了一次错误或超时。</p></div>
          </div>
          <div className="result-actions">
            <button className="secondary-action" type="button" onClick={() => navigate('sight-ready')}>再练一轮</button>
            <button className="primary-action" type="button" onClick={() => navigate('home')}><Icon name="check" />完成</button>
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

const historyItems = [
  { time: '今天 09:42', title: '大谱表 · C 大调', detail: '20 题 · 2 分 18 秒', accuracy: '85%', tone: 'good' },
  { time: '昨天 20:16', title: '高音谱表 · C 大调', detail: '20 题 · 1 分 52 秒', accuracy: '90%', tone: 'great' },
  { time: '8 月 26 日 18:30', title: '低音谱表 · C 大调', detail: '50 题 · 5 分 08 秒', accuracy: '78%', tone: 'steady' }
]

function HistoryScreen(): JSX.Element {
  return (
    <ProductFrame active="history" title="练习记录">
      <section className="history-layout">
        <div className="history-summary">
          <div><span className="eyebrow">近 7 天</span><h1>你已经完成 6 次练习</h1><p>共识别 160 个音符，平均正确率 84%。</p></div>
          <div className="history-summary__stat"><strong>84<small>%</small></strong><span>平均正确率</span></div>
          <div className="history-summary__stat"><strong>1.31<small>s</small></strong><span>平均反应</span></div>
        </div>
        <div className="history-list">
          <div className="list-heading"><h2>最近练习</h2><span>共 18 条记录</span></div>
          <div className="history-list__rows">
            {historyItems.map((item) => (
              <button className="history-row" key={item.time} type="button">
                <span className="history-row__mark"><Icon name="book" /></span>
                <span className="history-row__copy"><small>{item.time}</small><strong>{item.title}</strong><em>{item.detail}</em></span>
                <span className={`history-row__score is-${item.tone}`}><strong>{item.accuracy}</strong><small>正确率</small></span>
                <Icon name="chevron" size={20} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

function SettingRow({
  action,
  description,
  icon,
  onClick,
  title
}: {
  action?: ReactNode
  description: string
  icon: IconName
  onClick?: () => void
  title: string
}): JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="setting-row" {...(onClick ? { type: 'button' as const, onClick } : {})}>
      <span className="setting-row__icon"><Icon name={icon} /></span>
      <span className="setting-row__copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="setting-row__action">{action ?? (onClick ? <Icon name="chevron" size={20} /> : null)}</span>
    </Tag>
  )
}

function SettingsScreen({ theme, onThemeChange }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }): JSX.Element {
  return (
    <ProductFrame active="settings" title="设置">
      <section className="settings-layout">
        <div className="settings-column">
          <div className="settings-group">
            <div className="group-title"><span>设备</span><small>用于识谱输入</small></div>
            <SettingRow
              description="蓝牙 MIDI · 连接稳定"
              icon="bluetooth"
              onClick={() => navigate('midi')}
              title="Roland FP-30X"
              action={<span className="connected-label"><i />已连接</span>}
            />
          </div>
          <div className="settings-group">
            <div className="group-title"><span>识谱练习</span><small>稳定基线设置</small></div>
            <SettingRow description="高音谱表、低音谱表或大谱表" icon="book" title="默认谱表" action={<strong>大谱表</strong>} />
            <SettingRow description="每轮出现的题目数量" icon="chart" title="默认题数" action={<strong>20</strong>} />
            <SettingRow description="当前稳定版本固定为 5 秒" icon="clock" title="每题时限" action={<strong>5 秒</strong>} />
          </div>
        </div>
        <div className="settings-column">
          <div className="settings-group">
            <div className="group-title"><span>外观</span><small>适合谱架距离阅读</small></div>
            <div className="theme-setting">
              <span className="setting-row__icon"><Icon name={theme === 'light' ? 'sun' : 'moon'} /></span>
              <span className="setting-row__copy"><strong>显示主题</strong><small>原型支持浅色与深色预览</small></span>
              <div className="theme-segmented">
                <button className={theme === 'light' ? 'is-active' : ''} type="button" onClick={() => onThemeChange('light')}><Icon name="sun" size={18} />浅色</button>
                <button className={theme === 'dark' ? 'is-active' : ''} type="button" onClick={() => onThemeChange('dark')}><Icon name="moon" size={18} />深色</button>
              </div>
            </div>
          </div>
          <div className="settings-group">
            <div className="group-title"><span>关于</span><small>个人版</small></div>
            <SettingRow description="查看版本与更新状态" icon="refresh" onClick={() => navigate('update')} title="检查更新" action={<strong>已是最新</strong>} />
            <SettingRow description="Android Tablet Personal Edition" icon="info" title="当前版本" action={<strong>V1 Prototype</strong>} />
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

function MidiScreen(): JSX.Element {
  return (
    <div className="standalone-frame">
      <ProductHeader title="MIDI 连接" onBack={() => navigate('settings')} />
      <main className="standalone-content">
        <section className="device-hero">
          <div className="device-orbit"><span><Icon name="bluetooth" size={42} /></span><i /><i /><i /></div>
          <span className="connected-label large"><i />连接正常</span>
          <h1>Roland FP-30X</h1>
          <p>蓝牙 MIDI 输入已经准备好。钢琴本身负责发声，应用只读取演奏信息。</p>
        </section>
        <section className="device-details">
          <div><small>设备类型</small><strong>Bluetooth MIDI</strong></div>
          <div><small>输入状态</small><strong>正在监听</strong></div>
          <div><small>最近活动</small><strong>刚刚</strong></div>
          <div><small>应用发声</small><strong>关闭</strong></div>
        </section>
        <section className="device-help">
          <span><Icon name="info" /></span>
          <div><strong>没有收到琴键输入？</strong><p>确认 FP-30X 已开机并完成系统蓝牙 MIDI 配对，然后重新连接。</p></div>
          <button className="secondary-action" type="button"><Icon name="refresh" />重新连接</button>
        </section>
      </main>
    </div>
  )
}

function UpdateScreen(): JSX.Element {
  return (
    <div className="standalone-frame">
      <ProductHeader title="检查更新" onBack={() => navigate('settings')} />
      <main className="update-content">
        <section className="update-card">
          <div className="update-illustration"><Icon name="check" size={52} /><span /></div>
          <span className="eyebrow">更新状态</span>
          <h1>你正在使用最新版本</h1>
          <p>Android Tablet Personal Edition</p>
          <div className="version-line"><span>当前版本</span><strong>V1 Prototype</strong></div>
          <div className="version-line"><span>上次检查</span><strong>今天 10:24</strong></div>
          <button className="primary-action is-wide" type="button"><Icon name="refresh" />再次检查</button>
          <small className="mock-disclaimer">A1 原型仅展示入口与视觉状态，不执行网络请求或 APK 更新。</small>
        </section>
      </main>
    </div>
  )
}

function ReviewDock({ active }: { active: ScreenId }): JSX.Element {
  const [open, setOpen] = useState(false)
  const metrics = useViewportMetrics()
  const activeLabel = screens.find((screen) => screen.id === active)?.shortLabel ?? '首页'

  return (
    <div className={`review-dock ${open ? 'is-open' : ''}`}>
      <button className="review-dock__trigger" type="button" onClick={() => setOpen((value) => !value)}>
        <span>A1 · MOCK</span><strong>{activeLabel}</strong><Icon name="chevron" size={16} />
      </button>
      {open ? (
        <div className="review-dock__menu">
          <div><strong>Human UI Review</strong><button aria-label="关闭状态列表" type="button" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button></div>
          {screens.map((screen) => (
            <button
              className={screen.id === active ? 'is-active' : ''}
              key={screen.id}
              type="button"
              onClick={() => { navigate(screen.id); setOpen(false) }}
            >
              <span>{screen.label}</span>{screen.id === active ? <Icon name="check" size={18} /> : null}
            </button>
          ))}
          {import.meta.env.DEV && metrics ? (
            <div className="viewport-diagnostic">
              <strong>DEVICE-001 viewport</strong>
              <span><b>inner</b>{Math.round(metrics.innerWidth)} × {Math.round(metrics.innerHeight)}</span>
              <span><b>usable</b>{Math.round(metrics.usableWidth)} × {Math.round(metrics.usableHeight)}</span>
              <span><b>visual</b>{Math.round(metrics.visualWidth)} × {Math.round(metrics.visualHeight)}</span>
              <span><b>screen</b>{metrics.screenWidth} × {metrics.screenHeight}</span>
              <span><b>DPR</b>{metrics.dpr}</span>
              <span><b>insets</b>{metrics.safeArea.top}/{metrics.safeArea.right}/{metrics.safeArea.bottom}/{metrics.safeArea.left}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function OrientationNotice(): JSX.Element {
  return <div className="orientation-notice"><div className="rotate-device">↻</div><h1>请横放平板</h1><p>Android V1 专为钢琴谱架上的横屏使用设计。</p></div>
}

function App(): JSX.Element {
  const [screen, setScreen] = useState<ScreenId>(() => readScreen())
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const updateScreen = (): void => setScreen(readScreen())
    window.addEventListener('hashchange', updateScreen)
    if (!window.location.hash) navigate('home')
    return () => window.removeEventListener('hashchange', updateScreen)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const content = (() => {
    switch (screen) {
      case 'home': return <HomeScreen />
      case 'sight-ready': return <SightReadyScreen />
      case 'sight-active': return <SightFocusScreen state="active" />
      case 'sight-correct': return <SightFocusScreen state="correct" />
      case 'sight-wrong': return <SightFocusScreen state="wrong" />
      case 'sight-result': return <SightResultScreen />
      case 'history': return <HistoryScreen />
      case 'settings': return <SettingsScreen theme={theme} onThemeChange={setTheme} />
      case 'midi': return <MidiScreen />
      case 'update': return <UpdateScreen />
    }
  })()

  return (
    <>
      <div className="tablet-app">{content}</div>
      <ReviewDock active={screen} />
      <OrientationNotice />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
