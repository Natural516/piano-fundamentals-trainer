import { Component, StrictMode, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'
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
import { openSourceRepository } from './externalLinks'
import { UpdaterController, type UpdaterSnapshot, type UpdaterStatus } from './updaterCore'
import { getSightReadingPrompt } from './sightReadingPresentation'
import { presentSightReadingFeedback } from './sightReadingFeedbackPresentation'
import { ChordGrandStaff } from './ChordGrandStaff'
import {
  presentChordPractice,
  type ChordPracticePresentation
} from './chordPractice/presentation'
import {
  CHORD_MOCK_CASES,
  CHORD_MOCK_STATES,
  DEFAULT_CHORD_MOCK_CASE_ID,
  getChordMockCase,
  getChordMockState,
  type ChordWrittenPitch,
  type ChordMockStateId
} from './chordPracticeMocks'
import { ChordPracticeRuntime, type ChordRuntimeSnapshot } from './chordPractice/runtime'
import type { ChordPracticeMode } from './chordPractice/runtime'
import {
  CHORD_SEQUENTIAL_MAJOR_KEY_IDS,
  formatWrittenPitchClass,
  getChordSequentialKeyTonic,
  type ChordPracticeQuestion,
  type ChordQuestionCount,
  type ChordSequentialMajorKeyId
} from './musicTheory/chords'
import {
  ChordSettingsRepository,
  DEFAULT_CHORD_SETTINGS,
  type ChordSettings
} from './chordPractice/settings'
import { CapacitorPreferencesBackend } from './androidPersistence'
import { useTranslation } from 'react-i18next'
import { AppPreferencesRepository } from './localization/appPreferences'
import { LocalizationService } from './localization/localizationService'
import { LocaleProvider } from './localization/LocaleProvider'
import { LanguageSetting } from './localization/LanguageSetting'
import { IntervalDisplayName, SightNoteValue } from './localization/LegacyDisplayValues'
import { getSettingsThemeDisplayName, presentLocalizedMidiStatus } from './localization/midiPresentation'
import {
  DEFAULT_INTERVAL_PRACTICE_SETTINGS,
  INTERVAL_QUESTION_COUNT_OPTIONS,
  IntervalPracticeSessionRuntime,
  IntervalPracticeSettingsRepository,
  IntervalReportPersistenceCoordinator,
  IntervalReportRepository,
  getDifficultIntervals,
  presentIntervalPractice,
  projectIntervalHistory,
  resolveIntervalReportById,
  type IntervalPersistenceSnapshot,
  type IntervalPracticeReportDraft,
  type IntervalPracticeReportV1,
  type IntervalPracticeSettings,
  type IntervalQuestionCount,
  type IntervalSessionSnapshot
} from './intervalPractice'
import { ActivePracticeSessionHost } from './activePracticeSession'
import {
  ChordReportPersistenceCoordinator,
  ChordReportRepository,
  type ChordPersistenceSnapshot
} from './chordPractice/persistence'
import { projectChordHistory } from './chordPractice/historyProjection'
import { projectMixedPracticeHistory, type MixedPracticeHistoryItem } from './mixedHistoryProjection'
import {
  projectHistoryDashboard,
  type HistoryDailyBucket,
  type HistoryDashboardFilter,
  type HistoryDashboardRange
} from './historyDashboardProjection'
import {
  projectChordReportDetail,
  resolveChordReportById
} from './chordPractice/reportDetailProjection'
import {
  AVAILABLE_SCALE_TYPE_OPTIONS,
  NATURAL_MAJOR_TOOL_ROOT_IDS,
  formatScaleToolNoteName,
  getNaturalMajorToolResult,
  type ScaleTypeId
} from './scaleKeySignatureTool'
import {
  CHORD_QUERY_INPUT_ACCIDENTALS,
  CHORD_QUERY_NOTE_LETTERS,
  CHORD_QUERY_TYPE_GROUPS,
  getChordQueryResult,
  type ChordQueryInputAccidental,
  type ChordQueryNoteLetter,
  type ChordQueryTypeId
} from './chordQueryTool'
import {
  INTERVAL_QUERY_LETTERS,
  INTERVAL_QUERY_OCTAVES,
  INTERVAL_QUERY_VISIBLE_ACCIDENTALS,
  formatIntervalAccidental,
  getIntervalQueryResult,
  type IntervalQueryLetter,
  type IntervalQueryOctave,
  type IntervalQueryVisibleAccidental,
  type IntervalQueryWrittenPitch
} from './intervalQueryTool'
import {
  createPracticeKeepAwakeController,
  shouldKeepPracticeAwake
} from './practiceKeepAwake'
import {
  applyThemeDefinition,
  resolveInitialThemeId,
  resolveTheme,
  type ThemeDefinition,
  type ThemeId
} from './theme/themeRegistry'
import { THEME_PACKAGE_ERRORS, ThemeRuntimeManager, type InstalledThemeRecord, type ThemeRuntimeSnapshot } from './theme/themePackageRuntime'
import './styles.css'

declare const __QA_BUILD__: boolean
declare const __ANDROID_VERSION_CODE__: number
declare const __ANDROID_VERSION_NAME__: string

type ScreenId =
  | 'home'
  | 'practice'
  | 'tools'
  | 'chord-query-tool'
  | 'scale-key-signature-tool'
  | 'interval-query-tool'
  | 'sight-ready'
  | 'sight-active'
  | 'sight-correct'
  | 'sight-wrong'
  | 'sight-timeout'
  | 'sight-early-end'
  | 'sight-result'
  | 'chord-mode-select'
  | 'chord-practice'
  | 'interval-practice'
  | 'interval-active'
  | 'interval-result'
  | 'interval-report-detail'
  | 'chord-report-detail'
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
  | 'chevron-down'
  | 'clock'
  | 'close'
  | 'history'
  | 'home'
  | 'info'
  | 'grid'
  | 'moon'
  | 'pause'
  | 'play'
  | 'refresh'
  | 'settings'
  | 'stop'
  | 'sun'
  | 'tools'

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
  { id: 'practice', label: '练习', shortLabel: '练习' },
  { id: 'tools', label: '乐理工具', shortLabel: '工具' },
  { id: 'chord-query-tool', label: '和弦查询', shortLabel: '和弦查询' },
  { id: 'scale-key-signature-tool', label: '音阶与调号', shortLabel: '音阶与调号' },
  { id: 'interval-query-tool', label: '音程查询', shortLabel: '音程查询' },
  { id: 'sight-ready', label: '识谱 · 准备', shortLabel: 'READY' },
  { id: 'sight-active', label: '识谱 · 进行中', shortLabel: 'ACTIVE' },
  { id: 'sight-correct', label: '识谱 · 正确反馈', shortLabel: 'CORRECT' },
  { id: 'sight-wrong', label: '识谱 · 错误反馈', shortLabel: 'WRONG' },
  { id: 'sight-timeout', label: '识谱 · 超时反馈', shortLabel: 'TIMEOUT' },
  { id: 'sight-early-end', label: '识谱 · 提前结束确认', shortLabel: 'EARLY END' },
  { id: 'sight-result', label: '识谱 · 结果', shortLabel: 'RESULT' },
  { id: 'chord-mode-select', label: '和弦 · 方式选择', shortLabel: 'CHORD MODE' },
  { id: 'chord-practice', label: '和弦 · 静态练习', shortLabel: 'CHORD V1' },
  { id: 'interval-practice', label: '音程 · 静态练习', shortLabel: 'INTERVAL V1' },
  { id: 'interval-active', label: '音程 · 进行中', shortLabel: 'INTERVAL ACTIVE' },
  { id: 'interval-result', label: '音程 · 结果', shortLabel: 'INTERVAL RESULT' },
  { id: 'interval-report-detail', label: '音程 · 练习报告', shortLabel: 'INTERVAL REPORT' },
  { id: 'chord-report-detail', label: '和弦 · 练习报告', shortLabel: 'CHORD REPORT' },
  { id: 'history', label: '练习记录', shortLabel: '记录' },
  { id: 'settings', label: '设置', shortLabel: '设置' },
  { id: 'midi', label: 'MIDI 连接状态', shortLabel: 'MIDI' },
  { id: 'update', label: '检查更新', shortLabel: '更新' }
]

const productNavigation = [
  { id: 'home' as const, label: '首页', icon: 'home' as const },
  { id: 'practice' as const, label: '练习', icon: 'book' as const },
  { id: 'tools' as const, label: '工具', icon: 'tools' as const },
  { id: 'history' as const, label: '记录', icon: 'history' as const },
  { id: 'settings' as const, label: '设置', icon: 'settings' as const }
]

const SHOW_DEVELOPMENT_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'android-debug' || __QA_BUILD__

type ChordPreviewStateId = 'live' | ChordMockStateId

function formatChordKeyName(keyId: ChordSequentialMajorKeyId): string {
  return `${formatWrittenPitchClass(getChordSequentialKeyTonic(keyId))} 大调`
}

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

interface AppNavigationContextValue {
  openAuxiliary: (screen: 'midi' | 'update') => void
  returnFromAuxiliary: (fallback: ScreenId) => void
}

const AppNavigationContext = createContext<AppNavigationContextValue | null>(null)

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

function useAppNavigation(): AppNavigationContextValue {
  const value = useContext(AppNavigationContext)
  if (!value) throw new Error('App navigation must be rendered inside AppNavigationContext')
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
  tone: 'connected' | 'busy' | 'idle' | 'error'
}

function presentMidiStatus(runtime: AndroidSightReadingRuntime): MidiStatusPresentation {
  if (runtime.midiSource === 'development') {
    return { label: 'MIDI 输入就绪', detail: '可以开始练习', tone: 'connected' }
  }
  const midi = runtime.bluetoothSnapshot
  const name = midi.connectedDeviceName ?? 'MIDI 设备'
  const transport = midi.activeInput?.transport === 'usb' ? 'USB MIDI' : 'Bluetooth MIDI'
  const reasons: Record<string, string> = {
    NO_OUTPUT_PORT: '此设备没有可用的 MIDI 输入，请选择其他设备',
    PORT_SELECTION_REQUIRED: '请选择设备的 MIDI 输入端口',
    INVALID_PORT: '该端口已不可用，请重新选择',
    DEVICE_REMOVED: '设备已断开，请重新连接',
    OPEN_FAILED: '无法连接，请检查设备后重试',
    SCAN_FAILED: '扫描未完成，请检查蓝牙后重试',
    BLUETOOTH_OFF: '蓝牙已关闭；也可以连接 USB MIDI 设备'
  }
  if (midi.reasonCode && midi.connectionState !== 'CONNECTED') {
    return { label: midi.reasonCode === 'PORT_SELECTION_REQUIRED' ? '请选择输入端口' : 'MIDI 未就绪', detail: reasons[midi.reasonCode] ?? '请重新选择 MIDI 设备', tone: 'idle' }
  }
  const states: Record<AndroidBluetoothMidiConnectionState, MidiStatusPresentation> = {
    UNSUPPORTED: { label: '不支持 MIDI', detail: '此设备无法接收 MIDI 输入', tone: 'error' },
    PERMISSION_REQUIRED: { label: '需要权限', detail: '允许附近设备后扫描', tone: 'idle' },
    PERMISSION_DENIED: { label: '权限被拒绝', detail: '请重新授权附近设备', tone: 'error' },
    BLUETOOTH_OFF: { label: '蓝牙已关闭', detail: '请先打开系统蓝牙', tone: 'error' },
    IDLE: { label: 'MIDI 未连接', detail: '连接 USB MIDI 或扫描 Bluetooth MIDI', tone: 'idle' },
    SCANNING: { label: '正在扫描', detail: '查找 Bluetooth MIDI 设备', tone: 'busy' },
    DEVICE_FOUND: { label: '已发现设备', detail: '请选择 MIDI 设备连接', tone: 'busy' },
    CONNECTING: { label: '正在连接', detail: name, tone: 'busy' },
    CONNECTED: { label: `${name} 已连接`, detail: `${transport} · ${runtime.midiReady ? '可以开始练习' : '输入已暂停'}`, tone: runtime.midiReady ? 'connected' : 'idle' },
    DISCONNECTED: { label: 'MIDI 已断开', detail: '可重新扫描并连接', tone: 'error' },
    ERROR: { label: 'MIDI 连接错误', detail: '请检查设备连接后重试', tone: 'error' }
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

function useChordPracticeRuntime(runtime: ChordPracticeRuntime): ChordRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<ChordRuntimeSnapshot>(() => runtime.snapshot)
  useEffect(() => runtime.subscribe(() => setSnapshot(runtime.snapshot)), [runtime])
  return snapshot
}

function useIntervalPracticeRuntime(runtime: IntervalPracticeSessionRuntime): IntervalSessionSnapshot {
  const [snapshot, setSnapshot] = useState<IntervalSessionSnapshot>(() => runtime.snapshot)
  useEffect(() => runtime.subscribe(() => setSnapshot(runtime.snapshot)), [runtime])
  return snapshot
}

function useChordPersistence(coordinator: ChordReportPersistenceCoordinator): ChordPersistenceSnapshot {
  const [snapshot, setSnapshot] = useState<ChordPersistenceSnapshot>(() => coordinator.snapshot)
  useEffect(() => coordinator.subscribe(() => setSnapshot(coordinator.snapshot)), [coordinator])
  return snapshot
}

function useIntervalPersistence(coordinator: IntervalReportPersistenceCoordinator): IntervalPersistenceSnapshot {
  const [snapshot, setSnapshot] = useState<IntervalPersistenceSnapshot>(() => coordinator.snapshot)
  useEffect(() => coordinator.subscribe(() => setSnapshot(coordinator.snapshot)), [coordinator])
  return snapshot
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
      case 'chevron-down':
        return <path {...common} d="m5 9 7 7 7-7" />
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
      case 'grid':
        return <><rect {...common} x="4" y="4" width="6" height="6" rx="1.2" /><rect {...common} x="14" y="4" width="6" height="6" rx="1.2" /><rect {...common} x="4" y="14" width="6" height="6" rx="1.2" /><rect {...common} x="14" y="14" width="6" height="6" rx="1.2" /></>
      case 'tools':
        return <><path {...common} d="M14.6 6.2a4 4 0 0 0-5.2 5.2L4 16.8 7.2 20l5.4-5.4a4 4 0 0 0 5.2-5.2l-2.5 2.5-3.2-3.2z" /><path {...common} d="m5.5 18.5 1-1" /></>
    }
  })()

  return <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>{body}</svg>
}

function navigate(screen: ScreenId): void {
  window.location.hash = screen
}

