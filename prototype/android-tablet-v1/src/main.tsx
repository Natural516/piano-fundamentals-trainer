import { StrictMode, createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { MusicStaffRenderer } from '../../../src/renderer/src/components/MusicStaffRenderer'
import { getMajorKeySignature, MAJOR_KEY_DISPLAY_SIGNATURES, type MajorKeyId } from '../../../src/sightReading/musicKeySignatures'
import { spellMidiPitch } from '../../../src/sightReading/musicPitchSpelling'
import type { MusicNotationFeedback, MusicNotationPitch } from '../../../src/sightReading/musicNotationTypes'
import { STAFF_MODE_LABELS, type SightReadingStaffMode } from '../../../src/sightReading/sightReadingNotes'
import type { SightReadingSessionReport } from '../../../src/sightReading/report'
import { getSightReadingAnswerTimeoutMs, type SightReadingNoteMode, type SightReadingNotePoolMode, type SightReadingQuestionCount, type SightReadingSettings } from '../../../src/sightReading/sightReadingSettings'
import {
  AndroidSightReadingRuntime,
  createBrowserAndroidSightReadingRuntime,
  formatReactionTime,
  getPrimaryErrorNote
} from './sightReadingIntegration'
import type { AndroidBluetoothMidiConnectionState } from './androidBluetoothMidi'
import {
  formatHistoryDuration,
  formatHistoryPercentage,
  formatHistoryTimestamp,
  projectSightReadingHistory
} from './historyProjection'
import { createAndroidUpdaterController } from './androidUpdater'
import { UpdaterController, type UpdaterSnapshot, type UpdaterStatus } from './updaterCore'
import { getSightReadingPrompt } from './sightReadingPresentation'
import './styles.css'

type ScreenId =
  | 'home'
  | 'sight-ready'
  | 'sight-active'
  | 'sight-correct'
  | 'sight-wrong'
  | 'sight-timeout'
  | 'sight-early-end'
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
  { id: 'sight-timeout', label: '识谱 · 超时反馈', shortLabel: 'TIMEOUT' },
  { id: 'sight-early-end', label: '识谱 · 提前结束确认', shortLabel: 'EARLY END' },
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

const SHOW_DEVELOPMENT_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'android-debug'

type SightRuntimeSnapshot = AndroidSightReadingRuntime['snapshot']

interface MidiUiContextValue {
  runtime: AndroidSightReadingRuntime
}

const MidiUiContext = createContext<MidiUiContextValue | null>(null)

interface UpdaterUiContextValue {
  controller: UpdaterController
  snapshot: UpdaterSnapshot
}

const UpdaterUiContext = createContext<UpdaterUiContextValue | null>(null)

function useMidiUi(): MidiUiContextValue {
  const value = useContext(MidiUiContext)
  if (!value) throw new Error('MIDI UI must be rendered inside MidiUiContext')
  return value
}

function useUpdaterUi(): UpdaterUiContextValue {
  const value = useContext(UpdaterUiContext)
  if (!value) throw new Error('Updater UI must be rendered inside UpdaterUiContext')
  return value
}

function useUpdaterSnapshot(controller: UpdaterController): UpdaterSnapshot {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot>(() => controller.snapshot)
  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot)), [controller])
  return snapshot
}

interface MidiStatusPresentation {
  label: string
  detail: string
  tone: 'connected' | 'busy' | 'idle' | 'error' | 'development'
}

function presentMidiStatus(runtime: AndroidSightReadingRuntime): MidiStatusPresentation {
  if (runtime.midiSource === 'development') {
    return { label: '开发 MIDI', detail: 'DEBUG 模拟输入', tone: 'development' }
  }
  const midi = runtime.bluetoothSnapshot
  const name = midi.connectedDeviceName ?? 'FP-30X'
  const states: Record<AndroidBluetoothMidiConnectionState, MidiStatusPresentation> = {
    UNSUPPORTED: { label: '不支持 MIDI', detail: '设备缺少 BLE MIDI 能力', tone: 'error' },
    PERMISSION_REQUIRED: { label: '需要权限', detail: '允许附近设备后扫描', tone: 'idle' },
    PERMISSION_DENIED: { label: '权限被拒绝', detail: '请重新授权附近设备', tone: 'error' },
    BLUETOOTH_OFF: { label: '蓝牙已关闭', detail: '请先打开系统蓝牙', tone: 'error' },
    IDLE: { label: 'MIDI 未连接', detail: '打开 MIDI 页面扫描', tone: 'idle' },
    SCANNING: { label: '正在扫描', detail: '查找 BLE MIDI 钢琴', tone: 'busy' },
    DEVICE_FOUND: { label: '已发现设备', detail: '请选择钢琴连接', tone: 'busy' },
    CONNECTING: { label: '正在连接', detail: name, tone: 'busy' },
    CONNECTED: { label: `${name} 已连接`, detail: 'MIDI 输入端口已打开', tone: 'connected' },
    DISCONNECTED: { label: 'MIDI 已断开', detail: '可重新扫描并连接', tone: 'error' },
    ERROR: { label: 'MIDI 连接错误', detail: midi.lastError ?? '请重试', tone: 'error' }
  }
  return states[midi.connectionState]
}

const NOTE_POOL_LABELS: Record<SightReadingNotePoolMode, string> = {
  diatonic: '调内音',
  chromatic: '含临时变音'
}

function useSightReadingRuntime(runtime: AndroidSightReadingRuntime): SightRuntimeSnapshot {
  const [, render] = useState(0)
  useEffect(() => runtime.subscribe(() => render((version) => version + 1)), [runtime])
  return runtime.snapshot
}

function getPracticeScreen(runtime: AndroidSightReadingRuntime): ScreenId {
  switch (runtime.uiState) {
    case 'correct': return 'sight-correct'
    case 'wrong': return 'sight-wrong'
    case 'timeout': return 'sight-timeout'
    case 'result': return 'sight-result'
    case 'ready': return 'sight-ready'
    default: return 'sight-active'
  }
}

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
  const { runtime } = useMidiUi()
  const status = presentMidiStatus(runtime)
  return (
    <button className={`midi-status is-${status.tone} ${compact ? 'is-compact' : ''}`} type="button" onClick={() => navigate('midi')}>
      <span className="midi-status__signal"><Icon name="bluetooth" size={18} /></span>
      {!compact ? <span><strong>{status.label}</strong><small>{status.detail}</small></span> : null}
      <i aria-label={status.label} />
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
  note = null,
  notes: suppliedNotes = null,
  noteFeedback = feedback,
  empty = false,
  keySignature,
  staffMode,
  label = '识谱题目'
}: {
  feedback?: MusicNotationFeedback
  note?: MusicNotationPitch | null
  notes?: readonly MusicNotationPitch[] | null
  noteFeedback?: MusicNotationFeedback
  empty?: boolean
  keySignature: MajorKeyId
  staffMode: SightReadingStaffMode
  label?: string
}): JSX.Element {
  const notes = useMemo(
    () => empty ? [] : suppliedNotes ?? [note ?? spellMidiPitch(71, keySignature, staffMode)],
    [empty, keySignature, note, staffMode, suppliedNotes]
  )

  return (
    <div className={`notation-paper ${feedback ? `has-${feedback}` : ''}`}>
      <MusicStaffRenderer
        ariaLabel={label}
        feedback={noteFeedback}
        keySignature={keySignature}
        notes={notes}
        staffMode={staffMode}
      />
    </div>
  )
}