function readScreen(): ScreenId {
  const value = window.location.hash.replace(/^#\/?/, '') as ScreenId
  if (__QA_BUILD__ && value === 'update') return 'settings'
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

function MidiStatusButton({ compact = false, interactive = true }: { compact?: boolean; interactive?: boolean }): JSX.Element {
  const { t } = useTranslation('midi')
  const { runtime } = useMidiUi()
  const { openAuxiliary } = useAppNavigation()
  const status = presentLocalizedMidiStatus(runtime, t)
  const content = (
    <>
      <span className="midi-status__signal"><Icon name="bluetooth" size={18} /></span>
      {!compact ? <span><strong>{status.label}</strong><small>{status.detail}</small></span> : null}
      <i aria-hidden="true" />
    </>
  )
  if (!interactive) {
    return (
      <div aria-label={status.label} className={`midi-status is-${status.tone} is-display-only ${compact ? 'is-compact' : ''}`} role="status">
        {content}
      </div>
    )
  }
  return (
    <button aria-label={compact ? t('openMidi', { ns: 'navigation' }) : undefined} className={`midi-status is-${status.tone} ${compact ? 'is-compact' : ''}`} type="button" onClick={() => openAuxiliary('midi')}>
      {content}
    </button>
  )
}

function ProductHeader({ midiStatusInteractive = true, title, onBack }: { midiStatusInteractive?: boolean; title: string; onBack?: () => void }): JSX.Element {
  const { t } = useTranslation('navigation')
  return (
    <header className="product-header">
      <div className="product-header__left">
        {onBack ? (
          <button className="icon-button" aria-label={t('back')} type="button" onClick={onBack}>
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
      <MidiStatusButton interactive={midiStatusInteractive} />
    </header>
  )
}

type ProductNavigationId = 'home' | 'practice' | 'tools' | 'history' | 'settings'

function BottomNavigation({ active }: { active: ProductNavigationId }): JSX.Element {
  const { t } = useTranslation('navigation')
  return (
    <nav className="bottom-navigation" aria-label={t('primary')}>
      {productNavigation.map((item) => {
        const itemActive = item.id === active
        return (
          <button className={itemActive ? 'is-active' : ''} key={item.id} type="button" onClick={() => navigate(item.id)}>
            <Icon name={item.icon} />
            <span>{t(item.id)}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ProductFrame({
  active,
  children,
  className,
  onBack,
  title
}: {
  active: ProductNavigationId
  children: ReactNode
  className?: string
  onBack?: () => void
  title: string
}): JSX.Element {
  const { t } = useTranslation('navigation')
  return (
    <div className={`product-frame${className ? ` ${className}` : ''}`}>
      <ProductHeader onBack={onBack} title={onBack ? title : t(active === 'home' ? 'homeTitle' : active === 'history' ? 'historyTitle' : active)} />
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

function HomeScreen({
  chordHistory,
  chordPersistence,
  intervalSettingsReady,
  settings,
  theme
}: {
  chordHistory: ChordPersistenceSnapshot
  chordPersistence: ChordReportPersistenceCoordinator
  intervalSettingsReady: boolean
  settings: SightReadingSettings
  theme: ThemeDefinition
}): JSX.Element {
  const { runtime } = useMidiUi()
  const { openAuxiliary } = useAppNavigation()
  const midiStatus = presentMidiStatus(runtime)
  const history = runtime.historySnapshot
  const recentPractice = projectMixedPracticeHistory(history.records, chordHistory.records)[0] ?? null
  useEffect(() => {
    void runtime.refreshHistory()
    void chordPersistence.refresh()
  }, [chordPersistence, runtime])
  const recentPracticeTitle = recentPractice?.module === 'chord'
    ? `${formatHistoryPercentage(recentPractice.firstPassCompletionRate)}% 完成率`
    : recentPractice?.module === 'interval'
      ? `${formatIntervalAccuracy(recentPractice.firstTryAccuracy)} 首次正确率`
      : recentPractice ? `${formatHistoryPercentage(recentPractice.accuracy)}% 正确率` : '暂无练习记录'
  const recentPracticeDetail = recentPractice?.module === 'chord'
    ? `${formatHistoryTimestamp(recentPractice.endedAt)} · ${recentPractice.modeSummary} · 完成 ${recentPractice.completedQuestions}${recentPractice.plannedQuestionCount === null ? '' : `/${recentPractice.plannedQuestionCount}`}`
    : recentPractice?.module === 'interval'
      ? `${formatHistoryTimestamp(recentPractice.endedAt)} · ${recentPractice.modeSummary} · 完成 ${recentPractice.completedQuestions}${recentPractice.configuredQuestionCount === null ? '' : `/${recentPractice.configuredQuestionCount}`}`
      : recentPractice
      ? `${formatHistoryTimestamp(recentPractice.endedAt)} · 识谱 · 完成 ${recentPractice.completed}/${recentPractice.plannedQuestionCount}`
      : '完成一次练习后，这里会显示最近结果。'
  const homeVisual = theme.capabilities.homeVisual
  const composedHome = homeVisual.kind === 'single-image-hero' ? homeVisual : null
  return (
    <ProductFrame active="home" className={composedHome?.frameClassName} title="今天，读几页新音符">
      <section className={`home-hero${composedHome ? ` ${composedHome.heroClassName}` : ''}`}>
        {composedHome ? <img className="themed-home-hero__art" src={composedHome.assets.hero} alt="" aria-hidden="true" /> : null}
        <div className="home-hero__copy">
          <span className="eyebrow">今日练习</span>
          {composedHome ? (
            <h1 className="themed-home-hero__headline">
              <span className="themed-sr-only">让眼睛先认出，再让手指弹出来。</span>
              <img src={composedHome.assets.headline} alt="" aria-hidden="true" />
            </h1>
          ) : <h1>让眼睛先认出，<br />再让手指弹出来。</h1>}
          <div className="home-practice-actions">
            <button className="primary-action" type="button" onClick={() => navigate('sight-ready')}>
              <Icon name="play" />
              识谱练习
            </button>
            <button className="primary-action" type="button" onClick={() => navigate('chord-mode-select')}>
              <Icon name="book" />
              和弦练习
            </button>
            <button className="primary-action" disabled={!intervalSettingsReady} type="button" onClick={() => navigate('interval-practice')}>
              <Icon name="book" />
              音程练习
            </button>
          </div>
          {composedHome ? <small className="themed-home-hero__memo">{composedHome.memo}</small> : null}
        </div>
        {!composedHome ? (
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
        ) : null}
      </section>

      <section className={`home-glance${composedHome ? ' themed-home-glance' : ''}`} aria-label="今日概览">
        <button className={`glance-item${composedHome ? ' is-history' : ''}`} type="button" onClick={() => navigate('history')}>
          <span className="glance-icon"><Icon name="chart" /></span>
          <span>
            <small>上次练习</small>
            <strong>{history.status === 'loading' || chordHistory.status === 'loading' ? '正在读取记录' : recentPracticeTitle}</strong>
            <em>{recentPracticeDetail}</em>
          </span>
          {composedHome ? (
            <>
              <span className="themed-glance-art is-history" aria-hidden="true">
                <img src={composedHome.assets.recentPractice} alt="" />
              </span>
              <span className="themed-glance-chevron" aria-hidden="true"><Icon name="chevron" size={20} /></span>
            </>
          ) : <Icon name="chevron" size={20} />}
        </button>
        <button className={`glance-item${composedHome ? ' is-midi' : ''}`} type="button" onClick={() => openAuxiliary('midi')}>
          <span className="glance-icon is-blue"><Icon name="bluetooth" /></span>
          <span><small>MIDI 输入</small><strong>{midiStatus.label}</strong><em>{midiStatus.detail}</em></span>
          {composedHome ? (
            <span className="themed-glance-art is-midi" aria-hidden="true">
              <img src={composedHome.assets.midi} alt="" />
              <i className={`status-dot is-${midiStatus.tone}`} />
            </span>
          ) : <span className={`status-dot is-${midiStatus.tone}`} />}
        </button>
        <button className={`glance-item${composedHome ? ' is-tools' : ''}`} type="button" onClick={() => navigate('tools')}>
          <span className="glance-icon is-amber"><Icon name="tools" /></span>
          <span><small>乐理工具</small><strong>基础知识查询</strong><em>和弦、音阶、音程与调号</em></span>
          {composedHome ? (
            <>
              <span className="themed-glance-art is-tools" aria-hidden="true">
                <img src={composedHome.assets.tools} alt="" />
              </span>
              <span className="themed-glance-chevron" aria-hidden="true"><Icon name="chevron" size={20} /></span>
            </>
          ) : <Icon name="chevron" size={20} />}
        </button>
      </section>
    </ProductFrame>
  )
}

function PracticeHubScreen({
  chordPersistence,
  intervalSettingsReady,
  settings,
  theme
}: {
  chordHistory: ChordPersistenceSnapshot
  chordPersistence: ChordReportPersistenceCoordinator
  intervalSettingsReady: boolean
  settings: SightReadingSettings
  theme: ThemeDefinition
}): JSX.Element {
  const { runtime } = useMidiUi()
  const practiceVisual = theme.capabilities.practiceVisual
  const composedPractice = practiceVisual.kind === 'hero-cards' ? practiceVisual : null
  const intervalVisual = theme.capabilities.intervalPracticeVisual
  const intervalCollage = intervalVisual?.kind === 'blue-notebook' ? intervalVisual.assets.hubCardCollage : undefined
  const sightConfigurationSummary = `${settings.noteMode === 'double' ? '双音' : '单音'} · ${STAFF_MODE_LABELS[settings.staffMode]} · ${settings.questionCount} 题`

  useEffect(() => {
    void runtime.refreshHistory()
    void chordPersistence.refresh()
  }, [chordPersistence, runtime])

  return (
    <ProductFrame active="practice" className={composedPractice?.frameClassName} title="练习">
      <section className={`hub-layout${composedPractice ? ' themed-practice-hub' : ''}`} aria-labelledby="practice-hub-title">
        {composedPractice ? (
          <div className={`themed-practice-hero ${composedPractice.heroClassName}`}>
            <img className="themed-practice-hero__art" src={composedPractice.assets.hero} alt="" aria-hidden="true" />
            <div className="themed-practice-hero__copy">
              <span className="eyebrow">练习中心</span>
              <h1 id="practice-hub-title">每天一点练习，<br />让喜欢的音乐离你更近。</h1>
              <p>选择识谱、和弦或音程练习，把基础一步一步练扎实。</p>
              <small>今天，也弹一点。</small>
            </div>
          </div>
        ) : (
          <div className="hub-heading">
            <span className="eyebrow">PRACTICE</span>
            <h1 id="practice-hub-title">选择今天的练习</h1>
            <p>从识谱、和弦或音程开始，按自己的节奏打牢基础。</p>
          </div>
        )}
        <div className={`practice-module-grid has-interval${composedPractice ? ' themed-practice-module-grid' : ''}`}>
          <button className={`module-card${composedPractice ? ' themed-practice-card is-sight' : ''}`} type="button" onClick={() => navigate('sight-ready')}>
            <span className="module-card__icon"><Icon name="book" size={30} /></span>
            <span className="module-card__copy">
              <small>识谱训练</small>
              <strong>识谱练习</strong>
              <em>{sightConfigurationSummary}</em>
            </span>
            {composedPractice ? (
              <>
                <span className="themed-practice-card__art" aria-hidden="true"><img src={composedPractice.assets.sight} alt="" /></span>
                <span className="themed-practice-card__action"><Icon name="play" size={19} />开始练习</span>
              </>
            ) : <Icon name="chevron" />}
          </button>
          <button className={`module-card${composedPractice ? ' themed-practice-card is-chord' : ''}`} type="button" onClick={() => navigate('chord-mode-select')}>
            <span className="module-card__icon is-amber"><Icon name="grid" size={30} /></span>
            <span className="module-card__copy">
              <small>和弦与转位</small>
              <strong>和弦练习</strong>
              <em>三和弦 / 七和弦 · 原位与转位 · 柱式 + 分解</em>
            </span>
            {composedPractice ? (
              <>
                <span className="themed-practice-card__art" aria-hidden="true"><img src={composedPractice.assets.chord} alt="" /></span>
                <span className="themed-practice-card__action"><Icon name="play" size={19} />开始练习</span>
              </>
            ) : <Icon name="chevron" />}
          </button>
          <button className={`module-card interval-practice-card${intervalCollage ? ' interval-notebook-card' : ''}`} disabled={!intervalSettingsReady} type="button" onClick={() => navigate('interval-practice')}>
            <span className={`module-card__icon ${intervalCollage ? 'is-blue' : 'is-violet'}`}><Icon name="chart" size={30} /></span>
            <span className="module-card__copy">
              <small>音程辨识与构造</small>
              <strong>音程练习</strong>
              <em>{intervalCollage ? '指定低音构造 · 26 种音程' : '指定低音构造 · 26 种音程 · 固定大谱表'}</em>
            </span>
            {intervalCollage ? <>
              <span aria-hidden="true" className="interval-notebook-card__art"><img alt="" src={intervalCollage} /></span>
              <span className="interval-notebook-card__action"><Icon name="play" size={18} />开始练习</span>
            </> : <Icon name="chevron" />}
          </button>
        </div>
      </section>
    </ProductFrame>
  )
}

type IntervalPracticeSettingChanges = Partial<Omit<IntervalPracticeSettings, 'schemaVersion'>>

function IntervalPracticeSetupScreen({
  onSettingsChange,
  onStart,
  settings
}: {
  onSettingsChange: (changes: IntervalPracticeSettingChanges) => void
  onStart: () => void
  settings: IntervalPracticeSettings
}): JSX.Element {
  const questionCountOptions = INTERVAL_QUESTION_COUNT_OPTIONS.map((value) => ({
    label: value === 'endless' ? '无限练习' : `${value} 题`,
    value
  }))
  return (
    <ProductFrame active="practice" onBack={() => navigate('practice')} title="音程练习">
      <section className="interval-ready-layout" aria-labelledby="interval-ready-title">
        <div className="interval-ready-heading">
          <span className="eyebrow">练习准备</span>
          <h1 id="interval-ready-title">设置本轮音程练习</h1>
          <p>覆盖 26 种向上音程，范围 F1 – G6；开始后将进入无底部导航的专注练习页。</p>
        </div>
        <div className="module-settings-rows settings-group--interval interval-ready-settings">
          <SettingRow
            action={<button aria-label={`答案提示已${settings.answerHint ? '开启' : '关闭'}`} className={`mock-switch ${settings.answerHint ? 'is-on' : ''}`} type="button" onClick={() => onSettingsChange({ answerHint: !settings.answerHint })}><small>{settings.answerHint ? 'On' : 'Off'}</small><i /></button>}
            description="关闭时仍显示固定大谱表和根音，只隐藏目标音"
            icon="info"
            title="答案提示"
          />
          <SettingRow
            action={<button aria-label={`低音包含升降号已${settings.includeAccidentalRoots ? '开启' : '关闭'}`} className={`mock-switch ${settings.includeAccidentalRoots ? 'is-on' : ''}`} type="button" onClick={() => onSettingsChange({ includeAccidentalRoots: !settings.includeAccidentalRoots })}><small>{settings.includeAccidentalRoots ? 'On' : 'Off'}</small><i /></button>}
            description="关闭时低音只用自然音；目标音仍按正确拼写使用升降号"
            icon="chart"
            title="低音包含升降号"
          />
          <SettingRow
            action={<SettingSelect<IntervalQuestionCount> ariaLabel="音程练习题数" value={settings.questionCount} options={questionCountOptions} onChange={(questionCount) => onSettingsChange({ questionCount })} />}
            description="固定题数完成后自动结束；无限练习需主动结束"
            icon="grid"
            title="练习题数"
          />
        </div>
        <button className="primary-action is-wide interval-start-button" type="button" onClick={onStart}><Icon name="play" />开始练习</button>
      </section>
    </ProductFrame>
  )
}

function IntervalPracticeActiveScreen({
  midiRuntime,
  onRequestEnd,
  onSessionComplete,
  runtime,
  snapshot,
  theme
}: {
  midiRuntime: AndroidSightReadingRuntime
  onRequestEnd: () => void
  onSessionComplete: () => void
  runtime: IntervalPracticeSessionRuntime
  snapshot: IntervalSessionSnapshot
  theme: ThemeDefinition
}): JSX.Element {
  const intervalVisual = theme.capabilities.intervalPracticeVisual
  const activeBorder = intervalVisual?.kind === 'blue-notebook' ? intervalVisual.assets.activeBorder : undefined
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const [borderClip, setBorderClip] = useState('inset(50%)')
  const [foregroundLayout, setForegroundLayout] = useState({ textClip: 'inset(50%)', dockClip: 'inset(50%)', anchorStyle: {} as CSSProperties })
  const [showEarlyEnd, setShowEarlyEnd] = useState(false)
  const transportReady = midiRuntime.midiReady
  const inputBoundary = `${midiRuntime.midiSource}:${midiRuntime.midiInput.boundary}:${midiRuntime.midiBoundaryVersion}`
  const inputBoundaryRef = useRef(inputBoundary)
  const practiceState = snapshot.practiceState

  // App-owned exclusion geometry; theme data cannot move or shrink the paper.
  // Hide artwork until measured, and exclude the entire stage plus a safety gap.
  useLayoutEffect(() => {
    if (!activeBorder || !frameRef.current || !stageRef.current) return
    const frame = frameRef.current
    const stage = stageRef.current
    const textNodes = [...frame.querySelectorAll<HTMLElement>('.interval-focus-prompt__identity, .interval-focus-prompt > strong, .interval-focus-feedback')]
    const dock = document.querySelector<HTMLElement>('.review-dock')
    const updateClip = (): void => {
      const outer = frame.getBoundingClientRect()
      const paper = stage.getBoundingClientRect()
      const left = paper.left - outer.left - 8
      const top = paper.top - outer.top - 8
      const right = paper.right - outer.left + 8
      const bottom = paper.bottom - outer.top + 8
      setBorderClip(`polygon(evenodd, 0px 0px, ${outer.width}px 0px, ${outer.width}px ${outer.height}px, 0px ${outer.height}px, 0px 0px, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`)
      const exclude = (rect: { left: number; top: number; right: number; bottom: number }, gap: number): string => {
        const l = rect.left - outer.left - gap, t = rect.top - outer.top - gap
        const r = rect.right - outer.left + gap, b = rect.bottom - outer.top + gap
        return `polygon(evenodd, 0px 0px, ${outer.width}px 0px, ${outer.width}px ${outer.height}px, 0px ${outer.height}px, 0px 0px, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`
      }
      const textRects = textNodes.map((node) => node.getBoundingClientRect())
      const textRect = {
        left: Math.min(...textRects.map((rect) => rect.left)), top: Math.min(...textRects.map((rect) => rect.top)),
        right: Math.max(...textRects.map((rect) => rect.right)), bottom: Math.max(...textRects.map((rect) => rect.bottom))
      }
      const dockRect = dock?.getBoundingClientRect()
      // Separate nested masks intersect safely even when exclusion rectangles
      // overlap. Multiple holes in one evenodd polygon would cancel each other.
      setForegroundLayout({
        textClip: exclude(textRect, 10),
        dockClip: dockRect ? exclude(dockRect, 12) : 'inset(0)',
        anchorStyle: {
          '--interval-stage-left': `${paper.left - outer.left}px`,
          '--interval-stage-right': `${paper.right - outer.left}px`,
          '--interval-stage-top': `${paper.top - outer.top}px`,
          '--interval-stage-bottom': `${paper.bottom - outer.top}px`,
          '--interval-anchor-right-inset': `${Math.max(outer.right - paper.right, dockRect ? outer.right - dockRect.left + 24 : 0)}px`
        } as CSSProperties
      })
    }
    updateClip()
    const observer = new ResizeObserver(updateClip)
    observer.observe(frame)
    observer.observe(stage)
    textNodes.forEach((node) => observer.observe(node))
    if (dock) observer.observe(dock)
    return () => observer.disconnect()
  }, [activeBorder, Boolean(practiceState)])

  useEffect(() => {
    runtime.setTransportReady(transportReady)
    const unsubscribe = midiRuntime.midiRouter.subscribe((event) => runtime.handleMidi(event))
    return unsubscribe
  }, [midiRuntime, runtime])

  useEffect(() => {
    runtime.setTransportReady(transportReady)
  }, [runtime, transportReady])

  useEffect(() => {
    if (inputBoundaryRef.current === inputBoundary) return
    inputBoundaryRef.current = inputBoundary
    runtime.resetInputState()
    runtime.setTransportReady(false)
    runtime.setTransportReady(transportReady)
  }, [inputBoundary, runtime, transportReady])

  useEffect(() => {
    if (snapshot.status === 'SESSION_COMPLETE') onSessionComplete()
  }, [onSessionComplete, snapshot.status])

  useEffect(() => {
    const handleBackRequest = (): void => {
      runtime.pause()
      setShowEarlyEnd(true)
    }
    window.addEventListener('interval-request-end', handleBackRequest)
    return () => window.removeEventListener('interval-request-end', handleBackRequest)
  }, [runtime])

  if (!practiceState) return <main className="persistence-loading"><h1>正在准备音程练习…</h1></main>
  const page = presentIntervalPractice(practiceState)
  const judgementState = snapshot.judgement?.state ?? { phase: 'READY' as const }
  const judgementPhase = judgementState.phase
  const paused = snapshot.status === 'SUSPENDED'
  const notationFeedback: MusicNotationFeedback = judgementPhase === 'SUCCESS'
    ? 'correct'
    : judgementPhase === 'WRONG_WAIT_RELEASE' ? 'wrong_note' : null
  const judgementMessage = paused
    ? !transportReady ? 'MIDI 已断开，练习已安全暂停' : '练习已暂停'
    : judgementPhase === 'COLLECTING'
      ? '正在接收弹奏…'
      : judgementPhase === 'WRONG_WAIT_RELEASE'
        ? '错误，请松开全部按键后重试原题'
        : judgementPhase === 'SUCCESS'
          ? judgementState.feedbackElapsed ? '正确，请松开全部按键' : '正确'
          : ''
  const progressLabel = snapshot.questionCount === 'endless'
    ? `已完成 ${snapshot.completedQuestions}`
    : `已完成 ${snapshot.completedQuestions} / ${snapshot.questionCount}`
  const requestEnd = (): void => {
    runtime.pause()
    setShowEarlyEnd(true)
  }
  const continuePractice = (): void => {
    setShowEarlyEnd(false)
    runtime.resume()
  }

  return (
    <div
      className={`interval-focus-frame ${paused ? 'is-paused' : ''}${activeBorder ? ' interval-blue-notebook' : ''}`}
      ref={frameRef}
      data-answer-hint={practiceState.settings.answerHint ? 'on' : 'off'}
    >
      {activeBorder ? <div aria-hidden="true" className="interval-notebook-border-clip" style={{ clipPath: borderClip }}><img alt="" className="interval-notebook-border" src={activeBorder} /></div> : null}
      {activeBorder ? (
        <div aria-hidden="true" className="interval-notebook-foreground-clip" style={{ ...foregroundLayout.anchorStyle, clipPath: borderClip }}>
          <div className="interval-notebook-text-safe" style={{ clipPath: foregroundLayout.textClip }}>
            <div className="interval-notebook-dock-safe" style={{ clipPath: foregroundLayout.dockClip }}>
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
                <span className={`interval-notebook-anchor is-${corner}`} key={corner}><img alt="" src={activeBorder} /></span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <header className="chord-focus-header interval-focus-header">
        <div className="chord-focus-header__left">
          <button aria-label="返回练习" className="icon-button subtle" type="button" onClick={requestEnd}><Icon name="arrow-left" /></button>
          <div><small>PIANO FUNDAMENTALS</small><strong>音程练习</strong></div>
        </div>
        <div className="focus-actions">
          <MidiStatusButton compact />
          <button className="outline-action" disabled={paused && !transportReady} type="button" onClick={() => paused ? runtime.resume() : runtime.pause()}><Icon name={paused ? 'play' : 'pause'} /><span>{paused ? '继续' : '暂停'}</span></button>
          <button className="outline-action" type="button" onClick={requestEnd}><Icon name="stop" /><span>提前结束</span></button>
        </div>
      </header>
      <main className="interval-focus-content">
        <div className="interval-question-copy interval-focus-prompt">
          <div className="interval-focus-prompt__identity"><span>{page.intervalName}</span><small>{progressLabel}</small></div>
          <strong>{page.prompt}</strong>
          <span className={`interval-focus-feedback is-${paused ? 'paused' : judgementPhase === 'SUCCESS' ? 'success' : judgementPhase === 'WRONG_WAIT_RELEASE' ? 'danger' : 'neutral'}`} role="status" aria-live="polite">{judgementMessage}</span>
        </div>
        <section ref={stageRef} className={`interval-focus-stage has-${notationFeedback ?? 'neutral'}`} aria-label="音程谱面">
          <NotationPaper keySignature="C" label={page.notation.ariaLabel} notes={page.notation.notes} staffMode="grand" feedback={notationFeedback} />
          <div className="interval-answer-caption">
            <span>{page.notation.answerLabel ?? page.rootLabel}</span>
          </div>
          {paused ? <div className="chord-pause-overlay interval-pause-overlay"><Icon name="pause" size={34} /><strong>{judgementMessage}</strong></div> : null}
        </section>
      </main>
      {showEarlyEnd ? (
        <div className="early-end-backdrop">
          <section aria-labelledby="interval-early-end-title" aria-modal="true" className="early-end-dialog" role="dialog">
            <span className="early-end-dialog__icon"><Icon name="stop" /></span>
            <div><span className="eyebrow">音程练习</span><h1 id="interval-early-end-title">结束本轮？</h1><p>已完成 {snapshot.completedQuestions}{snapshot.questionCount === 'endless' ? ' 题' : ` / ${snapshot.questionCount}`}。结束后，本轮结果会保存到练习记录。</p></div>
            <div className="early-end-dialog__actions"><button className="secondary-action" type="button" onClick={continuePractice}>继续练习</button><button className="primary-action" type="button" onClick={onRequestEnd}>结束并查看结果</button></div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ChordModeSelectScreen({ onSelectMode, settingsReady }: { onSelectMode: (mode: ChordPracticeMode) => void; settingsReady: boolean }): JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <ProductFrame active="practice" onBack={() => navigate('practice')} title="和弦练习">
      <section className="hub-layout chord-mode-layout" aria-labelledby="chord-mode-title">
        <div className="hub-heading chord-mode-heading">
          <div>
            <span className="eyebrow">CHORD PRACTICE</span>
            <h1 id="chord-mode-title">选择和弦练习方式</h1>
            <p>根据你的目标，选择更适合的练习模式。</p>
          </div>
          <button aria-label="查看和弦练习方式说明" className="chord-help-button" type="button" onClick={() => setHelpOpen(true)}>?</button>
        </div>
        <div className="practice-module-grid chord-mode-grid">
          <button className="module-card chord-mode-card" disabled={!settingsReady} type="button" onClick={() => onSelectMode('sequential')}>
            <span className="module-card__icon"><Icon name="book" size={30} /></span>
            <span className="module-card__copy">
              <small><b>推荐</b> 学习模式</small>
              <strong>循序练习</strong>
              <em>围绕单一大调，逐步扩展练习内容</em>
              <i>适合记忆和弦构成、转位与调内和弦关系</i>
              <span>三和弦 → 七和弦 → 转位</span>
            </span>
            <Icon name="chevron" />
          </button>
          <button className="module-card chord-mode-card" disabled={!settingsReady} type="button" onClick={() => onSelectMode('comprehensive')}>
            <span className="module-card__icon is-amber"><Icon name="grid" size={30} /></span>
            <span className="module-card__copy">
              <small>综合复习</small>
              <strong>综合随机</strong>
              <em>从完整和弦范围中综合随机出题</em>
              <i>适合复习、巩固与检验整体反应能力</i>
              <span>根音 · 和弦类型 · 转位综合混合</span>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
      </section>
      {helpOpen ? (
        <div className="chord-mode-help-backdrop" onClick={() => setHelpOpen(false)}>
          <section aria-labelledby="chord-mode-help-title" aria-modal="true" className="chord-mode-help" role="dialog" onClick={(event) => event.stopPropagation()}>
            <header><h2 id="chord-mode-help-title">练习方式说明</h2><button aria-label="关闭练习方式说明" className="icon-button subtle" type="button" onClick={() => setHelpOpen(false)}><Icon name="close" /></button></header>
            <div className="chord-mode-help__content">
              <article>
                <h3>循序练习</h3>
                <p>每次练习只围绕一个大调的 7 个调内和弦出题。当前调由你选择，练习过程中不会自动切换到其他调。</p>
                <dl>
                  <div><dt>10 / 20 题</dt><dd>仅练习调内三和弦原位</dd></div>
                  <div><dt>50 题</dt><dd>加入调内七和弦原位</dd></div>
                  <div><dt>100 题</dt><dd>进一步加入三和弦转位</dd></div>
                  <div><dt>无限</dt><dd>加入三和弦与七和弦的全部转位，并持续围绕当前调练习，直到手动结束</dd></div>
                </dl>
                <p>题目采用均衡题袋方式安排，尽量让当前范围内的和弦获得均匀练习机会。</p>
              </article>
              <article>
                <h3>综合随机</h3>
                <p>从完整和弦范围中综合随机出题，覆盖不同根音、和弦类型与转位。</p>
                <p>它不会限制在单一大调内，适合已经熟悉基础内容后进行综合复习与反应训练。</p>
              </article>
            </div>
            <button className="primary-action" type="button" onClick={() => setHelpOpen(false)}>知道了</button>
          </section>
        </div>
      ) : null}
    </ProductFrame>
  )
}

const THEORY_TOOLS = [
  { id: 'chord', title: '和弦查询', detail: '查看规范和弦名称与完整理论构成音', screen: 'chord-query-tool' },
  { id: 'interval', title: '音程查询', detail: '识别两个音之间的音程', screen: 'interval-query-tool' },
  { id: 'scale', title: '自然大调音阶与调号', detail: '查看自然大调音阶与五线谱调号', screen: 'scale-key-signature-tool' }
] as const

function ToolsHubScreen({ theme }: { theme: ThemeDefinition }): JSX.Element {
  const toolsVisual = theme.capabilities.toolsVisual
  const composedTools = toolsVisual.kind === 'hero-cards' ? toolsVisual : null
  const toolCards = THEORY_TOOLS.map((tool) => (
    <button
      className={`tool-card is-interactive${composedTools ? ` themed-tool-card is-${tool.id}` : ''}`}
      key={tool.id}
      type="button"
      onClick={() => navigate(tool.screen)}
    >
      <span className="tool-card__icon"><Icon name="tools" size={27} /></span>
      <span className="tool-card__copy"><strong>{tool.title}</strong><small>{tool.detail}</small></span>
      {composedTools ? (
        <span className="themed-tool-card__art" aria-hidden="true">
          <img src={composedTools.assets[tool.id]} alt="" />
        </span>
      ) : null}
      <em>{composedTools ? '打开工具' : '打开'} <Icon name="chevron" size={15} /></em>
    </button>
  ))

  return (
    <ProductFrame active="tools" className={composedTools?.frameClassName} title="工具">
      <section className={`hub-layout tools-hub${composedTools ? ' themed-tools-hub' : ''}`} aria-labelledby="tools-hub-title">
        {composedTools ? (
          <>
            <div className="themed-tools-hero" aria-hidden="true">
              <img src={composedTools.assets.hero} alt="" />
              <span>低音，也能让音乐更有重量。</span>
            </div>
            <div className="themed-tools-panel">
              <div className="themed-tools-heading">
                <span className="eyebrow">THEORY REFERENCE</span>
                <h1 id="tools-hub-title">乐理工具</h1>
                <p>快速查询和弦、音程与自然大调音阶、调号。</p>
              </div>
              <div className="tool-card-grid themed-tool-card-grid">{toolCards}</div>
            </div>
          </>
        ) : (
          <>
            <div className="hub-heading">
              <span className="eyebrow">THEORY REFERENCE</span>
              <h1 id="tools-hub-title">乐理基础知识查询</h1>
              <p>快速查询常用和弦、音阶、音程与调号基础信息。</p>
            </div>
            <div className="tool-card-grid">{toolCards}</div>
          </>
        )}
      </section>
    </ProductFrame>
  )
}

function ScaleNoteToken({ value }: { value: string }): JSX.Element {
  const letter = value.slice(0, 1)
  const accidental = value.slice(1)
  return (
    <span className="scale-note-token">
      <span>{letter}</span>
      {accidental ? <span className="scale-note-token__accidental">{accidental}</span> : null}
    </span>
  )
}

type ChordAccidentalGlyphName = 'natural' | 'flat' | 'sharp' | 'double-flat' | 'double-sharp'

function parseChordAccidentalGroup(value: string): ChordAccidentalGlyphName[] {
  const glyphs: ChordAccidentalGlyphName[] = []
  for (const symbol of Array.from(value)) {
    if (symbol === '♮') glyphs.push('natural')
    if (symbol === '♭') glyphs.push('flat')
    if (symbol === '♯') glyphs.push('sharp')
    if (symbol === '𝄫') glyphs.push('double-flat')
    if (symbol === '𝄪') glyphs.push('double-sharp')
  }
  return glyphs
}

function ChordAccidentalGlyph({ name }: { name: ChordAccidentalGlyphName }): JSX.Element {
  if (name === 'flat') {
    return (
      <svg className="chord-accidental-glyph" data-accidental="flat" viewBox="0 0 12 28">
        <path d="M3.1 1.5v22.7c1.9-5.9 7.2-7.2 7.2-3.3 0 3-3 5.2-7.2 6" />
      </svg>
    )
  }
  if (name === 'sharp') {
    return (
      <svg className="chord-accidental-glyph" data-accidental="sharp" viewBox="0 0 15 28">
        <path d="M5.1 2.2v23.6M10.2.9v23.6M1.5 10.1l12-2.4M1.5 19.1l12-2.4" />
      </svg>
    )
  }
  if (name === 'natural') {
    return (
      <svg className="chord-accidental-glyph" data-accidental="natural" viewBox="0 0 14 28">
        <path d="M3.5 2.1v20.7M10.5 5.2v20.7M3.5 11l7-2.4M3.5 19.5l7-2.4" />
      </svg>
    )
  }
  if (name === 'double-flat') {
    return (
      <svg className="chord-accidental-glyph" data-accidental="double-flat" viewBox="0 0 21 28">
        <path d="M3 1.5v22.7c1.9-5.9 7.1-7.2 7.1-3.3 0 3-3 5.2-7.1 6M11.2 1.5v22.7c1.9-5.9 7.1-7.2 7.1-3.3 0 3-3 5.2-7.1 6" />
      </svg>
    )
  }
  return (
    <svg className="chord-accidental-glyph" data-accidental="double-sharp" viewBox="0 0 18 20">
      <path className="chord-accidental-glyph__fill" d="M1.7 2.4h4L9 6.2l3.3-3.8h4v4L12.4 10l3.9 3.6v4h-4L9 13.8l-3.3 3.8h-4v-4L5.6 10 1.7 6.4z" />
    </svg>
  )
}

function ChordAccidentalGroup({ value, className = '' }: { value: string; className?: string }): JSX.Element | null {
  const glyphs = parseChordAccidentalGroup(value)
  if (glyphs.length === 0) return null
  return (
    <span aria-hidden="true" className={`chord-accidental-group ${className}`.trim()} data-accidental-group={value}>
      {glyphs.map((name, index) => <ChordAccidentalGlyph key={`${name}-${index}`} name={name} />)}
    </span>
  )
}

function ChordSymbol({ letter, accidental, suffix, label }: { letter: string; accidental: string; suffix: string; label: string }): JSX.Element {
  return (
    <span aria-label={label} className="chord-symbol" role="text">
      <span aria-hidden="true" className="chord-symbol__letter">{letter}</span>
      <ChordAccidentalGroup className="chord-symbol__accidental" value={accidental} />
      {suffix ? <span aria-hidden="true" className="chord-symbol__suffix">{suffix}</span> : null}
    </span>
  )
}

function ChordTheoreticalNoteToken({ letter, accidental, label }: { letter: string; accidental: string; label: string }): JSX.Element {
  return (
    <span aria-label={label} className="chord-theoretical-note-token" role="text">
      <span aria-hidden="true" className="chord-theoretical-note-token__letter">{letter}</span>
      <ChordAccidentalGroup className="chord-theoretical-note-token__accidental" value={accidental} />
    </span>
  )
}

function ToolDetailShell({
  ariaLabelledby,
  className,
  details,
  heading,
  headingClassName,
  heroArtwork,
  heroKind = 'chord-query',
  notation,
  primaryResult,
  query,
  visual
}: {
  ariaLabelledby: string
  className?: string
  details?: ReactNode
  heading: ReactNode
  headingClassName?: string
  heroArtwork?: string
  heroKind?: 'chord-query' | 'complete-ryo'
  notation?: ReactNode
  primaryResult: ReactNode
  query: ReactNode
  visual: ThemeDefinition['capabilities']['toolDetailVisual']
}): JSX.Element {
  const decoratedReference = visual.kind === 'decorated-reference' ? visual : null
  const decorationStyle = decoratedReference
    ? { backgroundImage: `url("${decoratedReference.assets.decorations}")` }
    : undefined
  const environmentStyle = decoratedReference
    ? { backgroundImage: `url("${decoratedReference.assets.background}")` }
    : undefined

  return (
    <section
      aria-labelledby={ariaLabelledby}
      className={`tool-detail-shell is-${visual.kind}${className ? ` ${className}` : ''}`}
      data-tool-detail-visual={visual.kind}
    >
      {decoratedReference ? (
        <>
          <div
            aria-hidden="true"
            className="tool-detail-environment"
            data-tool-detail-asset="background"
            style={environmentStyle}
          />
          <div aria-hidden="true" className="tool-detail-artwork">
            {heroArtwork ? (
              heroKind === 'complete-ryo' ? (
                <img
                  alt=""
                  className="tool-detail-artwork__complete-ryo"
                  data-tool-detail-asset="complete-ryo"
                  src={heroArtwork}
                />
              ) : (
                <img
                  alt=""
                  className="tool-detail-artwork__chord-query-hero"
                  data-tool-detail-asset="chord-query-hero"
                  src={heroArtwork}
                />
              )
            ) : null}
            <span className="tool-detail-decoration is-tape" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-stars" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-note" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-bass" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-cat" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-arrow" data-tool-detail-asset="decoration" style={decorationStyle} />
            <span className="tool-detail-decoration is-result-tape" data-tool-detail-asset="decoration" style={decorationStyle} />
          </div>
        </>
      ) : null}
      <div className={`tool-detail-top${headingClassName ? ` ${headingClassName}` : ''}`}>
        <header className="tool-detail-heading-band">
          <div className="tool-detail-heading">{heading}</div>
        </header>
        <div className="tool-detail-query-panel">
          <div className="tool-detail-query">{query}</div>
        </div>
      </div>
      <div className="tool-detail-primary-result">{primaryResult}</div>
      {notation ? <div className="tool-detail-notation">{notation}</div> : null}
      {details ? <div className="tool-detail-details">{details}</div> : null}
    </section>
  )
}

function ChordQueryToolScreen({ theme }: { theme: ThemeDefinition }): JSX.Element {
  const [noteLetter, setNoteLetter] = useState<ChordQueryNoteLetter>('C')
  const [accidental, setAccidental] = useState<ChordQueryInputAccidental>(0)
  const [chordType, setChordType] = useState<ChordQueryTypeId>('major')
  const root = useMemo(() => ({ letter: noteLetter, accidental }), [noteLetter, accidental])
  const result = useMemo(() => getChordQueryResult(root, chordType), [root, chordType])
  const toolDetailVisual = theme.capabilities.toolDetailVisual
  const decoratedReference = toolDetailVisual.kind === 'decorated-reference' ? toolDetailVisual : null

  return (
    <ProductFrame active="tools" className={decoratedReference?.frameClassName} onBack={() => navigate('tools')} title="和弦查询">
      <ToolDetailShell
        ariaLabelledby="chord-query-title"
        className="chord-query-layout"
        headingClassName="chord-query-header"
        heroArtwork={decoratedReference?.artwork.chordQueryHero}
        visual={toolDetailVisual}
        heading={(
          <div>
            <span className="eyebrow">CHORD REFERENCE</span>
            <h1 id="chord-query-title">和弦查询</h1>
            <p>选择根音和和弦类型，查看规范名称与完整理论构成音。</p>
          </div>
        )}
        query={(
          <div className="chord-query-selectors" aria-label="和弦查询条件">
            <label>
              <span>音名</span>
              <span className="setting-select-wrap">
                <select className="setting-select" value={noteLetter} onChange={(event) => setNoteLetter(event.target.value as ChordQueryNoteLetter)}>
                  {CHORD_QUERY_NOTE_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                </select>
                <Icon name="chevron-down" size={17} />
              </span>
            </label>
            <label>
              <span>变音记号</span>
              <span className="setting-select-wrap">
                <select className="setting-select" value={accidental} onChange={(event) => setAccidental(Number(event.target.value) as ChordQueryInputAccidental)}>
                  {CHORD_QUERY_INPUT_ACCIDENTALS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <Icon name="chevron-down" size={17} />
              </span>
            </label>
            <label>
              <span>和弦类型</span>
              <span className="setting-select-wrap">
                <select className="setting-select" value={chordType} onChange={(event) => setChordType(event.target.value as ChordQueryTypeId)}>
                  {CHORD_QUERY_TYPE_GROUPS.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.types.map((option) => <option key={option.id} value={option.id}>{option.selectorLabel}</option>)}
                    </optgroup>
                  ))}
                </select>
                <Icon name="chevron-down" size={17} />
              </span>
            </label>
          </div>
        )}
        primaryResult={(
          <article className="chord-query-card chord-query-answer" aria-label={`${result.symbol} 查询结果`}>
          <div className="chord-query-identity">
            <span className="eyebrow">CHORD SYMBOL</span>
            <h2>
              <ChordSymbol
                accidental={result.rootLabel.slice(1)}
                label={result.symbol}
                letter={result.root.letter}
                suffix={result.type.suffix}
              />
            </h2>
            <p>
              <ChordTheoreticalNoteToken accidental={result.rootLabel.slice(1)} label={result.rootLabel} letter={result.root.letter} />
              <span>{result.type.chineseName}</span>
            </p>
          </div>
          <div className="chord-query-composition">
            <span className="eyebrow">理论构成音</span>
            <p aria-label={`${result.chineseLabel}理论构成音`}>
              {result.pitches.map((pitch, index) => (
                <span className="chord-query-note-item" key={`${pitch.label}-${pitch.degree}`}>
                  {index > 0 ? <span aria-hidden="true" className="chord-query-note-separator">·</span> : null}
                  <ChordTheoreticalNoteToken accidental={pitch.accidental} label={pitch.label} letter={pitch.letter} />
                </span>
              ))}
            </p>
          </div>
          </article>
        )}
      />
    </ProductFrame>
  )
}

function ScaleKeySignatureToolScreen({ theme }: { theme: ThemeDefinition }): JSX.Element {
  const [root, setRoot] = useState<MajorKeyId>('C')
  const [scaleType, setScaleType] = useState<ScaleTypeId>('naturalMajor')
  const result = useMemo(() => getNaturalMajorToolResult(root), [root])
  const toolDetailVisual = theme.capabilities.toolDetailVisual
  const decoratedReference = toolDetailVisual.kind === 'decorated-reference' ? toolDetailVisual : null

  return (
    <ProductFrame active="tools" className={decoratedReference?.frameClassName} onBack={() => navigate('tools')} title="音阶与调号">
      <ToolDetailShell
        ariaLabelledby="scale-tool-title"
        className="scale-tool-layout"
        headingClassName="scale-tool-header"
        heroArtwork={decoratedReference?.artwork.sharedCompleteRyo}
        heroKind="complete-ryo"
        visual={toolDetailVisual}
        heading={(
          <div>
            <span className="eyebrow">SCALE / KEY SIGNATURE REFERENCE</span>
            <h1 id="scale-tool-title">音阶与调号</h1>
            <p>选择主音，查看自然大调的规范音名与五线谱调号。</p>
          </div>
        )}
        query={(
          <div className="scale-tool-selectors" aria-label="音阶查询条件">
            <label>
              <span>主音</span>
              <span className="setting-select-wrap">
                <select className="setting-select" value={root} onChange={(event) => setRoot(event.target.value as MajorKeyId)}>
                  {NATURAL_MAJOR_TOOL_ROOT_IDS.map((keyId) => (
                    <option key={keyId} value={keyId}>{formatScaleToolNoteName(keyId)}</option>
                  ))}
                </select>
                <Icon name="chevron-down" size={17} />
              </span>
            </label>
            <label>
              <span>音阶类型</span>
              <span className="setting-select-wrap">
                <select className="setting-select" value={scaleType} onChange={(event) => setScaleType(event.target.value as ScaleTypeId)}>
                  {AVAILABLE_SCALE_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <Icon name="chevron-down" size={17} />
              </span>
            </label>
          </div>
        )}
        primaryResult={(
          <div className="scale-tool-results">
          <article className="scale-tool-card scale-tool-scale-card">
            <div className="scale-tool-scale-content">
              <h2><ScaleNoteToken value={result.tonicLabel} /> <span>自然大调</span></h2>
              <span className="eyebrow scale-tool-section-label">音阶构成</span>
              <p className="scale-tool-note-sequence" aria-label={`${result.title}音阶构成`}>
                {result.notes.ascending.map((note, index) => (
                  <span className="scale-tool-sequence-item" key={`${note}-${index}`}>
                    {index > 0 ? <span aria-hidden="true" className="scale-tool-note-separator">·</span> : null}
                    <ScaleNoteToken value={note} />
                  </span>
                ))}
              </p>
            </div>
            <div className="scale-tool-relative-section">
              <span className="eyebrow scale-tool-section-label">关系调</span>
              <small>相对小调</small>
              <strong><ScaleNoteToken value={result.relativeMinorTonicLabel} /> <span>小调</span></strong>
            </div>
          </article>

          <article className="scale-tool-card scale-tool-signature-card">
            <div className="scale-tool-card-heading">
              <span className="eyebrow">KEY SIGNATURE</span>
              <h2>调号</h2>
            </div>
            <div className="scale-key-signature-paper">
              <MusicStaffRenderer
                ariaLabel={`${result.title}调号大谱表`}
                feedback={null}
                keySignature={result.keySignatureId}
                notes={[]}
                staffMode="grand"
              />
            </div>
          </article>
          </div>
        )}
      />
    </ProductFrame>
  )
}

function IntervalPitchToken({ pitch }: { pitch: IntervalQueryWrittenPitch }): JSX.Element {
  const accidental = formatIntervalAccidental(pitch.accidental)
  const label = `${pitch.letter}${accidental}${pitch.octave}`
  return (
    <span aria-label={label} className="interval-query-pitch-token" role="text">
      <span aria-hidden="true" className="interval-query-pitch-token__letter">{pitch.letter}</span>
      <ChordAccidentalGroup className="interval-query-pitch-token__accidental" value={accidental} />
      <span aria-hidden="true" className="interval-query-pitch-token__octave">{pitch.octave}</span>
    </span>
  )
}

function IntervalPitchSelector({
  label,
  pitch,
  onLetterChange,
  onAccidentalChange,
  onOctaveChange
}: {
  label: string
  pitch: IntervalQueryWrittenPitch
  onLetterChange: (value: IntervalQueryLetter) => void
  onAccidentalChange: (value: IntervalQueryVisibleAccidental) => void
  onOctaveChange: (value: IntervalQueryOctave) => void
}): JSX.Element {
  return (
    <fieldset className="interval-query-selector-group">
      <legend>{label}</legend>
      <label>
        <span>音名</span>
        <span className="setting-select-wrap">
          <select className="setting-select" value={pitch.letter} onChange={(event) => onLetterChange(event.target.value as IntervalQueryLetter)}>
            {INTERVAL_QUERY_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
          </select>
          <Icon name="chevron-down" size={17} />
        </span>
      </label>
      <label>
        <span>变音记号</span>
        <span className="setting-select-wrap">
          <select aria-label={`${label} 变音记号`} className="setting-select" value={pitch.accidental} onChange={(event) => onAccidentalChange(Number(event.target.value) as IntervalQueryVisibleAccidental)}>
            {INTERVAL_QUERY_VISIBLE_ACCIDENTALS.map((option) => <option aria-label={option.accessibleLabel} key={option.value} value={option.value}>{option.selectorLabel}</option>)}
          </select>
          <Icon name="chevron-down" size={17} />
        </span>
      </label>
      <label>
        <span>八度</span>
        <span className="setting-select-wrap">
          <select className="setting-select" value={pitch.octave} onChange={(event) => onOctaveChange(Number(event.target.value) as IntervalQueryOctave)}>
            {INTERVAL_QUERY_OCTAVES.map((octave) => <option key={octave} value={octave}>{octave}</option>)}
          </select>
          <Icon name="chevron-down" size={17} />
        </span>
      </label>
    </fieldset>
  )
}

function IntervalQueryToolScreen({ theme }: { theme: ThemeDefinition }): JSX.Element {
  const [startLetter, setStartLetter] = useState<IntervalQueryLetter>('C')
  const [startAccidental, setStartAccidental] = useState<IntervalQueryVisibleAccidental>(0)
  const [startOctave, setStartOctave] = useState<IntervalQueryOctave>(4)
  const [targetLetter, setTargetLetter] = useState<IntervalQueryLetter>('G')
  const [targetAccidental, setTargetAccidental] = useState<IntervalQueryVisibleAccidental>(0)
  const [targetOctave, setTargetOctave] = useState<IntervalQueryOctave>(4)
  const start = useMemo(() => ({ letter: startLetter, accidental: startAccidental, octave: startOctave }), [startAccidental, startLetter, startOctave])
  const target = useMemo(() => ({ letter: targetLetter, accidental: targetAccidental, octave: targetOctave }), [targetAccidental, targetLetter, targetOctave])
  const result = useMemo(() => getIntervalQueryResult(start, target), [start, target])
  const toolDetailVisual = theme.capabilities.toolDetailVisual
  const decoratedReference = toolDetailVisual.kind === 'decorated-reference' ? toolDetailVisual : null

  return (
    <ProductFrame active="tools" className={decoratedReference?.frameClassName} onBack={() => navigate('tools')} title="音程查询">
      <ToolDetailShell
        ariaLabelledby="interval-query-title"
        className="interval-query-layout"
        headingClassName="interval-query-header"
        heroArtwork={decoratedReference?.artwork.sharedCompleteRyo}
        heroKind="complete-ryo"
        visual={toolDetailVisual}
        heading={(
          <div className="interval-query-heading">
            <span className="eyebrow">INTERVAL REFERENCE</span>
            <h1 id="interval-query-title">音程查询</h1>
            <p>选择起始音与目标音，查看音程名称、方向与等音程参考。</p>
          </div>
        )}
        query={(
          <div className="interval-query-selectors" aria-label="音程查询条件">
            <IntervalPitchSelector
              label="起始音"
              onAccidentalChange={setStartAccidental}
              onLetterChange={setStartLetter}
              onOctaveChange={setStartOctave}
              pitch={start}
            />
            <span aria-hidden="true" className="interval-query-selector-arrow">→</span>
            <IntervalPitchSelector
              label="目标音"
              onAccidentalChange={setTargetAccidental}
              onLetterChange={setTargetLetter}
              onOctaveChange={setTargetOctave}
              pitch={target}
            />
          </div>
        )}
        primaryResult={(
          <div className="interval-query-results">
            <article className="interval-query-card interval-query-answer" aria-label={`${result.displayName}查询结果`}>
              <div className="interval-query-identity">
                <span className="eyebrow">INTERVAL RESULT</span>
                <h2>{result.displayName}</h2>
                <div className="interval-query-pitch-pair">
                  <IntervalPitchToken pitch={result.start} />
                  <span aria-hidden="true" className="interval-query-pitch-arrow">→</span>
                  <IntervalPitchToken pitch={result.target} />
                  {result.soundingRelationshipLabel ? <em>{result.soundingRelationshipLabel}</em> : null}
                </div>
              </div>
              <div className="interval-query-facts">
                <span className="eyebrow">结果信息</span>
                <dl>
                  <div><dt>方向</dt><dd>{result.directionLabel}</dd></div>
                  <div><dt>度数</dt><dd>{result.intervalNumberLabel}</dd></div>
                  <div><dt>性质</dt><dd>{result.quality}</dd></div>
                  <div><dt>半音数</dt><dd>{result.semitoneDistance}</dd></div>
                </dl>
              </div>
            </article>

            <article className="interval-query-card interval-query-references">
              <header>
                <div>
                  <span className="eyebrow">ENHARMONIC INTERVALS</span>
                  <h2>等音程参考</h2>
                </div>
                <p>保持 {result.semitoneDistance} 个半音不变，比较相邻级数的理论命名。</p>
              </header>
              <div className="interval-query-reference-list">
                {result.enharmonicReferences.map((reference) => (
                  <div className={reference.isCurrent ? 'is-current' : ''} key={reference.intervalNumber}>
                    <span>{reference.intervalName}</span>
                    <small>{reference.semitoneDistance} 个半音</small>
                    {reference.isCurrent ? <em>当前</em> : <i aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      />
    </ProductFrame>
  )
}

function ChordGroupBadge({
  label,
  state
}: {
  label: string
  state: 'active' | 'completed' | 'wrong' | 'secondary'
}): JSX.Element {
  const stateLabel = state === 'completed'
    ? '已完成'
    : state === 'wrong'
      ? '需重试'
      : state === 'active' ? '当前' : '稍后'
  return (
    <div className={`chord-group-badge is-${state}`}>
      <span>{label}</span>
      <strong>
        {state === 'completed' ? <Icon name="check" size={16} /> : null}
        {state === 'wrong' ? <Icon name="close" size={16} /> : null}
        {stateLabel}
      </strong>
    </div>
  )
}

function ChordSettingsDrawer({
  chordSettings,
  mode,
  onClose,
  onChordSettingsChange,
  onQuestionCountChange,
  questionCount
}: {
  chordSettings: ChordSettings
  mode: ChordPracticeMode
  onClose: () => void
  onChordSettingsChange: (changes: Partial<Pick<ChordSettings, 'sequentialKey' | 'showChordTones'>>) => void
  onQuestionCountChange: (value: ChordQuestionCount) => void
  questionCount: ChordQuestionCount
}): JSX.Element {
  const options: readonly { label: string; value: ChordQuestionCount }[] = [
    { label: '10', value: 10 },
    { label: '20', value: 20 },
    { label: '50', value: 50 },
    { label: '100', value: 100 },
    { label: '无限', value: 'endless' }
  ]
  const keyIndex = CHORD_SEQUENTIAL_MAJOR_KEY_IDS.indexOf(chordSettings.sequentialKey)
  const selectAdjacentKey = (offset: -1 | 1): void => {
    const nextIndex = (keyIndex + offset + CHORD_SEQUENTIAL_MAJOR_KEY_IDS.length) % CHORD_SEQUENTIAL_MAJOR_KEY_IDS.length
    onChordSettingsChange({ sequentialKey: CHORD_SEQUENTIAL_MAJOR_KEY_IDS[nextIndex] })
  }
  return (
    <div className="chord-drawer-backdrop" onClick={onClose}>
      <aside
        aria-labelledby="chord-settings-title"
        aria-modal="true"
        className="chord-settings-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chord-settings-drawer__header">
          <div><span className="eyebrow">练习设置</span><h2 id="chord-settings-title">和弦练习</h2></div>
          <button aria-label="关闭练习设置" className="icon-button subtle" type="button" onClick={onClose}><Icon name="close" /></button>
        </div>
        {mode === 'sequential' ? (
          <section className="chord-settings-section">
            <div className="group-title"><span>当前调</span><small>新练习开始时生效</small></div>
            <div className="chord-key-stepper">
              <button aria-label="上一个大调" type="button" onClick={() => selectAdjacentKey(-1)}>‹</button>
              <select
                aria-label="选择循序练习当前调"
                value={chordSettings.sequentialKey}
                onChange={(event) => onChordSettingsChange({ sequentialKey: event.target.value as ChordSequentialMajorKeyId })}
              >
                {CHORD_SEQUENTIAL_MAJOR_KEY_IDS.map((keyId) => <option key={keyId} value={keyId}>{formatChordKeyName(keyId)}</option>)}
              </select>
              <button aria-label="下一个大调" type="button" onClick={() => selectAdjacentKey(1)}>›</button>
            </div>
          </section>
        ) : null}
        <section className="chord-settings-section">
          <div className="group-title"><span>题数</span><small>选择本轮练习题量</small></div>
          <div className="chord-question-count" role="group" aria-label="和弦练习题数">
            {options.map((option) => (
              <button
                className={questionCount === option.value ? 'is-active' : ''}
                key={option.value}
                type="button"
                onClick={() => onQuestionCountChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <section className="chord-settings-section chord-tone-setting">
          <div className="group-title"><span>显示构成音</span><small>按当前转位顺序显示</small></div>
          <button
            aria-label={`显示构成音已${chordSettings.showChordTones ? '开启' : '关闭'}`}
            className={`mock-switch ${chordSettings.showChordTones ? 'is-on' : ''}`}
            type="button"
            onClick={() => onChordSettingsChange({ showChordTones: !chordSettings.showChordTones })}
          >
            <small>{chordSettings.showChordTones ? 'On' : 'Off'}</small><i />
          </button>
        </section>
        <section className="chord-settings-section chord-settings-summary">
          <div className="group-title"><span>本次训练</span><small>{mode === 'sequential' ? formatChordKeyName(chordSettings.sequentialKey) : '完整随机范围'}</small></div>
          <div><Icon name="check" size={18} /><span>{mode === 'sequential' ? '题数决定循序范围' : '三和弦 + 七和弦'}</span></div>
          <div><Icon name="check" size={18} /><span>{mode === 'sequential' ? '均衡题袋' : '全部转位'}</span></div>
          <div><Icon name="check" size={18} /><span>随机音区</span></div>
          <div><Icon name="check" size={18} /><span>分解 + 柱式</span></div>
        </section>
        <small className="chord-settings-note">题数和当前调将在下一轮练习开始时生效；构成音显示立即生效。</small>
      </aside>
    </div>
  )
}

function SightSettingsRows({
  onSettingsChange,
  settings
}: {
  onSettingsChange: (changes: Partial<SightReadingSettings>) => void
  settings: SightReadingSettings
}): JSX.Element {
  const answerTimeLimitSeconds = getSightReadingAnswerTimeoutMs(settings) / 1000
  return (
    <>
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
    </>
  )
}

function SightSettingsDrawer({
  onClose,
  onSettingsChange,
  settings
}: {
  onClose: () => void
  onSettingsChange: (changes: Partial<SightReadingSettings>) => void
  settings: SightReadingSettings
}): JSX.Element {
  return (
    <div className="module-settings-backdrop" onClick={onClose}>
      <aside aria-labelledby="sight-settings-title" aria-modal="true" className="module-settings-drawer" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="module-settings-drawer__header">
          <div><span className="eyebrow">下一轮生效</span><h2 id="sight-settings-title">识谱练习设置</h2></div>
          <button aria-label="关闭识谱练习设置" className="icon-button subtle" type="button" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="module-settings-rows settings-group--sight">
          <SightSettingsRows onSettingsChange={onSettingsChange} settings={settings} />
        </div>
      </aside>
    </div>
  )
}

function toChordWrittenPitches(question: ChordPracticeQuestion): readonly ChordWrittenPitch[] {
  const accidental = (value: number): ChordWrittenPitch['accidental'] => {
    if (value === -2) return 'bb'
    if (value === -1) return 'b'
    if (value === 1) return '#'
    if (value === 2) return '##'
    return null
  }
  const displayAccidental = (value: number): string => value === -2
    ? '♭♭'
    : value === -1 ? '♭' : value === 1 ? '♯' : value === 2 ? '♯♯' : ''
  return question.blockNotes.map((pitch) => {
    const vexAccidental = accidental(pitch.accidental)
    return Object.freeze({
      accidental: vexAccidental,
      clef: pitch.soundingMidi < 60 ? 'bass' : 'treble',
      letter: pitch.letter,
      octave: pitch.octave,
      soundingMidiNumber: pitch.soundingMidi,
      spelling: `${pitch.letter}${displayAccidental(pitch.accidental)}${pitch.octave}`,
      vexFlowKey: `${pitch.letter.toLowerCase()}${vexAccidental ?? ''}/${pitch.octave}`
    })
  })
}

function ChordPracticeScreen({
  caseId,
  chordSettings,
  mode,
  previewStateId,
  runtime,
  midiRuntime,
  onExplicitEnd,
  onChordSettingsChange,
  onQuestionCountChange,
  questionCount,
  theme
}: {
  caseId: string
  chordSettings: ChordSettings
  mode: ChordPracticeMode
  previewStateId: ChordPreviewStateId
  runtime: ChordPracticeRuntime
  midiRuntime: AndroidSightReadingRuntime
  onExplicitEnd: () => void
  onChordSettingsChange: (changes: Partial<Pick<ChordSettings, 'sequentialKey' | 'showChordTones'>>) => void
  onQuestionCountChange: (value: ChordQuestionCount) => void
  questionCount: ChordQuestionCount
  theme: ThemeDefinition
}): JSX.Element {
  const snapshot = useChordPracticeRuntime(runtime)
  const initialSessionConfig = useRef({ mode, questionCount, sequentialKey: chordSettings.sequentialKey })
  const preview = previewStateId === 'live' ? null : getChordMockState(previewStateId)
  const mockChord = getChordMockCase(caseId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const livePresentation = presentChordPractice(snapshot)
  const presentation: ChordPracticePresentation = preview
    ? {
        arpeggio: preview.arpeggio,
        block: preview.block,
        prompt: preview.prompt,
        semantic: previewStateId === 'question-correct'
          ? 'success'
          : previewStateId.includes('wrong') ? 'danger' : previewStateId.startsWith('wait-release') ? 'warning' : 'neutral',
        stageLabel: previewStateId.startsWith('arpeggio')
          ? '分解'
          : previewStateId.startsWith('wait-release') ? '过渡' : previewStateId === 'question-correct' ? '完成' : '柱式'
      }
    : livePresentation
  const liveQuestion = snapshot.question
  const chord = preview
    ? {
        symbol: mockChord.symbol,
        inversion: mockChord.inversion,
        writtenPitches: mockChord.writtenPitches
      }
    : liveQuestion
      ? {
          symbol: liveQuestion.chordSymbol,
          inversion: liveQuestion.chineseInversionLabel,
          writtenPitches: toChordWrittenPitches(liveQuestion)
        }
      : { symbol: '—', inversion: '正在准备', writtenPitches: [] }
  const chordToneText = preview
    ? mockChord.writtenPitches.map((pitch) => pitch.spelling.replace(/\d+$/, '')).join(' · ')
    : liveQuestion?.blockNotes.map(formatWrittenPitchClass).join(' · ') ?? ''
  const paused = !preview && snapshot.status === 'SUSPENDED'
  const resumeWaitingForRelease = snapshot.judgement?.state.phase === 'RESUME_WAIT_ALL_KEYS_UP'
  const activeQuestionCount = snapshot.questionCount
  const progressLabel = activeQuestionCount === 'endless'
    ? `已完成 ${snapshot.counters.completedQuestions}`
    : `${String(Math.min(snapshot.questionIndex, activeQuestionCount)).padStart(2, '0')} / ${activeQuestionCount}`
  const pauseBlocked = snapshot.status === 'SESSION_COMPLETE'
    || snapshot.status === 'STOPPED'
    || resumeWaitingForRelease
    || (paused && !snapshot.transportReady)
  const endActionLabel = snapshot.status === 'SESSION_COMPLETE'
    ? '完成'
    : snapshot.counters.completedQuestions > 0 ? '结束并保存' : '结束'
  const practiceActiveVisual = theme.capabilities.practiceActiveVisual
  const chordArtwork = practiceActiveVisual.kind === 'decorated-focus'
    ? practiceActiveVisual.chordArtwork ?? null
    : null

  useEffect(() => {
    const status = runtime.snapshot.status
    if (status === 'IDLE' || status === 'STOPPED') runtime.start(initialSessionConfig.current)
    if (!midiRuntime.midiReady) {
      runtime.handleTransportLost()
    }
  }, [midiRuntime, runtime])

  const leavePractice = (): void => {
    onExplicitEnd()
  }

  return (
    <div
      className={`chord-focus-frame is-${practiceActiveVisual.kind} ${chordArtwork?.frameClassName ?? ''} ${paused ? 'is-paused' : ''}`}
      data-active-visual={practiceActiveVisual.kind}
      data-chord-artwork={chordArtwork ? 'enabled' : 'none'}
      data-color-scheme={theme.colorScheme}
    >
      <header className="chord-focus-header">
        <div className="chord-focus-header__left">
          <button aria-label="返回练习" className="icon-button subtle" type="button" onClick={leavePractice}><Icon name="arrow-left" /></button>
          <div><small>PIANO FUNDAMENTALS</small><strong>{mode === 'sequential' ? '循序练习' : '综合随机'}</strong></div>
        </div>
        <div className="focus-actions">
          <MidiStatusButton compact />
          <button aria-label="练习设置" className="icon-button subtle" type="button" onClick={() => setSettingsOpen(true)}><Icon name="settings" /></button>
          <button className="outline-action" disabled={pauseBlocked} type="button" onClick={() => paused ? runtime.resume() : runtime.pause()}>
            <Icon name={paused ? 'play' : 'pause'} /><span>{paused ? '继续' : '暂停'}</span>
          </button>
          <button className="outline-action" type="button" onClick={leavePractice}>
            <Icon name="stop" /><span>{endActionLabel}</span>
          </button>
        </div>
      </header>

      <main className="chord-focus-content">
        {chordArtwork ? (
          <div className="chord-theme-artwork" aria-hidden="true">
            <img className="chord-theme-character" data-chord-theme-asset="character" src={chordArtwork.cornerCharacter} alt="" />
            <img className="chord-theme-polaroid" data-chord-theme-asset="polaroid" src={chordArtwork.polaroid} alt="" />
            <span className="chord-theme-decoration chord-theme-decoration--identity" data-chord-theme-asset="decoration" style={{ backgroundImage: `url("${chordArtwork.decorations}")` }} />
            <span className="chord-theme-decoration chord-theme-decoration--prompt" data-chord-theme-asset="decoration" style={{ backgroundImage: `url("${chordArtwork.decorations}")` }} />
            <span className="chord-theme-decoration chord-theme-decoration--footer" data-chord-theme-asset="decoration" style={{ backgroundImage: `url("${chordArtwork.decorations}")` }} />
            {presentation.semantic === 'success' ? (
              <span className="chord-theme-reward" data-chord-theme-reward="success">
                <i style={{ backgroundImage: `url("${chordArtwork.decorations}")` }} />
                <i style={{ backgroundImage: `url("${chordArtwork.decorations}")` }} />
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="chord-identity">
          <span>当前和弦</span>
          <h1>{chord.symbol}</h1>
          <strong>{chord.inversion}{chordSettings.showChordTones && chordToneText ? <span> · 构成音：{chordToneText}</span> : null}</strong>
        </div>

        <section className={`chord-notation-card has-${presentation.semantic}`} data-feedback-semantic={presentation.semantic} aria-label={`${chord.symbol} ${chord.inversion}`}>
          <div className="chord-group-labels" aria-hidden="true">
            <ChordGroupBadge label="分解" state={presentation.arpeggio} />
            <ChordGroupBadge label="柱式" state={presentation.block} />
          </div>
          <span className="chord-group-divider" aria-hidden="true" />
          <ChordGrandStaff
            arpeggioState={presentation.arpeggio}
            blockState={presentation.block}
            pitches={chord.writtenPitches}
            symbol={chord.symbol}
          />
          {paused ? (
            <div className="chord-pause-overlay"><Icon name="pause" size={34} /><strong>练习已暂停</strong></div>
          ) : null}
        </section>

        <section className={`chord-stage-prompt is-${presentation.semantic}`} aria-live="polite">
          <span className="chord-stage-prompt__icon">
            <Icon name={presentation.semantic === 'success' ? 'check' : presentation.semantic === 'danger' ? 'close' : presentation.semantic === 'warning' ? 'clock' : 'play'} />
          </span>
          <div><small>当前阶段 · {presentation.stageLabel}</small><strong>{paused ? !snapshot.transportReady ? 'MIDI 已断开，练习已安全暂停' : resumeWaitingForRelease ? '请先松开琴键以继续' : '练习已暂停' : presentation.prompt}</strong></div>
        </section>

        <footer className="chord-progress-footer">
          <span><small>{activeQuestionCount === 'endless' ? '进度' : '当前题目'}</small><strong>{progressLabel}</strong></span>
          <i />
          <span><small>本轮状态</small><strong>连续正确 {snapshot.counters.currentFirstPassStreak}</strong></span>
        </footer>
      </main>

      {settingsOpen ? (
        <ChordSettingsDrawer
          chordSettings={chordSettings}
          mode={mode}
          onClose={() => setSettingsOpen(false)}
          onChordSettingsChange={onChordSettingsChange}
          onQuestionCountChange={onQuestionCountChange}
          questionCount={questionCount}
        />
      ) : null}
    </div>
  )
}

function SightReadyScreen({
  onStart,
  onSettingsChange,
  settings
}: {
  onStart: () => void
  onSettingsChange: (changes: Partial<SightReadingSettings>) => void
  settings: SightReadingSettings
}): JSX.Element {
  const { runtime } = useMidiUi()
  const { openAuxiliary } = useAppNavigation()
  const midiStatus = presentMidiStatus(runtime)
  const answerTimeLimitSeconds = getSightReadingAnswerTimeoutMs(settings) / 1000
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <ProductFrame active="practice" onBack={() => navigate('practice')} title="识谱练习">
      <section className="ready-layout">
        <div className="ready-stage">
          <div className="section-heading">
            <div><span className="eyebrow">练习预览</span><h1>{STAFF_MODE_LABELS[settings.staffMode]}识谱</h1></div>
            <div className="ready-heading-actions">
              <span className="ready-badge">准备就绪</span>
              <button aria-label="识谱练习设置" className="icon-button" type="button" onClick={() => setSettingsOpen(true)}><Icon name="settings" /></button>
            </div>
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
            <p>{midiStatus.tone === 'connected'
              ? `${midiStatus.label}，可以直接弹奏目标音。`
              : '开始前请打开 MIDI 页面，连接 MIDI 设备。'}</p>
          </div>
          <div className="setting-summary">
            <div><small>谱表</small><strong>{STAFF_MODE_LABELS[settings.staffMode]}</strong></div>
            <div><small>调性</small><strong>{getMajorKeySignature(settings.keySignature).displayName}</strong></div>
            <div><small>题数</small><strong>{settings.questionCount}</strong></div>
            <div><small>每题时限</small><strong>固定 {answerTimeLimitSeconds} 秒</strong></div>
          </div>
          <button className="ready-device" type="button" onClick={() => openAuxiliary('midi')}>
            <span><Icon name="bluetooth" /></span><div><strong>{midiStatus.label}</strong><small>{midiStatus.detail}</small></div><i className={`is-${midiStatus.tone}`} />
          </button>
          <button className="primary-action is-wide" type="button" onClick={onStart}>
            <Icon name="play" />开始练习
          </button>
        </aside>
      </section>
      {settingsOpen ? <SightSettingsDrawer onClose={() => setSettingsOpen(false)} onSettingsChange={onSettingsChange} settings={settings} /> : null}
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
  onStopAndSave,
  runtime,
  screen,
  settings,
  snapshot,
  theme
}: {
  onStopAndSave: () => void
  runtime: AndroidSightReadingRuntime
  screen: ScreenId
  settings: SightReadingSettings
  snapshot: SightRuntimeSnapshot
  theme: ThemeDefinition
}): JSX.Element {
  const practiceActiveVisual = theme.capabilities.practiceActiveVisual
  const decoratedFocus = practiceActiveVisual.kind === 'decorated-focus' ? practiceActiveVisual : null
  const showEarlyEndConfirm = screen === 'sight-early-end'
  const feedbackPresentation = presentSightReadingFeedback(snapshot.phase === 'feedback', snapshot.result)
  const isCorrect = feedbackPresentation.semantic === 'success'
  const isWrong = feedbackPresentation.semantic === 'danger'
  const isTimeout = feedbackPresentation.semantic === 'warning'
  const feedback = feedbackPresentation.noteFeedback
  const targetName = snapshot.currentTargetNotes.map((note) => note.noteName).join(' + ') || '—'
  const intervalLabel = snapshot.currentIntervalLabel
  const midiStatus = presentMidiStatus(runtime)
  const transportPause = runtime.midiSource !== 'development' && runtime.midiResumeRequired
  const resumeBlocked = transportPause && !runtime.midiReady
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
    onStopAndSave()
  }

  return (
    <div
      className={`focus-frame ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''} ${isTimeout ? 'is-timeout' : ''} ${snapshot.isPaused ? 'is-paused' : ''} ${decoratedFocus?.frameClassName ?? ''}`}
      data-active-visual={practiceActiveVisual.kind}
      data-feedback-semantic={feedbackPresentation.semantic}
    >
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
            noteFeedback={feedback}
            staffMode={settings.staffMode}
          />
          {decoratedFocus ? (
            <>
              <span aria-hidden="true" className="focus-active-decoration focus-active-decoration--tape">
                <img alt="" draggable="false" src={decoratedFocus.assets.decorations} />
              </span>
              <span aria-hidden="true" className="focus-active-decoration focus-active-decoration--sparkles">
                <img alt="" draggable="false" src={decoratedFocus.assets.decorations} />
              </span>
              <img
                alt=""
                aria-hidden="true"
                className="focus-active-character"
                draggable="false"
                src={decoratedFocus.assets.cornerCharacter}
              />
            </>
          ) : null}
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
    <ProductFrame active="practice" onBack={() => navigate('practice')} title="本轮完成">
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
              <><small>本轮最需留意</small><strong><SightNoteValue value={primaryError} /></strong><p>这个目标音在本轮出现了 {primaryErrorCount} 次错误或超时。</p></>
            ) : (
              <><small>本轮最需留意</small><strong><SightNoteValue value={primaryError} /></strong><p>本轮没有发现需要优先处理的目标音。</p></>
            )}</div>
          </div>
          <div className="result-actions">
            <button className="secondary-action" type="button" onClick={() => navigate('sight-ready')}>再练一轮</button>
            <button className="primary-action" type="button" onClick={() => navigate('practice')}><Icon name="check" />完成</button>
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

function formatIntervalAccuracy(value: number | null): string {
  return value === null ? '—' : `${formatHistoryPercentage(value)}%`
}

function IntervalReportFacts({ report }: { report: IntervalPracticeReportDraft }): JSX.Element {
  const difficult = getDifficultIntervals(report)
  const settingCount = report.settings.questionCountMode === 'infinite'
    ? '无限练习'
    : `固定 ${report.settings.configuredQuestionCount} 题`
  return (
    <div className="interval-report-sections">
      <section className="chord-report-card chord-report-overview" aria-labelledby="interval-report-overview-title">
        <div className="chord-report-card__heading"><div><span className="eyebrow">本轮概览</span><h2 id="interval-report-overview-title">练习结果</h2></div></div>
        <dl className="chord-report-metrics interval-report-metrics">
          <div><dt>完成题数</dt><dd>{report.completedQuestions}</dd></div>
          <div className="is-primary"><dt>首次正确率</dt><dd>{formatIntervalAccuracy(report.firstTryAccuracy)}</dd></div>
          <div><dt>重试后答对</dt><dd>{report.retriedCorrectCount}</dd></div>
          <div><dt>错误尝试</dt><dd>{report.totalWrongAttempts}</dd></div>
        </dl>
        <p className="chord-report-explanation">首次正确率只统计未发生完整错误尝试便答对的题目。</p>
      </section>
      <section className="chord-report-card" aria-labelledby="interval-report-difficult-title">
        <div className="chord-report-card__heading"><div><span className="eyebrow">学习重点</span><h2 id="interval-report-difficult-title">易错音程</h2></div></div>
        {report.completedQuestions === 0 ? <p className="interval-report-empty">暂无数据</p>
          : difficult.length === 0 ? <p className="interval-report-empty">本轮没有明显易错音程</p>
            : <ol className="interval-difficult-list">{difficult.map((entry) => (
              <li key={entry.intervalId}><strong><IntervalDisplayName intervalId={entry.intervalId} /></strong><span>首次失误 {entry.presentedCount - entry.firstTryCorrectCount} 题 · 错误尝试 {entry.wrongAttemptCount} 次</span></li>
            ))}</ol>}
      </section>
      <section className="chord-report-card interval-performance-card" aria-labelledby="interval-performance-title">
        <div className="chord-report-card__heading"><div><span className="eyebrow">分类统计</span><h2 id="interval-performance-title">本轮音程表现</h2></div><small>仅显示本轮出现过的音程</small></div>
        {report.perIntervalStats.length === 0 ? <p className="interval-report-empty">暂无数据</p> : (
          <div className="interval-performance-list">
            {report.perIntervalStats.map((entry) => (
              <article key={entry.intervalId}>
                <strong><IntervalDisplayName intervalId={entry.intervalId} /></strong>
                <span>出现 {entry.presentedCount} 次</span>
                <span>首次正确 {entry.firstTryCorrectCount}</span>
                <span>重试后正确 {entry.retriedCorrectCount}</span>
                <span>错误尝试 {entry.wrongAttemptCount}</span>
                <em>{formatIntervalAccuracy(entry.firstTryAccuracy)}</em>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="chord-report-card" aria-labelledby="interval-report-settings-title">
        <div className="chord-report-card__heading"><div><span className="eyebrow">历史快照</span><h2 id="interval-report-settings-title">本轮设置</h2></div></div>
        <dl className="chord-report-rows chord-report-session">
          <div><dt>答案提示</dt><dd>{report.settings.answerHint ? '开启' : '关闭'}</dd></div>
          <div><dt>低音包含升降号</dt><dd>{report.settings.includeAccidentalRoots ? '开启' : '关闭'}</dd></div>
          <div><dt>练习题数</dt><dd>{settingCount}</dd></div>
        </dl>
      </section>
    </div>
  )
}

function IntervalResultScreen({ report }: { report: IntervalPracticeReportDraft }): JSX.Element {
  const completed = report.completionStatus === 'COMPLETED'
  return (
    <ProductFrame active="practice" onBack={() => navigate('interval-practice')} title={completed ? '练习完成' : '本轮已结束'}>
      <section className="chord-report-detail interval-result-page">
        <div className="chord-report-detail__body">
          <header className="chord-report-identity">
            <div><span className="eyebrow">音程练习结果</span><h1>{completed ? '练习完成' : '本轮已结束'}</h1><p>{completed ? '已完成本轮设定题数。' : '已保存本轮真正完成的题目与统计。'}</p></div>
            <span className={`chord-report-status is-${completed ? 'completed' : 'stopped'}`}>{completed ? '已完成' : '提前结束'}</span>
          </header>
          <IntervalReportFacts report={report} />
          <div className="result-actions interval-result-actions">
            <button className="secondary-action" type="button" onClick={() => navigate('interval-practice')}>再练一轮</button>
            <button className="primary-action" type="button" onClick={() => navigate('history')}><Icon name="history" />查看练习记录</button>
          </div>
        </div>
      </section>
    </ProductFrame>
  )
}

function IntervalReportDetailScreen({ onBack, report }: { onBack: () => void; report: IntervalPracticeReportV1 | null }): JSX.Element {
  if (!report) return (
    <ProductFrame active="history" onBack={onBack} title="音程练习报告">
      <section className="chord-report-detail is-unavailable"><div className="chord-report-unavailable" role="status"><span className="history-row__mark"><Icon name="info" /></span><div><h1>记录不可用</h1><p>这条练习记录无法读取。</p></div><button className="primary-action" type="button" onClick={onBack}>返回记录</button></div></section>
    </ProductFrame>
  )
  return (
    <ProductFrame active="history" onBack={onBack} title="音程练习报告">
      <section className="chord-report-detail">
        <div className="chord-report-detail__body">
          <header className="chord-report-identity"><div><span className="eyebrow">练习记录</span><h1>音程练习</h1><p>以下内容来自本轮已保存的练习事实。</p></div><span className={`chord-report-status is-${report.completionStatus === 'COMPLETED' ? 'completed' : 'stopped'}`}>{report.completionStatus === 'COMPLETED' ? '已完成' : '提前结束'}</span></header>
          <IntervalReportFacts report={report} />
        </div>
      </section>
    </ProductFrame>
  )
}

type HistoryFilter = HistoryDashboardFilter

function HistoryTrendChart({ buckets }: { buckets: readonly HistoryDailyBucket[] }): JSX.Element {
  const width = 560
  const height = 152
  const plotLeft = 30
  const plotRight = 544
  const plotTop = 12
  const plotBottom = 118
  const plotWidth = plotRight - plotLeft
  const plotHeight = plotBottom - plotTop
  const divisor = Math.max(1, buckets.length - 1)
  const maxQuestions = Math.max(1, ...buckets.map((bucket) => bucket.completedQuestions))
  const maxSessions = Math.max(1, ...buckets.map((bucket) => bucket.sessions))
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: plotLeft + index / divisor * plotWidth,
    y: plotBottom - bucket.completedQuestions / maxQuestions * plotHeight
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const barWidth = Math.max(3, Math.min(18, plotWidth / Math.max(1, buckets.length) * 0.48))
  const hasActivity = buckets.some((bucket) => bucket.sessions > 0 || bucket.completedQuestions > 0)
  const labelStep = buckets.length <= 8 ? 1 : Math.ceil(buckets.length / 6)

  return (
    <div className="history-trend-chart" aria-label="按本地自然日统计的练习趋势" role="img">
      <svg viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.5, 1].map((ratio) => {
          const y = plotTop + ratio * plotHeight
          return <line className="history-trend-chart__grid" key={ratio} x1={plotLeft} x2={plotRight} y1={y} y2={y} />
        })}
        {points.map((point) => {
          const barHeight = point.sessions / maxSessions * (plotHeight * 0.66)
          return <rect className="history-trend-chart__bar" height={barHeight} key={`bar-${point.dateKey}`} rx="3" width={barWidth} x={point.x - barWidth / 2} y={plotBottom - barHeight} />
        })}
        {hasActivity ? <path className="history-trend-chart__line" d={path} /> : null}
        {hasActivity ? points.map((point) => (
          <circle className="history-trend-chart__point" cx={point.x} cy={point.y} key={`point-${point.dateKey}`} r="3.5" />
        )) : null}
        {points.map((point, index) => (
          index % labelStep === 0 || index === points.length - 1
            ? <text className="history-trend-chart__label" key={`label-${point.dateKey}`} textAnchor="middle" x={point.x} y={143}>{point.label}</text>
            : null
        ))}
      </svg>
      {!hasActivity ? <span className="history-trend-chart__empty">当前范围内暂无练习记录</span> : null}
    </div>
  )
}

function HistoryRecord({
  item,
  onOpenChordReport,
  onOpenIntervalReport
}: {
  item: MixedPracticeHistoryItem
  onOpenChordReport: (recordId: string) => void
  onOpenIntervalReport: (recordId: string) => void
}): JSX.Element {
  if (item.module === 'chord') {
    const completed = item.plannedQuestionCount === null
      ? `完成 ${item.completedQuestions}`
      : `完成 ${item.completedQuestions}/${item.plannedQuestionCount}`
    return (
      <button
        aria-label={`打开${item.modeSummary}练习报告`}
        className={`history-row is-${item.completionReason} is-interactive`}
        type="button"
        onClick={() => onOpenChordReport(item.recordId)}
      >
        <span className="history-row__mark"><Icon name="book" /></span>
        <span className="history-row__copy">
          <small><b className="history-module-badge is-chord">和弦</b>{formatHistoryTimestamp(item.endedAt)} · {item.statusLabel}</small>
          <strong>{item.modeSummary}</strong>
          <em>{completed} · 错误 {item.totalErrors} · 练习时长 {formatHistoryDuration(item.practiceDurationMs)}</em>
        </span>
        <span className="history-row__score"><strong>{formatHistoryPercentage(item.firstPassCompletionRate)}%</strong><small>完成率 <Icon name="chevron" size={13} /></small></span>
      </button>
    )
  }
  if (item.module === 'interval') {
    const completed = item.configuredQuestionCount === null
      ? `完成 ${item.completedQuestions} 题`
      : `完成 ${item.completedQuestions}/${item.configuredQuestionCount}`
    return (
      <button aria-label={`打开${item.modeSummary}练习报告`} className={`history-row is-${item.completionStatus.toLowerCase()} is-interactive`} type="button" onClick={() => onOpenIntervalReport(item.recordId)}>
        <span className="history-row__mark"><Icon name="grid" /></span>
        <span className="history-row__copy"><small><b className="history-module-badge is-interval">音程</b>{formatHistoryTimestamp(item.endedAt)} · {item.statusLabel}</small><strong>{item.modeSummary}</strong><em>{completed} · 重试后答对 {item.retriedCorrectCount} · 错误尝试 {item.totalWrongAttempts}</em></span>
        <span className="history-row__score"><strong>{formatIntervalAccuracy(item.firstTryAccuracy)}</strong><small>首次正确率 <Icon name="chevron" size={13} /></small></span>
      </button>
    )
  }
  return (
    <article className={`history-row is-${item.completionState}`}>
      <span className="history-row__mark"><Icon name="book" /></span>
      <span className="history-row__copy">
        <small><b className="history-module-badge">识谱</b>{formatHistoryTimestamp(item.endedAt)} · {item.statusLabel}</small>
        <strong>{item.title}</strong>
        <em>{item.settingsSummary} · 完成 {item.completed}/{item.plannedQuestionCount} · 正确 {item.correct} / 错误 {item.wrong} / 超时 {item.timeout} · {formatHistoryDuration(item.durationMs)}</em>
      </span>
      <span className="history-row__score"><strong>{formatHistoryPercentage(item.accuracy)}%</strong><small>正确率</small></span>
    </article>
  )
}

function HistoryScreen({
  chordHistory,
  chordPersistence,
  filter,
  intervalHistory,
  intervalPersistence,
  onFilterChange,
  onOpenChordReport,
  onOpenIntervalReport,
  runtime,
  theme
}: {
  chordHistory: ChordPersistenceSnapshot
  chordPersistence: ChordReportPersistenceCoordinator
  filter: HistoryFilter
  intervalHistory: IntervalPersistenceSnapshot
  intervalPersistence: IntervalReportPersistenceCoordinator
  onFilterChange: (filter: HistoryFilter) => void
  onOpenChordReport: (recordId: string, filter: HistoryFilter) => void
  onOpenIntervalReport: (recordId: string, filter: HistoryFilter) => void
  runtime: AndroidSightReadingRuntime
  theme: ThemeDefinition
}): JSX.Element {
  const history = runtime.historySnapshot
  const sightProjection = projectSightReadingHistory(history.records)
  const chordItems = projectChordHistory(chordHistory.records)
  const intervalItems = projectIntervalHistory(intervalHistory.records)
  const mixedItems = projectMixedPracticeHistory(history.records, chordHistory.records, intervalHistory.records)
  const [trendRange, setTrendRange] = useState<HistoryDashboardRange>('7d')
  const dashboard = projectHistoryDashboard(history.records, chordHistory.records, intervalHistory.records, { filter, range: trendRange })
  const historyVisual = theme.capabilities.historyVisual
  const composedHistory = historyVisual.kind === 'dashboard' ? historyVisual : null
  useEffect(() => {
    void runtime.refreshHistory()
    void chordPersistence.refresh()
    void intervalPersistence.refresh()
  }, [chordPersistence, intervalPersistence, runtime])

  const nonSightItems: readonly MixedPracticeHistoryItem[] = filter === 'chord' ? chordItems : mixedItems
  const visibleItems: readonly MixedPracticeHistoryItem[] = filter === 'sight'
    ? sightProjection.items.map((item) => ({ module: 'sight' as const, ...item }))
    : filter === 'interval' ? intervalItems : nonSightItems
  const anyLoading = history.status === 'loading' || chordHistory.status === 'loading' || intervalHistory.status === 'loading'
  const anyError = history.status === 'error' || chordHistory.status === 'error' || intervalHistory.status === 'error'
  const anyWarning = Boolean(history.warning || chordHistory.warning || intervalHistory.warning)
  const listStatus = anyLoading
    ? '正在同步本地记录'
    : anyError
      ? `共 ${visibleItems.length} 条 · 读取异常`
      : anyWarning
        ? `共 ${visibleItems.length} 条 · 部分记录不可用`
        : `共 ${visibleItems.length} 条记录`
  const emptyTitle = filter === 'interval' ? '暂无音程练习记录' : filter === 'chord'
    ? '暂无和弦练习记录'
    : filter === 'sight' ? '暂无识谱练习记录' : '暂无练习记录'
  const emptyDetail = filter === 'interval' ? '完成音程练习后，结果会显示在这里。' : filter === 'chord'
    ? '完成和弦练习后，记录会显示在这里。'
    : filter === 'sight' ? '完成一轮识谱练习后，结果会显示在这里。' : '完成一轮练习后，结果会显示在这里。'
  return (
    <ProductFrame active="history" className={composedHistory?.frameClassName} title="练习记录">
      <section className={`history-screen history-dashboard${composedHistory ? ' themed-history-dashboard' : ''}`}>
        <section className="history-dashboard__hero" aria-labelledby="history-dashboard-title">
          {composedHistory ? <img className="history-dashboard__hero-art" src={composedHistory.assets.hero} alt="" aria-hidden="true" /> : null}
          <div className="history-dashboard__hero-copy">
            <span className="eyebrow">PRACTICE JOURNAL</span>
            <h1 id="history-dashboard-title">每一次坚持，<br />都让梦想更靠近。</h1>
            <p>{dashboard.summary.totalSessions > 0 ? `这里保存着 ${dashboard.summary.totalSessions} 次练习。` : '完成一次练习后，这里会留下你的进步。'}</p>
          </div>
          {composedHistory ? <img className="history-dashboard__hero-memo" src={composedHistory.assets.memo} alt="" aria-hidden="true" /> : null}
        </section>

        <section className="history-dashboard__summary" aria-label="练习汇总">
          <article className="history-stat-card is-sessions"><span><Icon name="chart" /></span><div><small>已保存练习</small><strong>{dashboard.summary.totalSessions}<b>次</b></strong><p>识谱、和弦与音程练习记录</p></div></article>
          <article className="history-stat-card is-streak"><span><Icon name="grid" /></span><div><small>连续练习天数</small><strong>{dashboard.summary.currentStreakDays}<b>天</b></strong><p>按本地日期统计</p></div></article>
          <article className="history-stat-card is-questions"><span><Icon name="book" /></span><div><small>累计完成题数</small><strong>{dashboard.summary.totalCompletedQuestions}<b>题</b></strong><p>包含已保存的练习</p></div></article>
        </section>

        <div className="history-dashboard__workspace">
          <section className="history-list history-dashboard__recent">
            <div className="history-dashboard__section-heading">
              <div><span className="eyebrow">RECENT PRACTICE</span><h2>最近练习记录</h2></div>
              <span>{listStatus}</span>
            </div>
            <div className="history-filter" aria-label="练习模块筛选" role="group">
              {([['all', '全部'], ['sight', '识谱'], ['chord', '和弦'], ['interval', '音程']] as const).map(([value, label]) => (
                <button className={filter === value ? 'is-active' : ''} key={value} type="button" onClick={() => onFilterChange(value)}>{label}</button>
              ))}
            </div>
            <div className="history-list__rows">
              {visibleItems.length > 0
                ? visibleItems.map((item) => <HistoryRecord item={item} key={`${item.module}-${item.recordId}`} onOpenChordReport={(recordId) => onOpenChordReport(recordId, filter)} onOpenIntervalReport={(recordId) => onOpenIntervalReport(recordId, filter)} />)
                : (
                  <div className="history-empty" role={anyError ? 'alert' : 'status'}>
                    <span className="history-row__mark"><Icon name={anyError ? 'info' : 'history'} /></span>
                    <div><strong>{anyLoading ? '正在读取本地记录…' : anyError ? '暂时无法读取练习记录' : emptyTitle}</strong><p>{anyError ? '已保存的数据不会被替换；稍后重新进入记录页可再次读取。' : emptyDetail}</p></div>
                  </div>
                )}
            </div>
            {composedHistory ? <img className="history-dashboard__lower-decor" src={composedHistory.assets.lower} alt="" aria-hidden="true" /> : null}
          </section>

          <section className="history-dashboard__trend">
            <div className="history-dashboard__section-heading">
              <div><span className="eyebrow">PRACTICE TREND</span><h2>练习趋势</h2></div>
              <div className="history-range-filter" aria-label="趋势时间范围" role="group">
                {([['7d', '近7天'], ['30d', '近30天'], ['all', '全部']] as const).map(([value, label]) => (
                  <button className={trendRange === value ? 'is-active' : ''} key={value} type="button" onClick={() => setTrendRange(value)}>{label}</button>
                ))}
              </div>
            </div>
            <HistoryTrendChart buckets={dashboard.trend} />
            <div className="history-trend-legend"><span className="is-line"><i />完成题数</span><span className="is-bar"><i />练习次数</span></div>
            <p className="history-trend-note">{filter === 'all' ? '展示识谱与和弦的练习次数和完成题数，并包含音程练习。' : filter === 'sight' ? '当前仅显示识谱练习活动量。' : filter === 'chord' ? '当前仅显示和弦练习活动量。' : '当前仅显示音程练习活动量。'}</p>
            {composedHistory ? <img className="history-dashboard__trend-decor" src={composedHistory.assets.trend} alt="" aria-hidden="true" /> : null}
          </section>
        </div>
      </section>
    </ProductFrame>
  )
}

function ChordReportDetailScreen({
  onBack,
  report
}: {
  onBack: () => void
  report: ChordPersistenceSnapshot['records'][number] | null
}): JSX.Element {
  if (!report) {
    return (
      <ProductFrame active="history" onBack={onBack} title="和弦练习报告">
        <section className="chord-report-detail is-unavailable">
          <div className="chord-report-unavailable" role="status">
            <span className="history-row__mark"><Icon name="info" /></span>
            <div><h1>记录不可用</h1><p>这条练习记录无法读取。</p></div>
            <button className="primary-action" type="button" onClick={onBack}>返回记录</button>
          </div>
        </section>
      </ProductFrame>
    )
  }

  const detail = projectChordReportDetail(report)
  return (
    <ProductFrame active="history" onBack={onBack} title="和弦练习报告">
      <section className="chord-report-detail">
        <div className="chord-report-detail__body">
          <header className="chord-report-identity">
            <div><span className="eyebrow">练习记录</span><h1>{detail.modeIdentity}</h1><p>以下内容来自本轮已保存的练习事实。</p></div>
            <span className={`chord-report-status is-${report.completionReason}`}>{detail.statusLabel}</span>
          </header>
          <div className="chord-report-columns">
            <div className="chord-report-column">
              <section className="chord-report-card chord-report-overview" aria-labelledby="chord-report-overview-title">
                <div className="chord-report-card__heading"><div><span className="eyebrow">本轮概览</span><h2 id="chord-report-overview-title">练习结果</h2></div></div>
                <dl className="chord-report-metrics">
                  {detail.overviewMetrics.map((metric) => (
                    <div className={metric.primary ? 'is-primary' : ''} key={metric.label}>
                      <dt>{metric.label}</dt><dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="chord-report-explanation">分解与柱式均首次成功，才计为首次通过。</p>
              </section>
              <section className="chord-report-card" aria-labelledby="chord-report-errors-title">
                <div className="chord-report-card__heading"><div><span className="eyebrow">事实计数</span><h2 id="chord-report-errors-title">错误分布</h2></div></div>
                <dl className="chord-report-error-grid">
                  {detail.errorRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
                </dl>
              </section>
            </div>
            <div className="chord-report-column">
              <section className="chord-report-card" aria-labelledby="chord-report-timing-title">
                <div className="chord-report-card__heading"><div><span className="eyebrow">中位数</span><h2 id="chord-report-timing-title">演奏时间</h2></div><small>按已完成题目汇总</small></div>
                <dl className="chord-report-rows chord-report-timing">
                  {detail.timingRows.map((row) => (
                    <div key={row.id}><dt>{row.label}</dt><dd><strong>{row.value}</strong><small>{row.sampleLabel}</small></dd></div>
                  ))}
                </dl>
              </section>
              <section className="chord-report-card" aria-labelledby="chord-report-session-title">
                <div className="chord-report-card__heading"><div><span className="eyebrow">历史快照</span><h2 id="chord-report-session-title">本轮信息</h2></div></div>
                <dl className="chord-report-rows chord-report-session">
                  {detail.sessionRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
                </dl>
              </section>
            </div>
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
    <span className="setting-select-wrap">
      <select
        aria-label={ariaLabel}
        className="setting-select"
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value)
          if (selected) onChange(selected.value)
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Icon name="chevron-down" size={17} />
    </span>
  )
}

const SETTINGS_THEME_OPTIONS: readonly {
  id: ThemeId
  label: string
  description: string
  icon: IconName
}[] = [
  { id: 'light', label: '浅色', description: '明亮清晰', icon: 'sun' },
  { id: 'dark', label: '深色', description: '低光舒适', icon: 'moon' }
]

function SettingsThemeOption({
  active,
  description,
  icon,
  label,
  onSelect,
  preview
}: {
  active: boolean
  description: string
  icon: IconName
  label: string
  onSelect: () => void
  preview: ThemeId
}): JSX.Element {
  return (
    <button
      aria-pressed={active}
      className={`settings-theme-option is-${preview}${active ? ' is-active' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className="settings-theme-option__preview" aria-hidden="true">
        <i /><i /><i />
        <Icon name={icon} size={18} />
      </span>
      <span><strong>{label}</strong><small>{description}</small></span>
      {active ? <span className="settings-theme-option__check"><Icon name="check" size={16} /></span> : null}
    </button>
  )
}

const THEME_PACKAGE_STAGE_LABELS: Readonly<Record<string, string>> = {
  READING: '正在读取', VALIDATING: '正在验证', CHECKING_SIGNATURE: '正在检查签名',
  CHECKING_ASSETS: '正在检查素材', READY_TO_INSTALL: '等待安装确认', INSTALLING: '正在安装', INSTALLED: '安装完成'
}

function useThemeRuntime(manager: ThemeRuntimeManager): ThemeRuntimeSnapshot {
  return useSyncExternalStore(manager.subscribe, () => manager.snapshot, () => manager.snapshot)
}

function ExternalThemeCard({ active, record, onActivate, onInfo }: {
  active: boolean
  record: InstalledThemeRecord
  onActivate: () => void
  onInfo: () => void
}): JSX.Element {
  const { t } = useTranslation('settings')
  return (
    <article className={`settings-external-theme${active ? ' is-active' : ''}`}>
      <button className="settings-external-theme__main" type="button" onClick={onActivate}>
        <span className="settings-external-theme__mark" aria-hidden="true"><Icon name="grid" size={20} /></span>
        <span><strong>{record.name}</strong><small>{t('externalSummary', { subtitle: record.subtitle, version: record.version })}</small></span>
        {active ? <span className="settings-theme-option__check"><Icon name="check" size={16} /></span> : null}
      </button>
      <button className="settings-external-theme__info" type="button" onClick={onInfo}>{t('themeInfo')}</button>
    </article>
  )
}

function ThemePackageDialog({ manager, onClose }: { manager: ThemeRuntimeManager; onClose: () => void }): JSX.Element {
  const snapshot = useThemeRuntime(manager)
  const inspection = snapshot.inspection
  const stageLabel = snapshot.progressStage ? THEME_PACKAGE_STAGE_LABELS[snapshot.progressStage] ?? snapshot.progressStage : null
  return (
    <div className="theme-manager-modal" role="dialog" aria-modal="true" aria-label="导入主题包">
      <div className="theme-manager-modal__card">
        <header><span><strong>{inspection ? '安装主题' : '导入主题包'}</strong><small>{stageLabel ?? '使用 Android 系统文件选择器选择 .pftheme'}</small></span><button type="button" onClick={onClose} aria-label="关闭">×</button></header>
        {snapshot.errorCode ? <p className="theme-manager-error" role="alert">{THEME_PACKAGE_ERRORS[snapshot.errorCode] ?? `主题处理失败（${snapshot.errorCode}）`}</p> : null}
        {inspection ? (
          <section className="theme-package-inspection">
            <div className="theme-package-inspection__preview"><Icon name="grid" size={34} /></div>
            <dl>
              <div><dt>主题</dt><dd>{inspection.name}</dd></div><div><dt>副标题</dt><dd>{inspection.subtitle}</dd></div>
              <div><dt>版本</dt><dd>{inspection.version}</dd></div><div><dt>签名</dt><dd>{inspection.signatureStatus === 'VERIFIED' ? '已验证' : inspection.signatureStatus}</dd></div>
              <div><dt>兼容范围</dt><dd>{inspection.minAppVersion} – &lt; {inspection.maxAppVersionExclusive}</dd></div>
            </dl>
            <button className="primary-action" type="button" disabled={snapshot.progressStage === 'INSTALLING'} onClick={() => { void manager.installInspected() }}>{snapshot.installed.some((item) => item.themeId === inspection.themeId) ? '更新主题' : '安装'}</button>
          </section>
        ) : (
          <button className="primary-action" type="button" onClick={() => { void manager.inspectPackage().catch(() => {}) }}>选择主题包</button>
        )}
      </div>
    </div>
  )
}

function ThemeInfoDialog({ active, manager, record, onClose }: { active: boolean; manager: ThemeRuntimeManager; record: InstalledThemeRecord; onClose: () => void }): JSX.Element {
  const [status, setStatus] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="theme-manager-modal" role="dialog" aria-modal="true" aria-label="主题信息">
      <div className="theme-manager-modal__card theme-manager-modal__card--info">
        <header><span><strong>主题信息</strong><small>{record.name}</small></span><button type="button" onClick={onClose} aria-label="关闭">×</button></header>
        <dl className="theme-info-list">
          <div><dt>名称</dt><dd>{record.name}</dd></div><div><dt>版本</dt><dd>{record.version}</dd></div>
          <div><dt>themeId</dt><dd>{record.themeId}</dd></div><div><dt>Theme API</dt><dd>{record.themeApiVersion}</dd></div>
          <div><dt>签名状态</dt><dd>已验证</dd></div><div><dt>签名 keyId</dt><dd>{record.trustKeyId ?? '未签名调试包'}</dd></div>
          <div><dt>安装日期</dt><dd>{new Date(record.installedAt).toLocaleString()}</dd></div><div><dt>兼容范围</dt><dd>{record.minAppVersion} – &lt; {record.maxAppVersionExclusive}</dd></div>
        </dl>
        {status ? <p className="theme-manager-status" aria-live="polite">{status}</p> : null}
        <footer>
          <button type="button" onClick={() => { setStatus('正在验证主题…'); void manager.verify(record).then(() => setStatus('主题完整')).catch((error) => { setStatus(THEME_PACKAGE_ERRORS[String((error as Error).message)] ?? '主题验证失败'); if (active) void manager.recoverExternal('VERIFY_FAILED') }) }}>验证主题</button>
          {confirmDelete
            ? <><span>确认删除{active ? '（将先切换浅色）' : ''}？</span><button className="danger-action" type="button" onClick={() => { void manager.remove(record).then(onClose) }}>确认删除</button></>
            : <button className="danger-action" type="button" onClick={() => setConfirmDelete(true)}>删除主题</button>}
        </footer>
      </div>
    </div>
  )
}

function SettingsScreen({
  theme,
  themeManager
}: {
  theme: ThemeDefinition
  themeManager: ThemeRuntimeManager
}): JSX.Element {
  const { t } = useTranslation('settings')
  const { t: midiT } = useTranslation('midi')
  const { runtime } = useMidiUi()
  const { snapshot: updater } = useUpdaterUi()
  const { openAuxiliary } = useAppNavigation()
  const settingsVisual = theme.capabilities.settingsVisual
  const themeRuntime = useThemeRuntime(themeManager)
  const [showImporter, setShowImporter] = useState(false)
  const [infoRecord, setInfoRecord] = useState<InstalledThemeRecord | null>(null)
  const composedSettings = settingsVisual.kind === 'hero-cards' ? settingsVisual : null
  const visibleThemeOptions = SETTINGS_THEME_OPTIONS
  const midiStatus = presentLocalizedMidiStatus(runtime, midiT)
  const updaterLabel = updater.status === 'updateAvailable'
    ? t('updateAvailable')
    : updater.status === 'readyToInstall'
      ? t('updateVerified')
      : updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'verifying'
        ? t('updateProcessing')
        : updater.status === 'error' ? t('updateNeedsAttention') : t('checkUpdates')
  const installedVersionAction = updater.installed ? `V${updater.installed.versionName}` : `V${__ANDROID_VERSION_NAME__}`
  const installedVersionDescription = updater.installed
    ? t('versionCode', { code: updater.installed.versionCode })
    : t('versionCode', { code: __ANDROID_VERSION_CODE__ })
  return (
    <ProductFrame
      active="settings"
      className={[composedSettings?.frameClassName, Capacitor.isNativePlatform() ? 'has-external-theme-manager' : ''].filter(Boolean).join(' ')}
      title={t('title')}
    >
      <section className={`settings-dashboard${composedSettings ? ' has-settings-visual' : ''}`}>
        {composedSettings ? (
          <aside className="settings-hero" aria-label={t('heroLabel')}>
            <img alt={t('heroAlt')} src={composedSettings.assets.hero} />
            <div className="settings-hero__caption">
              <span>MY FAVORITE SETUP</span>
              <h1>让喜欢的声音，<br />一直陪着练习。</h1>
              <p>连接设备、选择主题，也别忘了保持应用更新。</p>
            </div>
          </aside>
        ) : null}
        <div className="settings-panels">
          <section className="settings-group settings-card settings-card--midi">
            <div className="group-title"><span>{t('device')}</span><small>{t('deviceDescription')}</small></div>
            <SettingRow
              description={midiStatus.detail}
              icon="bluetooth"
              onClick={() => openAuxiliary('midi')}
              title={runtime.bluetoothSnapshot.connectedDeviceName ?? midiT('device')}
              action={<span className={`connected-label is-${midiStatus.tone}`}><i />{midiStatus.label}</span>}
            />
            {composedSettings ? <img alt="" aria-hidden="true" className="settings-card__decoration" src={composedSettings.assets.midi} /> : null}
          </section>
          <section className="settings-group settings-card settings-card--theme">
            <div className="group-title"><span>{t('appearance')}</span><small>{t('appearanceDescription')}</small></div>
            <LanguageSetting />
            <div className="settings-theme-content">
              <div className="settings-theme-heading">
                <span className="setting-row__icon"><Icon name="grid" /></span>
                <span className="setting-row__copy"><strong>{t('theme')}</strong><small>{t('currentTheme', { name: getSettingsThemeDisplayName(theme, t) })}</small></span>
              </div>
              <div className="settings-theme-options" role="group" aria-label={t('theme')}>
                {visibleThemeOptions.map((option) => (
                  <SettingsThemeOption
                    active={theme.id === option.id}
                    description={t(`${option.id}Description`)}
                    icon={option.icon}
                    key={option.id}
                    label={t(option.id)}
                    onSelect={() => { void themeManager.selectThemeId(String(option.id)) }}
                    preview={option.id}
                  />
                ))}
              </div>
              {themeRuntime.installed.length ? <div className="settings-external-themes">{themeRuntime.installed.map((record) => (
                <ExternalThemeCard
                  active={theme.source === 'external' && String(theme.id) === record.themeId && theme.version === record.version}
                  key={`${record.themeId}@${record.version}`}
                  onActivate={() => { void themeManager.activateExternal(record).catch(() => {}) }}
                  onInfo={() => setInfoRecord(record)}
                  record={record}
                />
              ))}</div> : <p className="settings-theme-empty">{t('noExternalThemes')}</p>}
              {Capacitor.isNativePlatform() ? <button className="settings-import-theme" type="button" onClick={() => setShowImporter(true)}><Icon name="grid" size={18} />{t('importTheme')}</button> : null}
            </div>
            {composedSettings ? <img alt="" aria-hidden="true" className="settings-card__decoration" src={composedSettings.assets.theme} /> : null}
          </section>
          <section className="settings-group settings-card settings-card--about">
            <div className="group-title"><span>{t('about')}</span><small>{t('edition')}</small></div>
            <SettingRow description={t('personalEdition')} icon="info" title={t('appTitle', { ns: 'common' })} action={<strong>Android</strong>} />
            <SettingRow description={installedVersionDescription} icon="info" title={t('currentVersion')} action={<strong>{installedVersionAction}</strong>} />
            {__QA_BUILD__ ? (
              <SettingRow description={t('qaUpdateDescription')} icon="refresh" title={t('appUpdates')} action={<strong>{t('unavailable')}</strong>} />
            ) : (
              <SettingRow description={t('updateDescription')} icon="refresh" onClick={() => openAuxiliary('update')} title={t('checkUpdates')} action={<strong>{updaterLabel}</strong>} />
            )}
            <SettingRow
              description="Natural516 / Apache-2.0"
              icon="book"
              onClick={() => { void openSourceRepository() }}
              title={t('openSource')}
              action={<><strong>GitHub</strong><Icon name="chevron" size={18} /></>}
            />
            {composedSettings ? <img alt="" aria-hidden="true" className="settings-card__decoration" src={composedSettings.assets.about} /> : null}
          </section>
        </div>
      </section>
      {showImporter ? <ThemePackageDialog manager={themeManager} onClose={() => { void themeManager.cancelInspection(); setShowImporter(false) }} /> : null}
      {infoRecord ? <ThemeInfoDialog active={theme.source === 'external' && String(theme.id) === infoRecord.themeId && theme.version === infoRecord.version} manager={themeManager} onClose={() => setInfoRecord(null)} record={infoRecord} /> : null}
    </ProductFrame>
  )
}

function MidiScreen(): JSX.Element {
  const { t } = useTranslation('midi')
  const { runtime } = useMidiUi()
  const { returnFromAuxiliary } = useAppNavigation()
  const midi = runtime.bluetoothSnapshot
  const status = presentLocalizedMidiStatus(runtime, t)
  const scanActive = midi.scanning ?? (midi.connectionState === 'SCANNING' || midi.connectionState === 'DEVICE_FOUND')
  const [selectedPorts, setSelectedPorts] = useState<Record<string, number>>({})
  const bluetoothAvailable = midi.capabilities?.bluetooth.available
    ?? (midi.bluetoothState === 'ON' && midi.permissionState === 'GRANTED')
  const bluetoothReason = midi.capabilities?.bluetooth.reason
    ?? (midi.permissionState === 'GRANTED' ? 'BLUETOOTH_OFF' : 'PERMISSION_REQUIRED')
  const action = (() => {
    if (midi.connectionState === 'UNSUPPORTED') {
      return { label: t('unsupportedAction'), disabled: true, run: () => {} }
    }
    if (midi.connectionState === 'CONNECTED') {
      return { label: t('disconnect'), disabled: false, run: () => { void runtime.bluetooth.disconnect() } }
    }
    if (scanActive) {
      return { label: t('stopScan'), disabled: false, run: () => { void runtime.bluetooth.stopScan() } }
    }
    return { label: t('refresh'), disabled: false, run: () => { void runtime.midiInput.refresh() } }
  })()

  return (
    <div className="standalone-frame">
      <ProductHeader midiStatusInteractive={false} title={t('title')} onBack={() => returnFromAuxiliary('settings')} />
      <main className="standalone-content">
        <section className="device-hero">
          <div className="device-orbit"><span><Icon name="bluetooth" size={42} /></span><i /><i /><i /></div>
          <span className={`connected-label large is-${status.tone}`}><i />{status.label}</span>
          <h1>{midi.connectedDeviceName ?? t('device')}</h1>
          <p>{t('heroDescription', { detail: status.detail })}</p>
          <button className="secondary-action midi-primary-action" disabled={action.disabled} type="button" onClick={action.run}>
            <Icon name="refresh" />{action.label}
          </button>
        </section>
        <section className="device-details">
          <div><small>{t('connectionMethod')}</small><strong>{midi.activeInput ? midi.activeInput.transport === 'usb' ? 'USB MIDI' : 'Bluetooth MIDI' : t('notSelected')}</strong></div>
          <div><small>{t('input')}</small><strong>{midi.activeInput ? t('inputWithPort', { readiness: t(runtime.midiReady ? 'ready' : 'pending'), port: midi.activeInput.portNumber + 1 }) : t(runtime.midiReady ? 'ready' : 'pending')}</strong></div>
          <div><small>{t('practiceState')}</small><strong>{t(runtime.midiReady ? 'canPractice' : 'connectFirst')}</strong></div>
        </section>
        {midi.discoveredDevices.length > 0 ? (
          <section className="midi-device-list" aria-label={t('devices')}>
            <div className="list-heading"><h2>{t('devices')}</h2><span>{t('devicesFound', { count: midi.discoveredDevices.length })}</span></div>
            <div>
              {midi.discoveredDevices.map((device) => {
                const connected = midi.connectionState === 'CONNECTED' && midi.connectedDeviceId === device.id
                const ports = device.outputPorts ?? []
                const needsPort = ports.length > 1 && selectedPorts[device.id] === undefined
                const unavailable = device.transport !== 'usb' && !bluetoothAvailable
                return (
                  <div className="midi-candidate" key={device.id}>
                  {ports.length > 1 ? <label className="midi-port-selector">{t('inputPort')}
                    <select aria-label={t('deviceInputPort', { deviceName: device.name })} value={selectedPorts[device.id] ?? ''} onChange={(event) => setSelectedPorts((previous) => ({ ...previous, [device.id]: Number(event.target.value) }))}>
                      <option value="" disabled>{t('selectPort')}</option>
                      {ports.map((port) => <option key={port.portNumber} value={port.portNumber}>{port.name}</option>)}
                    </select>
                  </label> : null}
                  <button
                    className={connected ? 'is-connected' : ''}
                    disabled={midi.connectionState === 'CONNECTING' || connected || needsPort || unavailable || (device.source === 'midiManager' && ports.length === 0)}
                    type="button"
                    onClick={() => { void runtime.midiInput.connect(device.id, selectedPorts[device.id] ?? ports[0]?.portNumber) }}
                  >
                    <span><Icon name="bluetooth" /></span>
                    <span><strong>{device.name}</strong><small>{device.manufacturer || device.product ? t('candidateDetail', { transport: device.transport === 'usb' ? 'USB MIDI' : 'Bluetooth MIDI', manufacturer: device.manufacturer ?? device.product! }) : device.transport === 'usb' ? 'USB MIDI' : 'Bluetooth MIDI'}</small></span>
                    <em>{t(connected ? 'connected' : needsPort ? 'selectPort' : device.source === 'midiManager' && !ports.length ? 'noInputPort' : 'connect')}</em>
                  </button>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
        <section className="device-help">
          <span><Icon name="info" /></span>
          <div>
            <strong>{t('helpTitle')}</strong>
            <p>{t('help')}</p>
            {!bluetoothAvailable ? <p>{t(bluetoothReason === 'PERMISSION_REQUIRED' || bluetoothReason === 'PERMISSION_DENIED' ? 'bluetoothPermission' : bluetoothReason === 'BLUETOOTH_OFF' ? 'bluetoothOffAvailableUsb' : 'bluetoothUnsupported')}</p> : null}
          </div>
          <button className="secondary-action" disabled={!bluetoothAvailable && !['PERMISSION_REQUIRED', 'PERMISSION_DENIED'].includes(bluetoothReason)} type="button" onClick={() => { void (bluetoothAvailable ? runtime.midiInput.scan() : runtime.midiInput.requestPermissions()) }}>
            <Icon name="refresh" />{t(bluetoothAvailable ? 'scan' : 'allowDevices')}
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
  const { returnFromAuxiliary } = useAppNavigation()
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
      <ProductHeader title="检查更新" onBack={() => returnFromAuxiliary('settings')} />
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
  chordCaseId,
  chordMockStateId,
  onChordCaseChange,
  onChordMockStateChange,
  runtime,
  snapshot
}: {
  active: ScreenId
  chordCaseId: string
  chordMockStateId: ChordPreviewStateId
  onChordCaseChange: (value: string) => void
  onChordMockStateChange: (value: ChordPreviewStateId) => void
  runtime: AndroidSightReadingRuntime
  snapshot: SightRuntimeSnapshot
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [midiNumber, setMidiNumber] = useState('60')
  const metrics = useViewportMetrics()
  const reviewScreens = __QA_BUILD__ ? screens.filter((screen) => screen.id !== 'update') : screens
  const activeLabel = reviewScreens.find((screen) => screen.id === active)?.shortLabel ?? '首页'
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
          {reviewScreens.map((screen) => (
            <button
              className={screen.id === active ? 'is-active' : ''}
              key={screen.id}
              type="button"
              onClick={() => selectScreen(screen.id)}
            >
              <span>{screen.label}</span>{screen.id === active ? <Icon name="check" size={18} /> : null}
            </button>
          ))}
          {active === 'chord-practice' ? (
            <section className="developer-chord" aria-label="和弦静态界面检查控制">
              <div className="developer-midi__heading">
                <span>DEVELOPMENT ONLY</span>
                <strong>Chord V1 运行 / 静态状态</strong>
              </div>
              <label>
                <span>UI STATE</span>
                <select value={chordMockStateId} onChange={(event) => onChordMockStateChange(event.target.value as ChordPreviewStateId)}>
                  <option value="live">LIVE · REAL RUNTIME</option>
                  {CHORD_MOCK_STATES.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}
                </select>
              </label>
              <label>
                <span>QA CASE</span>
                <select value={chordCaseId} onChange={(event) => onChordCaseChange(event.target.value)}>
                  {CHORD_MOCK_CASES.map((item) => <option key={item.id} value={item.id}>{item.qaLabel}</option>)}
                </select>
              </label>
              <small>LIVE 使用真实 Runtime；其余选项仅覆盖静态画面，不改变判题或保存记录。</small>
            </section>
          ) : null}
          {SHOW_DEVELOPMENT_TOOLS ? (
            <section className="developer-midi" aria-label="开发模拟 MIDI 控制">
              <div className="developer-midi__heading">
                <span>DEVELOPMENT ONLY</span>
                <strong>MIDI 输入源</strong>
              </div>
              <div className="developer-midi__source" role="group" aria-label="DEBUG MIDI 输入源">
                <button className={!developmentInputActive ? 'is-active' : ''} type="button" onClick={() => runtime.setMidiInputSource(midi.activeInput?.transport ?? 'bluetooth')}>真实 MIDI 输入</button>
                <button className={developmentInputActive ? 'is-active' : ''} type="button" onClick={() => runtime.setMidiInputSource('development')}>开发模拟 MIDI</button>
              </div>
              <div className="developer-midi__status">
                <span>目标 <strong>{snapshot.currentTargetNotes.map((note) => note.noteName).join(' + ') || '—'}</strong></span>
                <span>阶段 <strong>{snapshot.phase}</strong></span>
                <span>来源 <strong>{developmentInputActive ? 'DEVELOPMENT' : midi.activeInput?.transport === 'usb' ? 'REAL USB' : 'REAL BLUETOOTH'}</strong></span>
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
                <strong>MIDI INPUT DIAGNOSTICS</strong>
                <span><b>transport</b>{midi.activeInput?.transport ?? '—'}</span>
                <span><b>generation</b>{midi.activeInput?.connectionGeneration ?? midi.connectionGeneration ?? '—'}</span>
                <span><b>delivery epoch</b>{midi.deliveryEpoch ?? '—'}</span>
                <span><b>reason</b>{midi.reasonCode ?? '—'}</span>
                <span><b>native error</b>{midi.lastError ?? '—'}</span>
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
  const { t } = useTranslation('navigation')
  return <div className="orientation-notice"><div className="rotate-device">↻</div><h1>{t('landscapeTitle')}</h1><p>{t('landscapeDescription')}</p></div>
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

function ChordPersistenceErrorNotice({ persistence }: { persistence: ChordPersistenceSnapshot }): JSX.Element | null {
  if (persistence.status !== 'error') return null
  return (
    <aside className="persistence-error" role="alert">
      {persistence.errorContext === 'save'
        ? <span><strong>练习已结束，但记录保存失败。</strong><small>和弦练习结果没有被加入练习记录。</small></span>
        : <span><strong>暂时无法读取和弦练习记录。</strong><small>其他练习功能仍可正常使用。</small></span>}
    </aside>
  )
}

function IntervalPersistenceErrorNotice({
  coordinator,
  persistence
}: {
  coordinator: IntervalReportPersistenceCoordinator
  persistence: IntervalPersistenceSnapshot
}): JSX.Element | null {
  if (persistence.status !== 'error') return null
  return (
    <aside className="persistence-error" role="alert">
      {persistence.errorContext === 'save'
        ? <span><strong>练习已结束，但记录保存失败。</strong><small>音程练习结果仍保留，可重试写入此设备。</small></span>
        : <span><strong>暂时无法读取音程练习记录。</strong><small>其他练习功能仍可正常使用。</small></span>}
      <button type="button" onClick={() => { void coordinator.retryPending() }}>重试</button>
    </aside>
  )
}

class ThemeRecoveryBoundary extends Component<{ children: ReactNode; manager: ThemeRuntimeManager; theme: ThemeDefinition }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: Error } { return { error } }
  componentDidCatch(error: Error, _info: ErrorInfo): void {
    const isThemeFailure = this.props.theme.source === 'external' && /(THEME|ASSET|RECIPE|CAPABILITY|TOKEN|PARAMETER)/i.test(error.message)
    if (isThemeFailure) void this.props.manager.recoverExternal('THEME_RUNTIME_EXCEPTION', error.message)
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children
    const isThemeFailure = this.props.theme.source === 'external' && /(THEME|ASSET|RECIPE|CAPABILITY|TOKEN|PARAMETER)/i.test(this.state.error.message)
    if (!isThemeFailure) throw this.state.error
    return <main className="persistence-loading" role="alert"><span className="eyebrow">主题恢复</span><h1>主题加载失败，正在恢复浅色主题…</h1></main>
  }
}

function App({ runtime, themeManager }: { runtime: AndroidSightReadingRuntime; themeManager: ThemeRuntimeManager }): JSX.Element {
  const themeRuntime = useThemeRuntime(themeManager)
  const snapshot = useSightReadingRuntime(runtime)
  const activeSessionHost = useMemo(() => new ActivePracticeSessionHost(), [])
  const chordRuntime = useMemo(() => new ChordPracticeRuntime({
    clock: { now: () => performance.now() },
    scheduler: {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (id) => window.clearTimeout(id)
    },
    rng: () => Math.random()
  }), [])
  const chordKeepAwakeSnapshot = useChordPracticeRuntime(chordRuntime)
  const intervalRuntime = useMemo(() => new IntervalPracticeSessionRuntime({
    clock: { now: () => performance.now() },
    scheduler: {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (id) => window.clearTimeout(id)
    },
    rng: () => Math.random()
  }), [])
  const intervalSnapshot = useIntervalPracticeRuntime(intervalRuntime)
  const practiceKeepAwake = useMemo(() => createPracticeKeepAwakeController(), [])
  const updater = useMemo(() => createAndroidUpdaterController(), [])
  const chordSettingsRepository = useMemo(() => new ChordSettingsRepository(CapacitorPreferencesBackend), [])
  const intervalSettingsRepository = useMemo(() => new IntervalPracticeSettingsRepository(CapacitorPreferencesBackend), [])
  const chordReportRepository = useMemo(() => new ChordReportRepository(CapacitorPreferencesBackend), [])
  const chordPersistence = useMemo(() => new ChordReportPersistenceCoordinator(chordReportRepository), [chordReportRepository])
  const chordPersistenceSnapshot = useChordPersistence(chordPersistence)
  const intervalReportRepository = useMemo(() => new IntervalReportRepository(CapacitorPreferencesBackend), [])
  const intervalPersistence = useMemo(() => new IntervalReportPersistenceCoordinator(intervalReportRepository), [intervalReportRepository])
  const intervalPersistenceSnapshot = useIntervalPersistence(intervalPersistence)
  const updaterSnapshot = useUpdaterSnapshot(updater)
  const settings = runtime.settings
  const [screen, setScreen] = useState<ScreenId>(() => readScreen())
  const [appForeground, setAppForeground] = useState(true)
  const screenRef = useRef<ScreenId>(screen)
  const activeTheme = themeRuntime.activeTheme ?? resolveTheme('light')
  const [chordCaseId, setChordCaseId] = useState(DEFAULT_CHORD_MOCK_CASE_ID)
  const [chordMockStateId, setChordMockStateId] = useState<ChordPreviewStateId>('live')
  const [chordQuestionCount, setChordQuestionCount] = useState<ChordQuestionCount>(20)
  const [chordPracticeMode, setChordPracticeMode] = useState<ChordPracticeMode>('comprehensive')
  const [chordSettings, setChordSettings] = useState<ChordSettings>(DEFAULT_CHORD_SETTINGS)
  const [chordSettingsReady, setChordSettingsReady] = useState(false)
  const [intervalSettings, setIntervalSettings] = useState<IntervalPracticeSettings>(DEFAULT_INTERVAL_PRACTICE_SETTINGS)
  const [intervalSettingsReady, setIntervalSettingsReady] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [selectedChordRecordId, setSelectedChordRecordId] = useState<string | null>(null)
  const [selectedIntervalRecordId, setSelectedIntervalRecordId] = useState<string | null>(null)

  useEffect(() => {
    void chordPersistence.initialize()
  }, [chordPersistence])

  useEffect(() => {
    void intervalPersistence.initialize()
  }, [intervalPersistence])

  useEffect(() => {
    let active = true
    void chordSettingsRepository.load().then((loaded) => {
      if (active) {
        setChordSettings(loaded)
        setChordSettingsReady(true)
      }
    }).catch(() => {
      if (active) {
        setChordSettings(DEFAULT_CHORD_SETTINGS)
        setChordSettingsReady(true)
      }
    })
    return () => { active = false }
  }, [chordSettingsRepository])

  useEffect(() => {
    let active = true
    void intervalSettingsRepository.load().then((loaded) => {
      if (active) {
        setIntervalSettings(loaded)
        setIntervalSettingsReady(true)
      }
    }).catch(() => {
      if (active) {
        setIntervalSettings(DEFAULT_INTERVAL_PRACTICE_SETTINGS)
        setIntervalSettingsReady(true)
      }
    })
    return () => { active = false }
  }, [intervalSettingsRepository])

  const updateChordSettings = (changes: Partial<Pick<ChordSettings, 'sequentialKey' | 'showChordTones'>>): void => {
    setChordSettings((current) => {
      const next: ChordSettings = Object.freeze({ ...current, ...changes })
      void chordSettingsRepository.save(next).catch(() => {})
      return next
    })
  }

  const updateIntervalSettings = (changes: IntervalPracticeSettingChanges): void => {
    setIntervalSettings((current) => {
      const next: IntervalPracticeSettings = Object.freeze({ ...current, ...changes })
      void intervalSettingsRepository.save(next).catch(() => {})
      return next
    })
  }

  useEffect(() => {
    void runtime.startMidi()
  }, [runtime])

  useEffect(() => {
    const unsubscribe = runtime.midiRouter.subscribe((event) => chordRuntime.handleMidi(event))
    return unsubscribe
  }, [chordRuntime, runtime])

  const chordTransportReady = runtime.midiReady
  const chordInputBoundary = `${runtime.midiSource}:${runtime.midiBoundaryVersion}`
  const previousChordTransportReady = useRef<{ ready: boolean; boundary: string } | null>(null)
  useEffect(() => {
    const previous = previousChordTransportReady.current
    if (previous?.ready === chordTransportReady && previous.boundary === chordInputBoundary) return
    previousChordTransportReady.current = { ready: chordTransportReady, boundary: chordInputBoundary }
    if (previous && previous.boundary !== chordInputBoundary && chordTransportReady) chordRuntime.handleTransportLost()
    if (chordTransportReady) chordRuntime.handleTransportReady()
    else chordRuntime.handleTransportLost()
  }, [chordRuntime, chordTransportReady, chordInputBoundary])

  useEffect(() => {
    if (!__QA_BUILD__) void updater.initialize()
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

  const keepPracticeAwake = shouldKeepPracticeAwake({
    appForeground,
    screen,
    sightStatus: snapshot.status,
    sightPaused: snapshot.isPaused,
    chordStatus: chordKeepAwakeSnapshot.status,
    intervalStatus: intervalSnapshot.status
  })

  useEffect(() => {
    void practiceKeepAwake.setEnabled(keepPracticeAwake)
  }, [keepPracticeAwake, practiceKeepAwake])

  useEffect(() => () => {
    void practiceKeepAwake.dispose()
  }, [practiceKeepAwake])

  const openAuxiliary = useCallback((destination: 'midi' | 'update'): void => {
    const origin = screenRef.current
    if (origin === destination) return
    activeSessionHost.rememberAuxiliaryReturn(origin, destination)

    const sightPracticeScreens: ScreenId[] = [
      'sight-active', 'sight-correct', 'sight-wrong', 'sight-timeout', 'sight-early-end'
    ]
    if (sightPracticeScreens.includes(origin) && runtime.snapshot.status === 'running' && !runtime.snapshot.isPaused) {
      runtime.pause()
    }
    if (origin === 'chord-practice') {
      const chordStatus = chordRuntime.snapshot.status
      if (chordStatus === 'RUNNING' || chordStatus === 'SUCCESS_FEEDBACK') {
        chordRuntime.pause('manual-pause')
      }
    }
    if (origin === 'interval-active') intervalRuntime.pause()
    navigate(destination)
  }, [activeSessionHost, chordRuntime, intervalRuntime, runtime])

  const returnFromAuxiliary = useCallback((fallback: ScreenId): void => {
    navigate(activeSessionHost.consumeAuxiliaryReturn(screenRef.current, fallback) as ScreenId)
  }, [activeSessionHost])

  const openChordReportDetail = useCallback((recordId: string, filter: HistoryFilter): void => {
    setHistoryFilter(filter)
    setSelectedChordRecordId(recordId)
    navigate('chord-report-detail')
  }, [])

  const closeChordReportDetail = useCallback((): void => {
    setSelectedChordRecordId(null)
    navigate('history')
  }, [])

  const openIntervalReportDetail = useCallback((recordId: string, filter: HistoryFilter): void => {
    setHistoryFilter(filter)
    setSelectedIntervalRecordId(recordId)
    navigate('interval-report-detail')
  }, [])

  const closeIntervalReportDetail = useCallback((): void => {
    setSelectedIntervalRecordId(null)
    navigate('history')
  }, [])

  const endSightPractice = useCallback((): void => {
    const active = activeSessionHost.current
    runtime.stop()
    if (active?.module === 'sight') activeSessionHost.end(active.id)
    navigate('sight-ready')
  }, [activeSessionHost, runtime])

  const endChordPractice = useCallback((): void => {
    const active = activeSessionHost.current
    chordRuntime.stop()
    if (active?.module === 'chord') {
      const finalizedNow = activeSessionHost.end(active.id)
      if (finalizedNow) void chordPersistence.finalize(active.id, chordRuntime.snapshot, 'stopped')
    }
    navigate('chord-mode-select')
  }, [activeSessionHost, chordPersistence, chordRuntime])

  const finalizeIntervalPractice = useCallback((completionStatus: IntervalPracticeReportDraft['completionStatus']): void => {
    const active = activeSessionHost.current
    if (completionStatus === 'STOPPED') intervalRuntime.stop()
    if (active?.module === 'interval') {
      const snapshotAtFinish = intervalRuntime.snapshot
      const finalizedNow = activeSessionHost.end(active.id)
      if (!finalizedNow) return
      void intervalPersistence.finalize(active.id, snapshotAtFinish, completionStatus)
      navigate('interval-result')
    }
  }, [activeSessionHost, intervalPersistence, intervalRuntime])

  const endIntervalPractice = useCallback((): void => finalizeIntervalPractice('STOPPED'), [finalizeIntervalPractice])
  const completeIntervalPractice = useCallback((): void => finalizeIntervalPractice('COMPLETED'), [finalizeIntervalPractice])

  useEffect(() => {
    const active = activeSessionHost.current
    if (snapshot.status === 'finished' && active?.module === 'sight') {
      activeSessionHost.finalize(active.id)
    }
  }, [activeSessionHost, snapshot.status])

  useEffect(() => chordRuntime.subscribe(() => {
    const active = activeSessionHost.current
    const current = chordRuntime.snapshot
    if (active?.module === 'chord' && current.status !== 'IDLE' && current.status !== 'STOPPED') {
      chordPersistence.beginSession(active.id)
    }
    if (current.status === 'SESSION_COMPLETE' && active?.module === 'chord') {
      const finalizedNow = activeSessionHost.finalize(active.id)
      if (finalizedNow) void chordPersistence.finalize(active.id, current, 'completed')
    }
  }), [activeSessionHost, chordPersistence, chordRuntime])

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

      if (currentScreen === 'midi' || currentScreen === 'update') {
        returnFromAuxiliary('settings')
        return
      }

      if (currentScreen === 'chord-report-detail') {
        closeChordReportDetail()
        return
      }

      if (currentScreen === 'interval-report-detail') {
        closeIntervalReportDetail()
        return
      }

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

      if (currentScreen === 'chord-practice') {
        endChordPractice()
        return
      }

      if (currentScreen === 'interval-active') {
        window.dispatchEvent(new CustomEvent('interval-request-end'))
        return
      }

      const parentScreen: Partial<Record<ScreenId, ScreenId>> = {
        'sight-ready': 'practice',
        'sight-result': 'practice',
        'chord-mode-select': 'practice',
        'chord-practice': 'chord-mode-select',
        'interval-practice': 'practice',
        'interval-active': 'interval-practice',
        'interval-result': 'interval-practice',
        'interval-report-detail': 'history',
        'chord-report-detail': 'history',
        'chord-query-tool': 'tools',
        'scale-key-signature-tool': 'tools',
        'interval-query-tool': 'tools',
        practice: 'home',
        tools: 'home',
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
        setAppForeground(true)
        void runtime.resumeFromAppLifecycle()
        if (!__QA_BUILD__) void updater.refreshInstallPermission()
      } else {
        setAppForeground(false)
        void practiceKeepAwake.setEnabled(false)
        chordRuntime.pause('background')
        intervalRuntime.pause()
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
  }, [chordRuntime, closeChordReportDetail, closeIntervalReportDetail, endChordPractice, intervalRuntime, practiceKeepAwake, returnFromAuxiliary, runtime, updater])

  useLayoutEffect(() => {
    applyThemeDefinition(document.documentElement, activeTheme)
  }, [activeTheme])

  useEffect(() => {
    if (activeTheme.source !== 'external') return
    const handleAssetError = (event: Event): void => {
      const target = event.target
      if (target instanceof HTMLImageElement && target.src.includes('_capacitor_file_')) void themeManager.recoverExternal('ASSET_RUNTIME_LOAD_FAILED', target.src)
    }
    document.addEventListener('error', handleAssetError, true)
    return () => document.removeEventListener('error', handleAssetError, true)
  }, [activeTheme, themeManager])

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
    activeSessionHost.begin('sight', 'sight-active')
    runtime.start()
    navigate('sight-active')
  }

  const startIntervalPractice = (): void => {
    const active = activeSessionHost.begin('interval', 'interval-active')
    intervalPersistence.beginSession(active.id)
    intervalRuntime.start(intervalSettings)
    navigate('interval-active')
  }

  const content = (() => {
    switch (screen) {
      case 'home': return <HomeScreen chordHistory={chordPersistenceSnapshot} chordPersistence={chordPersistence} intervalSettingsReady={intervalSettingsReady} settings={settings} theme={activeTheme} />
      case 'practice': return <PracticeHubScreen chordHistory={chordPersistenceSnapshot} chordPersistence={chordPersistence} intervalSettingsReady={intervalSettingsReady} settings={settings} theme={activeTheme} />
      case 'tools': return <ToolsHubScreen theme={activeTheme} />
      case 'chord-query-tool': return <ChordQueryToolScreen theme={activeTheme} />
      case 'scale-key-signature-tool': return <ScaleKeySignatureToolScreen theme={activeTheme} />
      case 'interval-query-tool': return <IntervalQueryToolScreen theme={activeTheme} />
      case 'interval-practice': return <IntervalPracticeSetupScreen onSettingsChange={updateIntervalSettings} onStart={startIntervalPractice} settings={intervalSettings} />
      case 'interval-active': return <IntervalPracticeActiveScreen midiRuntime={runtime} onRequestEnd={endIntervalPractice} onSessionComplete={completeIntervalPractice} runtime={intervalRuntime} snapshot={intervalSnapshot} theme={activeTheme} />
      case 'interval-result': return intervalPersistenceSnapshot.latestReport
        ? <IntervalResultScreen report={intervalPersistenceSnapshot.latestReport} />
        : <IntervalPracticeSetupScreen onSettingsChange={updateIntervalSettings} onStart={startIntervalPractice} settings={intervalSettings} />
      case 'chord-mode-select': return <ChordModeSelectScreen settingsReady={chordSettingsReady} onSelectMode={(mode) => { activeSessionHost.begin('chord', 'chord-practice'); setChordPracticeMode(mode); navigate('chord-practice') }} />
      case 'sight-ready': return <SightReadyScreen onSettingsChange={(changes) => { void runtime.updateSettings(changes) }} onStart={startPractice} settings={settings} />
      case 'sight-active':
      case 'sight-correct':
      case 'sight-wrong':
      case 'sight-timeout':
      case 'sight-early-end':
        return <SightFocusScreen onStopAndSave={endSightPractice} runtime={runtime} screen={screen} settings={settings} snapshot={snapshot} theme={activeTheme} />
      case 'sight-result':
        return snapshot.report
          ? <SightResultScreen report={snapshot.report} />
          : <SightReadyScreen onSettingsChange={(changes) => { void runtime.updateSettings(changes) }} onStart={startPractice} settings={settings} />
      case 'chord-practice': return (
        <ChordPracticeScreen
          caseId={chordCaseId}
          chordSettings={chordSettings}
          mode={chordPracticeMode}
          previewStateId={chordMockStateId}
          runtime={chordRuntime}
          midiRuntime={runtime}
          onExplicitEnd={endChordPractice}
          onChordSettingsChange={updateChordSettings}
          onQuestionCountChange={setChordQuestionCount}
          questionCount={chordQuestionCount}
          theme={activeTheme}
        />
      )
      case 'history': return (
        <HistoryScreen
          chordHistory={chordPersistenceSnapshot}
          chordPersistence={chordPersistence}
          filter={historyFilter}
          intervalHistory={intervalPersistenceSnapshot}
          intervalPersistence={intervalPersistence}
          onFilterChange={setHistoryFilter}
          onOpenChordReport={openChordReportDetail}
          onOpenIntervalReport={openIntervalReportDetail}
          runtime={runtime}
          theme={activeTheme}
        />
      )
      case 'chord-report-detail': return (
        <ChordReportDetailScreen
          onBack={closeChordReportDetail}
          report={resolveChordReportById(chordPersistenceSnapshot.records, selectedChordRecordId)}
        />
      )
      case 'interval-report-detail': return (
        <IntervalReportDetailScreen
          onBack={closeIntervalReportDetail}
          report={resolveIntervalReportById(intervalPersistenceSnapshot.records, selectedIntervalRecordId)}
        />
      )
      case 'settings': return (
        <SettingsScreen
          theme={activeTheme}
          themeManager={themeManager}
        />
      )
      case 'midi': return <MidiScreen />
      case 'update': return <UpdateScreen />
    }
  })()

  return (
    <UpdaterUiContext.Provider value={{ controller: updater, snapshot: updaterSnapshot }}>
      <MidiUiContext.Provider value={{ runtime }}>
        <AppNavigationContext.Provider value={{ openAuxiliary, returnFromAuxiliary }}>
          <ThemeRecoveryBoundary key={`${activeTheme.id}@${activeTheme.version}`} manager={themeManager} theme={activeTheme}>
            <div className="tablet-app" data-runtime-theme-source={activeTheme.source} data-runtime-theme-version={activeTheme.version}>{content}</div>
          </ThemeRecoveryBoundary>
          <PersistenceErrorNotice runtime={runtime} />
          <ChordPersistenceErrorNotice persistence={chordPersistenceSnapshot} />
          <IntervalPersistenceErrorNotice coordinator={intervalPersistence} persistence={intervalPersistenceSnapshot} />
          {SHOW_DEVELOPMENT_TOOLS ? (
            <ReviewDock
              active={screen}
              chordCaseId={chordCaseId}
              chordMockStateId={chordMockStateId}
              onChordCaseChange={setChordCaseId}
              onChordMockStateChange={setChordMockStateId}
              runtime={runtime}
              snapshot={snapshot}
            />
          ) : null}
          <OrientationNotice />
        </AppNavigationContext.Provider>
      </MidiUiContext.Provider>
    </UpdaterUiContext.Provider>
  )
}

function AndroidAppBootstrap(): JSX.Element {
  const [runtime, setRuntime] = useState<AndroidSightReadingRuntime | null>(null)
  const [themeManager] = useState(() => {
    const initialId = resolveInitialThemeId(window.location.search, SHOW_DEVELOPMENT_TOOLS)
    return new ThemeRuntimeManager(resolveTheme(Capacitor.isNativePlatform() ? 'light' : initialId), (id) => resolveTheme(id as ThemeId))
  })
  const themeRuntime = useThemeRuntime(themeManager)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void themeManager.initialize()
    void createBrowserAndroidSightReadingRuntime({
      nativeBluetooth: Capacitor.isNativePlatform()
    }).then((createdRuntime) => {
      if (active) setRuntime(createdRuntime)
      else void createdRuntime.dispose()
    }).catch((error) => {
      if (active) setInitializationError(String(error))
    })
    return () => { active = false; void themeManager.dispose() }
  }, [themeManager])

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
  if (!runtime || !themeRuntime.ready) {
    return <main className="persistence-loading" aria-live="polite"><span className="eyebrow">本地数据</span><h1>正在载入练习设置…</h1></main>
  }
  return <App runtime={runtime} themeManager={themeManager} />
}

const localizationService = new LocalizationService(
  new AppPreferencesRepository(CapacitorPreferencesBackend),
  () => navigator.languages.length ? navigator.languages : navigator.language
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider service={localizationService}>
      <AndroidAppBootstrap />
    </LocaleProvider>
  </StrictMode>
)