function HomeScreen({ settings }: { settings: SightReadingSettings }): JSX.Element {
  const { runtime } = useMidiUi()
  const midiStatus = presentMidiStatus(runtime)
  const answerTimeLimitSeconds = getSightReadingAnswerTimeoutMs(settings) / 1000
  return (
    <ProductFrame active="home" title="今天，读几页新音符">
      <section className="home-hero">
        <div className="home-hero__copy">
          <span className="eyebrow">今日练习</span>
          <h1>让眼睛先认出，<br />再让手指弹出来。</h1>
          <p>{STAFF_MODE_LABELS[settings.staffMode]} · {settings.questionCount} 题 · 每题固定 {answerTimeLimitSeconds} 秒</p>
          <button className="primary-action" type="button" onClick={() => navigate('sight-ready')}>
            <Icon name="play" />
            开始识谱练习
          </button>
        </div>
        <div className="home-hero__notation" aria-hidden="true">
          <span className="floating-note note-one">♪</span>
          <span className="floating-note note-two">♩</span>
          <NotationPaper
            keySignature={settings.keySignature}
            label="识谱练习预览"
            note={spellMidiPitch(67, settings.keySignature, settings.staffMode)}
            staffMode={settings.staffMode}
          />
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
          <span><small>MIDI 输入</small><strong>{midiStatus.label}</strong><em>{midiStatus.detail}</em></span>
          <span className={`status-dot is-${midiStatus.tone}`} />
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

function SightReadyScreen({
  onStart,
  settings
}: {
  onStart: () => void
  settings: SightReadingSettings
}): JSX.Element {
  const { runtime } = useMidiUi()
  const midiStatus = presentMidiStatus(runtime)
  const answerTimeLimitSeconds = getSightReadingAnswerTimeoutMs(settings) / 1000
  return (
    <ProductFrame active="sight" title="识谱练习">
      <section className="ready-layout">
        <div className="ready-stage">
          <div className="section-heading">
            <div><span className="eyebrow">练习预览</span><h1>{STAFF_MODE_LABELS[settings.staffMode]}识谱</h1></div>
            <span className="ready-badge">准备就绪</span>
          </div>
          <NotationPaper
            empty
            keySignature={settings.keySignature}
            label={`${STAFF_MODE_LABELS[settings.staffMode]}练习预览`}
            staffMode={settings.staffMode}
          />
        </div>

        <aside className="ready-controls">
          <div>
            <span className="eyebrow">本轮设置</span>
            <h2>{settings.noteMode === 'double' ? `${settings.questionCount} 道双音题` : `${settings.questionCount} 个音符`}</h2>
            <p>{runtime.midiSource === 'development'
              ? '当前使用 DEBUG 模拟输入；可在开发控制中切换到真实蓝牙 MIDI。'
              : midiStatus.tone === 'connected'
                ? '直接在已连接的 FP-30X 上弹奏目标音。'
                : '开始前请打开 MIDI 页面，扫描并连接 FP-30X。'}</p>
          </div>
          <div className="setting-summary">
            <div><small>谱表</small><strong>{STAFF_MODE_LABELS[settings.staffMode]}</strong></div>
            <div><small>调性</small><strong>{getMajorKeySignature(settings.keySignature).displayName}</strong></div>
            <div><small>题数</small><strong>{settings.questionCount}</strong></div>
            <div><small>每题时限</small><strong>固定 {answerTimeLimitSeconds} 秒</strong></div>
          </div>
          <button className="ready-device" type="button" onClick={() => navigate('midi')}>
            <span><Icon name="bluetooth" /></span><div><strong>{midiStatus.label}</strong><small>{midiStatus.detail}</small></div><i className={`is-${midiStatus.tone}`} />
          </button>
          <button className="primary-action is-wide" type="button" onClick={onStart}>
            <Icon name="play" />开始练习
          </button>
        </aside>
      </section>
    </ProductFrame>
  )
}

function useRemainingTime(
  runtime: AndroidSightReadingRuntime,
  snapshot: SightRuntimeSnapshot
): number {
  const [remaining, setRemaining] = useState(() => runtime.getRemainingTimeMs())
  useEffect(() => {
    setRemaining(runtime.getRemainingTimeMs())
    if (snapshot.status !== 'running' || snapshot.phase !== 'answering' || snapshot.isPaused) return
    const timer = window.setInterval(() => setRemaining(runtime.getRemainingTimeMs()), 100)
    return () => window.clearInterval(timer)
  }, [runtime, snapshot.currentTargetNotes.map((note) => note.midiNumber).join(':'), snapshot.isPaused, snapshot.phase, snapshot.status])
  return remaining
}

function PracticeFocusHeader({
  onPauseToggle,
  onRequestEnd,
  remainingTimeMs,
  resumeBlocked,
  screen,
  settings,
  snapshot
}: {
  onPauseToggle: () => void
  onRequestEnd: () => void
  remainingTimeMs: number
  resumeBlocked: boolean
  screen: ScreenId
  settings: SightReadingSettings
  snapshot: SightRuntimeSnapshot
}): JSX.Element {
  const questionIndex = snapshot.phase === 'feedback'
    ? snapshot.completedQuestions
    : Math.min(settings.questionCount, snapshot.completedQuestions + 1)
  const answerTimeoutMs = getSightReadingAnswerTimeoutMs(settings)
  const progress = Math.max(0, Math.min(100, remainingTimeMs / answerTimeoutMs * 100))

  return (
    <header className="focus-header">
      <button className="focus-back" type="button" onClick={onRequestEnd}>
        <Icon name="arrow-left" /><span>结束本轮</span>
      </button>
      <div className="focus-progress">
        <span>识谱练习</span>
        <strong>第 {questionIndex} 题 <em>/ {settings.questionCount}</em></strong>
      </div>
      <div className="focus-actions">
        <MidiStatusButton compact />
        <button className="outline-action" disabled={resumeBlocked} type="button" onClick={onPauseToggle}>
          <Icon name={snapshot.isPaused ? 'play' : 'pause'} />
          <span>{snapshot.isPaused ? resumeBlocked ? '等待 MIDI' : '继续' : '暂停'}</span>
        </button>
      </div>
      <div className="focus-time-track" aria-label="本题剩余时间">
        <span
          className={screen === 'sight-wrong' || screen === 'sight-timeout' ? 'is-warning' : ''}
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
  )
}

function PracticeMetric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' | 'warning' }): JSX.Element {
  return <div className={`focus-metric ${tone ? `is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function SightFocusScreen({
  runtime,
  screen,
  settings,
  snapshot
}: {
  runtime: AndroidSightReadingRuntime
  screen: ScreenId
  settings: SightReadingSettings
  snapshot: SightRuntimeSnapshot
}): JSX.Element {
  const showEarlyEndConfirm = screen === 'sight-early-end'
  const isCorrect = snapshot.phase === 'feedback' && snapshot.result === 'correct'
  const isWrong = snapshot.phase === 'feedback' && snapshot.result === 'wrong_note'
  const isTimeout = snapshot.phase === 'feedback' && snapshot.result === 'timeout'
  const feedback: MusicNotationFeedback = isCorrect ? 'correct' : isWrong ? 'wrong_note' : isTimeout ? 'timeout' : null
  const targetName = snapshot.currentTargetNotes.map((note) => note.noteName).join(' + ') || '—'
  const intervalLabel = snapshot.currentIntervalLabel
  const midiStatus = presentMidiStatus(runtime)
  const transportPause = runtime.midiSource === 'bluetooth' && runtime.midiResumeRequired
  const resumeBlocked = transportPause && runtime.bluetoothSnapshot.connectionState !== 'CONNECTED'
  const pausedPrompt = transportPause
    ? resumeBlocked ? 'MIDI 已断开，练习已安全暂停' : 'MIDI 已恢复，请点击继续'
    : '练习已暂停'
  const remainingTimeMs = useRemainingTime(runtime, snapshot)
  const requestEnd = (): void => {
    runtime.pause()
    navigate('sight-early-end')
  }
  const continuePractice = (): void => {
    runtime.resume()
    navigate(getPracticeScreen(runtime))
  }
  const stopAndSave = (): void => {
    runtime.stop()
    navigate('sight-ready')
  }

  return (
    <div className={`focus-frame ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''} ${isTimeout ? 'is-timeout' : ''} ${snapshot.isPaused ? 'is-paused' : ''}`}>
      <PracticeFocusHeader
        onPauseToggle={() => snapshot.isPaused ? runtime.resume() : runtime.pause()}
        onRequestEnd={requestEnd}
        remainingTimeMs={remainingTimeMs}
        resumeBlocked={resumeBlocked}
        screen={screen}
        settings={settings}
        snapshot={snapshot}
      />
      <main className="focus-content">
        <div className="focus-prompt">
          <span>{getSightReadingPrompt({
            intervalLabel,
            noteMode: settings.noteMode,
            outcome: snapshot.result,
            paused: snapshot.isPaused,
            pausedPrompt
          })}</span>
          {!snapshot.isPaused && !isCorrect && !isWrong && !isTimeout && settings.noteNameVisible
            ? <strong>{targetName}</strong>
            : null}
          {!snapshot.isPaused && isCorrect ? <strong><Icon name="check" /> {targetName}</strong> : null}
          {!snapshot.isPaused && isWrong ? <strong><Icon name="close" /> 目标 {targetName} · 弹成 {snapshot.currentInput || '—'}</strong> : null}
          {!snapshot.isPaused && isTimeout ? <strong><Icon name="clock" /> 本题超时 · {targetName}</strong> : null}
        </div>
        <section className="focus-stage">
          <NotationPaper
            feedback={feedback}
            keySignature={settings.keySignature}
            label={settings.noteNameVisible || isCorrect || isWrong || isTimeout ? `当前题目 ${targetName}` : '当前识谱题目'}
            note={snapshot.currentNote?.notation}
            notes={snapshot.currentTargetNotes.map((note) => note.notation)}
            noteFeedback={isWrong ? null : feedback}
            staffMode={settings.staffMode}
          />
          {snapshot.isPaused ? (
            <div className="focus-paused-state">
              <Icon name="pause" size={32} />
              <strong>{transportPause ? midiStatus.label : '已暂停'}</strong>
              {transportPause ? <small>{resumeBlocked ? '重新连接后再继续' : '连接已恢复，需明确继续'}</small> : null}
            </div>
          ) : null}
        </section>
        <div className="focus-footer">
          <PracticeMetric label="完成" value={String(snapshot.completedQuestions)} />
          <PracticeMetric label="正确" value={String(snapshot.correctCount)} tone="success" />
          <PracticeMetric label="错误" value={String(snapshot.wrongCount)} tone={isWrong ? 'danger' : undefined} />
          <PracticeMetric label="超时" value={String(snapshot.timeoutCount)} tone={isTimeout ? 'warning' : undefined} />
          <PracticeMetric label="当前连对" value={String(snapshot.currentStreak)} />
          <PracticeMetric label="正确率" value={`${snapshot.accuracy}%`} />
        </div>
      </main>
      {showEarlyEndConfirm ? (
        <div className="early-end-backdrop">
          <section aria-labelledby="early-end-title" aria-modal="true" className="early-end-dialog" role="dialog">
            <span className="early-end-dialog__icon"><Icon name="stop" /></span>
            <div>
              <span className="eyebrow">识谱练习</span>
              <h1 id="early-end-title">结束本轮？</h1>
              <p>已完成 {snapshot.completedQuestions} / {settings.questionCount}。<br />结束后，已完成部分会保存到此设备。</p>
            </div>
            <div className="early-end-dialog__actions">
              <button className="secondary-action" type="button" onClick={continuePractice}>继续练习</button>
              <button className="primary-action" type="button" onClick={stopAndSave}>结束并保存</button>
            </div>
            <small>completionState = stopped · partialEvidence = true</small>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function SightResultScreen({
  report
}: {
  report: SightReadingSessionReport
}): JSX.Element {
  const primaryError = getPrimaryErrorNote(report)
  const primaryErrorCount = primaryError
    ? (report.wrongNoteCounts.find((entry) => entry.noteName === primaryError)?.count ?? 0)
      + (report.timeoutNoteCounts.find((entry) => entry.noteName === primaryError)?.count ?? 0)
    : 0

  return (
    <ProductFrame active="sight" title="本轮完成">
      <section className="result-layout">
        <div className="result-score">
          <span className="eyebrow">识谱练习结果</span>
          <div className="score-ring"><strong>{report.accuracy}</strong><span>%</span><small>正确率</small></div>
          <h1>{primaryError
            ? <>本轮正确率 {report.accuracy}%，<br />再留意这个易错音。</>
            : <>本轮练习已完成，<br />没有需要优先处理的音符错误。</>}</h1>
          <p>{STAFF_MODE_LABELS[report.staffMode]} · {report.keyName} · {report.totalQuestions} 题 · 固定 {report.answerTimeLimitSeconds} 秒</p>
        </div>
        <div className="result-details">
          <div className="result-metrics">
            <div><span>完成</span><strong>{report.completedQuestions}</strong></div>
            <div><span>正确</span><strong className="success-text">{report.correct}</strong></div>
            <div><span>错误</span><strong className="danger-text">{report.wrong}</strong></div>
            <div><span>超时</span><strong>{report.timeout}</strong></div>
            <div><span>平均反应</span><strong>{formatReactionTime(report.averageReactionMs)}</strong></div>
            <div><span>最高连对</span><strong>{report.bestStreak}</strong></div>
          </div>
          <div className="result-note">
            <span className="result-note__icon"><Icon name="info" /></span>
            <div>{primaryError ? (
              <><small>本轮最需留意</small><strong>{primaryError}</strong><p>这个目标音在本轮出现了 {primaryErrorCount} 次错误或超时。</p></>
            ) : (
              <><small>本轮最需留意</small><strong>暂无</strong><p>本轮没有发现需要优先处理的目标音。</p></>
            )}</div>
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

function HistoryScreen({ runtime }: { runtime: AndroidSightReadingRuntime }): JSX.Element {
  const history = runtime.historySnapshot
  const projection = projectSightReadingHistory(history.records)
  const { summary } = projection
  useEffect(() => {
    void runtime.refreshHistory()
  }, [runtime])

  const empty = projection.items.length === 0
  const overallAccuracy = formatHistoryPercentage(summary.overallAccuracy)
  const averageReaction = summary.averageReactionMs === null ? '—' : (summary.averageReactionMs / 1000).toFixed(2)
  const listStatus = history.status === 'loading'
    ? '正在同步本地记录'
    : history.status === 'error'
      ? `共 ${summary.totalSessions} 条 · 读取异常`
      : history.warning
        ? `共 ${summary.totalSessions} 条 · 部分记录不可用`
        : `共 ${summary.totalSessions} 条记录`
  return (
    <ProductFrame active="history" title="练习记录">
      <section className="history-layout">
        <div className="history-summary">
          <div>
            <span className="eyebrow">全部记录</span>
            <h1>{empty ? '还没有练习记录' : `已有 ${summary.totalSessions} 次练习记录`}</h1>
            <p>{empty
              ? '完成或提前结束并保存一轮识谱练习后，会在这里显示。'
              : `共完成 ${summary.totalCompletedQuestions} 题：正确 ${summary.totalCorrect}，错误 ${summary.totalWrong}，超时 ${summary.totalTimeout}。`}</p>
          </div>
          <div className="history-summary__stat"><strong>{overallAccuracy}{summary.overallAccuracy === null ? null : <small>%</small>}</strong><span>总体正确率</span></div>
          <div className="history-summary__stat"><strong>{averageReaction}{summary.averageReactionMs === null ? null : <small>s</small>}</strong><span>平均反应</span></div>
        </div>
        <div className="history-list">
          <div className="list-heading"><h2>最近练习</h2><span>{listStatus}</span></div>
          <div className="history-list__rows">
            {projection.items.length > 0 ? projection.items.map((item) => (
              <article className={`history-row is-${item.completionState}`} key={item.recordId}>
                <span className="history-row__mark"><Icon name="book" /></span>
                <span className="history-row__copy">
                  <small>{formatHistoryTimestamp(item.endedAt)} · {item.statusLabel}</small>
                  <strong>{item.title}</strong>
                  <em>{item.settingsSummary} · 完成 {item.completed}/{item.plannedQuestionCount} · 正确 {item.correct} / 错误 {item.wrong} / 超时 {item.timeout} · {formatHistoryDuration(item.durationMs)}</em>
                </span>
                <span className="history-row__score"><strong>{formatHistoryPercentage(item.accuracy)}%</strong><small>正确率</small></span>
              </article>
            )) : (
              <div className="history-empty" role={history.status === 'error' ? 'alert' : 'status'}>
                <span className="history-row__mark"><Icon name={history.status === 'error' ? 'info' : 'history'} /></span>
                <div><strong>{history.status === 'loading' ? '正在读取本地记录…' : history.status === 'error' ? '暂时无法读取练习记录' : '暂无真实练习记录'}</strong><p>{history.status === 'error' ? '已保存的数据不会被替换；稍后重新进入记录页可再次读取。' : '完成一轮识谱练习后，真实结果会显示在这里。'}</p></div>
              </div>
            )}
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

function SettingSelect<Value extends string | number>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string
  onChange: (value: Value) => void
  options: readonly { label: string; value: Value }[]
  value: Value
}): JSX.Element {
  return (
    <select
      aria-label={ariaLabel}
      className="setting-select"
      value={value}
      onChange={(event) => onChange(event.target.value as Value)}
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function SettingsScreen({
  onSettingsChange,
  settings,
  theme,
  onThemeChange
}: {
  onSettingsChange: (changes: Partial<SightReadingSettings>) => void
  settings: SightReadingSettings
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
}): JSX.Element {
  const answerTimeLimitSeconds = getSightReadingAnswerTimeoutMs(settings) / 1000
  const { runtime } = useMidiUi()
  const { snapshot: updater } = useUpdaterUi()
  const midiStatus = presentMidiStatus(runtime)
  const persistence = runtime.persistenceSnapshot
  const settingsStatus = persistence.settingsStatus === 'saving'
    ? '正在保存'
    : persistence.settingsStatus === 'error'
      ? '保存失败'
      : persistence.settingsStatus === 'saved' ? '已保存到此设备' : '使用默认设置'
  const updaterLabel = updater.status === 'updateAvailable'
    ? '发现新版本'
    : updater.status === 'readyToInstall'
      ? '已验证'
      : updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'verifying'
        ? '处理中'
        : updater.status === 'error' ? '需要检查' : '检查更新'
  return (
    <ProductFrame active="settings" title="设置">
      <section className="settings-layout">
        <div className="settings-column">
          <div className="settings-group">
            <div className="group-title"><span>设备</span><small>Android 原生 BLE MIDI</small></div>
            <SettingRow
              description={midiStatus.detail}
              icon="bluetooth"
              onClick={() => navigate('midi')}
              title={runtime.bluetoothSnapshot.connectedDeviceName ?? 'Roland FP-30X'}
              action={<span className={`connected-label is-${midiStatus.tone}`}><i />{midiStatus.label}</span>}
            />
          </div>
          <div className="settings-group settings-group--sight">
            <div className="group-title"><span>识谱练习</span><small>下一轮生效 · {settingsStatus}</small></div>
            <SettingRow
              description="高音谱表、低音谱表或大谱表"
              icon="book"
              title="默认谱表"
              action={<SettingSelect
                ariaLabel="默认谱表"
                value={settings.staffMode}
                onChange={(staffMode: SightReadingStaffMode) => onSettingsChange({ staffMode })}
                options={[
                  { value: 'treble', label: '高音谱表' },
                  { value: 'bass', label: '低音谱表' },
                  { value: 'grand', label: '大谱表' }
                ]}
              />}
            />
            <SettingRow
              description="支持现有 15 个大调"
              icon="book"
              title="调性"
              action={<SettingSelect
                ariaLabel="调性"
                value={settings.keySignature}
                onChange={(keySignature: MajorKeyId) => onSettingsChange({ keySignature })}
                options={MAJOR_KEY_DISPLAY_SIGNATURES.map((key) => ({ value: key.id, label: key.displayName }))}
              />}
            />
            <SettingRow
              description="单音保持原有首音判定；双音使用 150ms 同时音捕获"
              icon="book"
              title="音符数量"
              action={<SettingSelect
                ariaLabel="音符数量"
                value={settings.noteMode}
                onChange={(noteMode: SightReadingNoteMode) => onSettingsChange({ noteMode })}
                options={[
                  { value: 'single', label: '单音' },
                  { value: 'double', label: '双音' }
                ]}
              />}
            />
            <SettingRow
              description="调内音或包含临时变音"
              icon="chart"
              title="音符内容"
              action={settings.noteMode === 'double'
                ? <strong>双音固定调内</strong>
                : <SettingSelect
                    ariaLabel="音符内容"
                    value={settings.notePoolMode}
                    onChange={(notePoolMode: SightReadingNotePoolMode) => onSettingsChange({ notePoolMode })}
                    options={[
                      { value: 'diatonic', label: '调内音' },
                      { value: 'chromatic', label: '含临时变音' }
                    ]}
                  />}
            />
            <SettingRow
              description="10、20、50 或 100 题"
              icon="chart"
              title="默认题数"
              action={<SettingSelect
                ariaLabel="默认题数"
                value={String(settings.questionCount)}
                onChange={(value: string) => onSettingsChange({ questionCount: Number(value) as SightReadingQuestionCount })}
                options={[10, 20, 50, 100].map((value) => ({ value: String(value), label: String(value) }))}
              />}
            />
            <SettingRow description={`当前模式固定为 ${answerTimeLimitSeconds} 秒`} icon="clock" title="每题时限" action={<strong>{answerTimeLimitSeconds} 秒</strong>} />
            <SettingRow
              description={settings.noteNameVisible ? '答题前显示目标音名' : '答题前不显示目标音名'}
              icon="info"
              title="显示音名"
              action={(
                <button
                  aria-label={`显示音名已${settings.noteNameVisible ? '开启' : '关闭'}`}
                  className={`mock-switch ${settings.noteNameVisible ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => onSettingsChange({ noteNameVisible: !settings.noteNameVisible })}
                >
                  <small>{settings.noteNameVisible ? 'On' : 'Off'}</small><i />
                </button>
              )}
            />
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
            <SettingRow description="查看版本与更新状态" icon="refresh" onClick={() => navigate('update')} title="检查更新" action={<strong>{updaterLabel}</strong>} />
            <SettingRow description="Android Tablet Personal Edition" icon="info" title="当前版本" action={<strong>{updater.installed ? `V${updater.installed.versionName}` : '正在读取'}</strong>} />
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

function MidiScreen(): JSX.Element {
  const { runtime } = useMidiUi()
  const midi = runtime.bluetoothSnapshot
  const status = presentMidiStatus(runtime)
  const scanActive = midi.connectionState === 'SCANNING' || midi.connectionState === 'DEVICE_FOUND'
  const lastEvent = midi.diagnostics.lastNormalizedEvent
  const action = (() => {
    if (midi.connectionState === 'UNSUPPORTED') {
      return { label: '此设备不支持', disabled: true, run: () => {} }
    }
    if (midi.connectionState === 'PERMISSION_REQUIRED' || midi.connectionState === 'PERMISSION_DENIED') {
      return { label: '允许附近设备', disabled: false, run: () => { void runtime.bluetooth.requestPermissions() } }
    }
    if (midi.connectionState === 'BLUETOOTH_OFF') {
      return { label: '请先打开系统蓝牙', disabled: true, run: () => {} }
    }
    if (midi.connectionState === 'CONNECTED') {
      return { label: '断开 MIDI', disabled: false, run: () => { void runtime.bluetooth.disconnect() } }
    }
    if (scanActive) {
      return { label: '停止扫描', disabled: false, run: () => { void runtime.bluetooth.stopScan() } }
    }
    return { label: '扫描 MIDI 设备', disabled: false, run: () => { void runtime.bluetooth.scan() } }
  })()

  return (
    <div className="standalone-frame">
      <ProductHeader title="MIDI 连接" onBack={() => navigate('settings')} />
      <main className="standalone-content">
        <section className="device-hero">
          <div className="device-orbit"><span><Icon name="bluetooth" size={42} /></span><i /><i /><i /></div>
          <span className={`connected-label large is-${status.tone}`}><i />{status.label}</span>
          <h1>{midi.connectedDeviceName ?? 'Roland FP-30X'}</h1>
          <p>{status.detail}。使用 Android 原生 BLE MIDI / MidiManager 接收钢琴输入，不需要经典蓝牙音频配对。</p>
          <button className="secondary-action midi-primary-action" disabled={action.disabled} type="button" onClick={action.run}>
            <Icon name="refresh" />{action.label}
          </button>
        </section>
        <section className="device-details">
          <div><small>设备类型</small><strong>BLE MIDI · receive only</strong></div>
          <div><small>输入端口</small><strong>{midi.midiPortState}</strong></div>
          <div><small>最近活动</small><strong>{lastEvent ? `${lastEvent.type} · ${lastEvent.midiNumber ?? '—'}` : '等待真实输入'}</strong></div>
          <div><small>应用发声</small><strong>关闭</strong></div>
        </section>
        {midi.discoveredDevices.length > 0 ? (
          <section className="midi-device-list" aria-label="发现的 Bluetooth MIDI 设备">
            <div className="list-heading"><h2>发现的 MIDI 设备</h2><span>{midi.discoveredDevices.length} 个候选</span></div>
            <div>
              {midi.discoveredDevices.map((device) => {
                const connected = midi.connectionState === 'CONNECTED' && midi.connectedDeviceId === device.id
                return (
                  <button
                    className={connected ? 'is-connected' : ''}
                    disabled={midi.connectionState === 'CONNECTING' || connected}
                    key={device.id}
                    type="button"
                    onClick={() => { void runtime.bluetooth.connect(device.id) }}
                  >
                    <span><Icon name="bluetooth" /></span>
                    <span><strong>{device.name}</strong><small>{device.manufacturer ?? device.product ?? '标准 BLE MIDI'}</small></span>
                    <em>{connected ? '已连接' : '连接'}</em>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
        <section className="device-help">
          <span><Icon name="info" /></span>
          <div>
            <strong>{midi.lastError ? '连接诊断' : '没有发现或收到琴键输入？'}</strong>
            <p>{midi.lastError ?? '确认 FP-30X 已开机且 Bluetooth MIDI 可用，然后重新扫描。A3.1 不要求反复进行经典蓝牙配对。'}</p>
          </div>
          <button className="secondary-action" disabled={midi.bluetoothState !== 'ON' || midi.permissionState !== 'GRANTED'} type="button" onClick={() => { void runtime.bluetooth.scan() }}>
            <Icon name="refresh" />重新扫描
          </button>
        </section>
      </main>
    </div>
  )
}

function updaterStatusCopy(status: UpdaterStatus): { eyebrow: string; title: string; detail: string } {
  const copy: Record<UpdaterStatus, { eyebrow: string; title: string; detail: string }> = {
    idle: { eyebrow: '更新状态', title: '检查应用更新', detail: '仅在你点击后连接公开的 HTTPS 更新服务。' },
    checking: { eyebrow: '正在检查', title: '正在获取更新信息', detail: '练习、记录与 MIDI 功能不会被更新检查阻塞。' },
    upToDate: { eyebrow: '更新状态', title: '当前没有可用的新版本', detail: '版本判断只使用 Android versionCode。' },
    updateAvailable: { eyebrow: '发现更新', title: '有新的应用版本', detail: '下载后还会验证大小、哈希、包名、版本与永久签名。' },
    downloading: { eyebrow: '正在下载', title: '正在下载更新包', detail: '更新包保存在应用私有缓存中，下载完成前不可安装。' },
    verifying: { eyebrow: '安全验证', title: '正在验证更新包', detail: '所有验证步骤都必须通过，没有跳过按钮。' },
    readyToInstall: { eyebrow: '验证完成', title: '更新包可以交给系统安装', detail: '点击后仍需在 Android 系统安装器中明确确认。' },
    installPermissionRequired: { eyebrow: '需要系统授权', title: '允许此应用安装更新', detail: '打开系统设置并授权后，返回应用重新确认，再次点击安装。' },
    installerLaunched: { eyebrow: '系统安装器', title: '已打开 Android 系统安装器', detail: '这不代表安装已经成功；完成后重新打开应用确认真实版本。' },
    error: { eyebrow: '更新未完成', title: '暂时无法完成这次更新操作', detail: '该问题只影响更新功能，练习与本地记录仍可正常使用。' }
  }
  return copy[status]
}

function UpdateScreen(): JSX.Element {
  const { controller, snapshot } = useUpdaterUi()
  const copy = updaterStatusCopy(snapshot.status)
  const currentVersion = snapshot.installed ? `V${snapshot.installed.versionName} · ${snapshot.installed.versionCode}` : '正在读取'
  const targetVersion = snapshot.manifest ? `V${snapshot.manifest.versionName} · ${snapshot.manifest.versionCode}` : '—'
  const action: { label: string; disabled: boolean; run: () => void; secondary?: boolean } = (() => {
    if (snapshot.status === 'checking' || snapshot.status === 'verifying') {
      return { label: '处理中…', disabled: true, run: () => {} }
    }
    if (snapshot.status === 'downloading') {
      return { label: '取消下载', disabled: false, run: () => { void controller.cancelDownload() }, secondary: true }
    }
    if (snapshot.status === 'updateAvailable') {
      return { label: '下载更新', disabled: false, run: () => { void controller.download() } }
    }
    if (snapshot.status === 'readyToInstall') {
      return { label: '交给系统安装', disabled: false, run: () => { void controller.install() } }
    }
    if (snapshot.status === 'installPermissionRequired') {
      return { label: '打开系统设置', disabled: false, run: () => { void controller.openInstallSettings() } }
    }
    if (snapshot.status === 'installerLaunched') {
      return { label: '等待系统安装确认', disabled: true, run: () => {} }
    }
    if (snapshot.status === 'error') {
      if (!snapshot.retryAction) return { label: '无法继续', disabled: true, run: () => {} }
      return { label: snapshot.retryAction === 'download' ? '重新下载' : snapshot.retryAction === 'install' ? '重试安装' : '重新检查', disabled: false, run: () => { void controller.retry() } }
    }
    return { label: snapshot.status === 'upToDate' ? '再次检查' : '检查更新', disabled: false, run: () => { void controller.check() } }
  })()
  const icon: IconName = snapshot.status === 'error'
    ? 'close'
    : snapshot.status === 'upToDate' || snapshot.status === 'readyToInstall'
      ? 'check'
      : 'refresh'

  return (
    <div className="standalone-frame">
      <ProductHeader title="检查更新" onBack={() => navigate('settings')} />
      <main className="update-content">
        <section className={`update-card is-${snapshot.status}`} aria-live="polite">
          <div className="update-illustration"><Icon name={icon} size={52} /><span /></div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{snapshot.errorMessage ?? copy.detail}</p>
          <div className="version-line"><span>当前版本</span><strong>{currentVersion}</strong></div>
          <div className="version-line"><span>目标版本</span><strong>{targetVersion}</strong></div>
          {snapshot.manifest && snapshot.status === 'updateAvailable' ? (
            <div className="update-release-notes" aria-label="版本说明">
              <strong>本次更新</strong>
              {snapshot.manifest.releaseNotes.length > 0
                ? <ul>{snapshot.manifest.releaseNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
                : <p>此版本没有附加说明。</p>}
            </div>
          ) : null}
          {snapshot.status === 'downloading' && snapshot.progress ? (
            <div className="update-progress" aria-label={`下载进度 ${Math.round(snapshot.progress.percent)}%`}>
              <div><span style={{ width: `${snapshot.progress.percent}%` }} /></div>
              <small>{Math.round(snapshot.progress.percent)}% · {Math.round(snapshot.progress.receivedBytes / 1024)} / {Math.round(snapshot.progress.totalBytes / 1024)} KiB</small>
            </div>
          ) : null}
          <button className={`${action.secondary ? 'secondary-action' : 'primary-action'} is-wide`} disabled={action.disabled} type="button" onClick={action.run}>
            <Icon name={snapshot.status === 'readyToInstall' ? 'chevron' : 'refresh'} />{action.label}
          </button>
          {snapshot.status === 'installPermissionRequired' ? (
            <button className="update-inline-action" type="button" onClick={() => { void controller.refreshInstallPermission() }}>我已返回，重新检查授权</button>
          ) : null}
          <small className="update-security-note">安装始终由 Android 系统确认。更新失败不会影响离线练习与本地记录。</small>
        </section>
      </main>
    </div>
  )
}

function ReviewDock({
  active,
  runtime,
  snapshot
}: {
  active: ScreenId
  runtime: AndroidSightReadingRuntime
  snapshot: SightRuntimeSnapshot
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [midiNumber, setMidiNumber] = useState('60')
  const metrics = useViewportMetrics()
  const activeLabel = screens.find((screen) => screen.id === active)?.shortLabel ?? '首页'
  const canAnswer = snapshot.status === 'running' && snapshot.phase === 'answering' && !snapshot.isPaused
  const reports = runtime.reports.list()
  const latestReport = runtime.reports.latest()
  const nativeDebug = Capacitor.isNativePlatform()
  const midi = runtime.bluetoothSnapshot
  const midiStatus = presentMidiStatus(runtime)
  const developmentInputActive = runtime.midiSource === 'development'

  const selectScreen = (target: ScreenId): void => {
    if (target === 'sight-active' && snapshot.status !== 'running') runtime.start()
    navigate(target)
    setOpen(false)
  }

  return (
    <div className={`review-dock ${open ? 'is-open' : ''}`}>
      <button className="review-dock__trigger" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{nativeDebug ? 'A3.1 · DEBUG' : 'A3.1 · DEV'}</span><strong>{activeLabel}</strong><Icon name="chevron" size={16} />
      </button>
      {open ? (
        <div className="review-dock__menu">
          <div><strong>Human UI Review</strong><button aria-label="关闭状态列表" type="button" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button></div>
          {screens.map((screen) => (
            <button
              className={screen.id === active ? 'is-active' : ''}
              key={screen.id}
              type="button"
              onClick={() => selectScreen(screen.id)}
            >
              <span>{screen.label}</span>{screen.id === active ? <Icon name="check" size={18} /> : null}
            </button>
          ))}
          {SHOW_DEVELOPMENT_TOOLS ? (
            <section className="developer-midi" aria-label="开发模拟 MIDI 控制">
              <div className="developer-midi__heading">
                <span>DEVELOPMENT ONLY</span>
                <strong>MIDI 输入源</strong>
              </div>
              <div className="developer-midi__source" role="group" aria-label="DEBUG MIDI 输入源">
                <button className={!developmentInputActive ? 'is-active' : ''} type="button" onClick={() => runtime.setMidiInputSource('bluetooth')}>真实蓝牙 MIDI</button>
                <button className={developmentInputActive ? 'is-active' : ''} type="button" onClick={() => runtime.setMidiInputSource('development')}>开发模拟 MIDI</button>
              </div>
              <div className="developer-midi__status">
                <span>目标 <strong>{snapshot.currentTargetNotes.map((note) => note.noteName).join(' + ') || '—'}</strong></span>
                <span>阶段 <strong>{snapshot.phase}</strong></span>
                <span>来源 <strong>{developmentInputActive ? 'DEVELOPMENT' : 'REAL BLUETOOTH'}</strong></span>
              </div>
              <div className="developer-midi__actions">
                <button disabled={!canAnswer || !developmentInputActive} type="button" onClick={() => runtime.sendCorrect()}>答对</button>
                <button disabled={!canAnswer || !developmentInputActive} type="button" onClick={() => runtime.sendWrong()}>答错</button>
              </div>
              <div className="developer-midi__exact">
                <input
                  aria-label="指定 MIDI note number"
                  inputMode="numeric"
                  max="127"
                  min="0"
                  type="number"
                  value={midiNumber}
                  onChange={(event) => setMidiNumber(event.target.value)}
                />
                <button disabled={!canAnswer || !developmentInputActive} type="button" onClick={() => runtime.sendMidi(Number(midiNumber))}>发送 NOTE_ON</button>
              </div>
              <button className="developer-midi__restart" type="button" onClick={() => { runtime.restart(); navigate('sight-active') }}>
                重新开始开发会话
              </button>
              <small>normalized NOTE_ON → shared controller；真实 {getSightReadingAnswerTimeoutMs(runtime.settings) / 1000} 秒 timeout 没有快捷按钮。</small>
              <small>内存报告 {reports.length} 份{latestReport ? ` · 最近：${latestReport.completionState} / ${latestReport.completedQuestions} 题` : ''}</small>
              <div className="bluetooth-midi-diagnostic">
                <strong>BLUETOOTH MIDI DIAGNOSTICS</strong>
                <span><b>permission</b>{midi.permissionState}</span>
                <span><b>Android API</b>{midi.androidApiLevel || 'browser'}</span>
                <span><b>Bluetooth</b>{midi.bluetoothState}</span>
                <span><b>connection</b>{midi.connectionState}</span>
                <span><b>device</b>{midi.connectedDeviceName ?? midi.discoveredDevices[0]?.name ?? '—'}</span>
                <span><b>identity</b>{midi.connectedDeviceId ?? midi.discoveredDevices[0]?.id ?? '—'}</span>
                <span><b>source</b>{midi.discoveredDevices[0]?.source ?? '—'}</span>
                <span><b>service</b>{midi.discoveredDevices[0]?.serviceUuids?.join(', ') ?? midi.scanServiceUuid}</span>
                <span><b>port</b>{midi.midiPortState}</span>
                <span><b>messages</b>{midi.diagnostics.receivedMessageCount}</span>
                <span><b>raw</b>{midi.diagnostics.lastRawMessage}</span>
                <span><b>normalized</b>{midi.diagnostics.lastNormalizedEvent
                  ? `${midi.diagnostics.lastNormalizedEvent.type} ${midi.diagnostics.lastNormalizedEvent.midiNumber ?? ''}`
                  : '—'}</span>
                <span><b>event id</b>{midi.diagnostics.lastNormalizedEvent?.id ?? '—'}</span>
                <span><b>timestamp</b>{midi.diagnostics.lastNormalizedEvent?.timestamp.toFixed(3) ?? '—'}</span>
                <span><b>native ns</b>{midi.diagnostics.lastNativeTimestampNanos ?? '—'}</span>
                <span><b>channel</b>{midi.diagnostics.lastChannel ?? '—'}</span>
                <span><b>controller</b>{midi.diagnostics.lastController}</span>
                <span><b>disconnect/reconnect</b>{midi.disconnectCount}/{midi.reconnectCount}</span>
                <span><b>status</b>{midiStatus.label}</span>
              </div>
            </section>
          ) : null}
          {SHOW_DEVELOPMENT_TOOLS && metrics ? (
            <div className="viewport-diagnostic">
              <strong>{nativeDebug ? 'DEVICE-001-APP viewport' : 'DEVICE-001 viewport'}</strong>
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

function PersistenceErrorNotice({ runtime }: { runtime: AndroidSightReadingRuntime }): JSX.Element | null {
  const persistence = runtime.persistenceSnapshot
  if (persistence.settingsStatus !== 'error' && persistence.reportStatus !== 'error') return null
  const retry = async (): Promise<void> => {
    if (persistence.settingsStatus === 'error') await runtime.retrySettingsPersistence()
    if (persistence.reportStatus === 'error') await runtime.retryReportPersistence()
  }
  return (
    <aside className="persistence-error" role="alert">
      <span><strong>本地保存失败</strong><small>当前练习事实仍保留，可重试写入此设备。</small></span>
      <button type="button" onClick={() => { void retry() }}>重试</button>
    </aside>
  )
}

function App({ runtime }: { runtime: AndroidSightReadingRuntime }): JSX.Element {
  const snapshot = useSightReadingRuntime(runtime)
  const updater = useMemo(() => createAndroidUpdaterController(), [])
  const updaterSnapshot = useUpdaterSnapshot(updater)
  const settings = runtime.settings
  const [screen, setScreen] = useState<ScreenId>(() => readScreen())
  const screenRef = useRef<ScreenId>(screen)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    void runtime.startMidi()
  }, [runtime])

  useEffect(() => {
    void updater.initialize()
    return () => { void updater.dispose() }
  }, [updater])

  useEffect(() => {
    const updateScreen = (): void => setScreen(readScreen())
    window.addEventListener('hashchange', updateScreen)
    if (!window.location.hash) navigate('home')
    return () => window.removeEventListener('hashchange', updateScreen)
  }, [])

  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let disposed = false
    const removeListeners: Array<() => Promise<void>> = []

    void CapacitorApp.addListener('backButton', () => {
      const currentScreen = screenRef.current
      const currentSnapshot = runtime.snapshot
      const practiceScreens: ScreenId[] = [
        'sight-active', 'sight-correct', 'sight-wrong', 'sight-timeout'
      ]

      if (currentScreen === 'sight-early-end' && currentSnapshot.status === 'running') {
        runtime.resume()
        navigate(getPracticeScreen(runtime))
        return
      }

      if (practiceScreens.includes(currentScreen) && currentSnapshot.status === 'running') {
        runtime.pause()
        navigate('sight-early-end')
        return
      }

      if (currentSnapshot.status === 'running') {
        navigate(getPracticeScreen(runtime))
        return
      }

      const parentScreen: Partial<Record<ScreenId, ScreenId>> = {
        'sight-ready': 'home',
        'sight-result': 'home',
        history: 'home',
        settings: 'home',
        midi: 'settings',
        update: 'settings'
      }
      const parent = parentScreen[currentScreen]
      if (parent) {
        navigate(parent)
        return
      }

      void CapacitorApp.minimizeApp()
    }).then((handle) => {
      if (disposed) {
        void handle.remove()
        return
      }
      removeListeners.push(() => handle.remove())
    })

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void runtime.resumeFromAppLifecycle()
        void updater.refreshInstallPermission()
      } else {
        void runtime.suspendForAppLifecycle()
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove()
        return
      }
      removeListeners.push(() => handle.remove())
    })

    return () => {
      disposed = true
      for (const remove of removeListeners) void remove()
    }
  }, [runtime, updater])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const dynamicScreens: ScreenId[] = [
      'sight-active', 'sight-correct', 'sight-wrong',
      'sight-timeout', 'sight-early-end', 'sight-result'
    ]
    if (!dynamicScreens.includes(screen) || screen === 'sight-early-end') return
    const expected = getPracticeScreen(runtime)
    if (screen !== expected) navigate(expected)
  }, [runtime, screen, snapshot.phase, snapshot.result, snapshot.status])

  const startPractice = (): void => {
    runtime.start()
    navigate('sight-active')
  }

  const content = (() => {
    switch (screen) {
      case 'home': return <HomeScreen settings={settings} />
      case 'sight-ready': return <SightReadyScreen onStart={startPractice} settings={settings} />
      case 'sight-active':
      case 'sight-correct':
      case 'sight-wrong':
      case 'sight-timeout':
      case 'sight-early-end':
        return <SightFocusScreen runtime={runtime} screen={screen} settings={settings} snapshot={snapshot} />
      case 'sight-result':
        return snapshot.report
          ? <SightResultScreen report={snapshot.report} />
          : <SightReadyScreen onStart={startPractice} settings={settings} />
      case 'history': return <HistoryScreen runtime={runtime} />
      case 'settings': return (
        <SettingsScreen
          onSettingsChange={(changes) => { void runtime.updateSettings(changes) }}
          onThemeChange={setTheme}
          settings={settings}
          theme={theme}
        />
      )
      case 'midi': return <MidiScreen />
      case 'update': return <UpdateScreen />
    }
  })()

  return (
    <UpdaterUiContext.Provider value={{ controller: updater, snapshot: updaterSnapshot }}>
      <MidiUiContext.Provider value={{ runtime }}>
        <div className="tablet-app">{content}</div>
        <PersistenceErrorNotice runtime={runtime} />
        {SHOW_DEVELOPMENT_TOOLS ? <ReviewDock active={screen} runtime={runtime} snapshot={snapshot} /> : null}
        <OrientationNotice />
      </MidiUiContext.Provider>
    </UpdaterUiContext.Provider>
  )
}

function AndroidAppBootstrap(): JSX.Element {
  const [runtime, setRuntime] = useState<AndroidSightReadingRuntime | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void createBrowserAndroidSightReadingRuntime({
      nativeBluetooth: Capacitor.isNativePlatform()
    }).then((createdRuntime) => {
      if (active) setRuntime(createdRuntime)
      else void createdRuntime.dispose()
    }).catch((error) => {
      if (active) setInitializationError(String(error))
    })
    return () => { active = false }
  }, [])

  if (initializationError) {
    return (
      <main className="persistence-loading" role="alert">
        <span className="eyebrow">本地数据</span>
        <h1>无法初始化应用数据</h1>
        <p>{initializationError}</p>
        <button className="primary-action" type="button" onClick={() => window.location.reload()}>重试</button>
      </main>
    )
  }
  if (!runtime) {
    return <main className="persistence-loading" aria-live="polite"><span className="eyebrow">本地数据</span><h1>正在载入练习设置…</h1></main>
  }
  return <App runtime={runtime} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AndroidAppBootstrap />
  </StrictMode>
)
