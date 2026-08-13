import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useScalePractice } from '../hooks/useScalePractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import { getJudgementLabel } from '../utils/judgement'
import type { JudgementResult } from '../utils/practiceTypes'
import { PRACTICE_DIFFICULTY_LABELS } from '../utils/practiceContentTypes'
import type { MajorScaleKey, ScaleNotesPerBeat, ScalePracticeMode, ScaleRange } from '../utils/scaleTypes'
import { createScaleRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'
import { MetronomeVolumeControl } from './MetronomeVolumeControl'
import { PracticeFeedbackNotice } from './PracticeFeedbackNotice'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'

interface ScalePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

function formatOffset(offset?: number): string {
  if (typeof offset !== 'number') return '-'
  return `${offset > 0 ? '+' : ''}${offset}ms`
}

function formatLatestResult(result: JudgementResult | null): string {
  return result ? getJudgementLabel(result.type) : '暂无判定'
}

function formatLatestMessage(result: JudgementResult | null): string {
  if (!result) return '开始后按顺序弹奏当前音阶'
  if (result.type === 'missing_note') return `${result.message}，请补弹当前目标音`
  return `${result.message} / offset ${formatOffset(result.timeOffsetMs)}`
}

export function ScalePracticePage({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: ScalePracticePageProps): JSX.Element {
  const scale = useScalePractice()
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('scales')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftKey, setDraftKey] = useState<MajorScaleKey>(scale.selectedKey)
  const [draftMode, setDraftMode] = useState<ScalePracticeMode>(scale.selectedMode)
  const [draftRange, setDraftRange] = useState<ScaleRange>(scale.range)
  const [draftLoopCount, setDraftLoopCount] = useState(scale.loopCount)
  const [draftNotesPerBeat, setDraftNotesPerBeat] = useState<ScaleNotesPerBeat>(scale.notesPerBeat)
  const [draftBpm, setDraftBpm] = useState(scale.bpm)
  const [draftMetronomeSoundEnabled, setDraftMetronomeSoundEnabled] = useState(scale.metronomeSound.enabled)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const pausedForExitRef = useRef(false)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createScaleRecord({
      timing,
      report: scale.report,
      key: scale.selectedKey,
      mode: scale.selectedMode,
      tolerance: scale.toleranceLevel
    }),
    [scale.report, scale.selectedKey, scale.selectedMode, scale.toleranceLevel]
  )
  const recorder = usePracticeSessionRecorder(scale.isComplete, createRecord)
  const settingsLocked = scale.metronome.status !== 'idle' && !scale.isComplete
  const practiceActive = settingsLocked

  useEffect(() => {
    onPracticeRunningChange(practiceActive)
  }, [onPracticeRunningChange, practiceActive])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!practiceActive) {
      pausedForExitRef.current = false
      return
    }

    if (exitPromptOpen && scale.metronome.status === 'running') {
      pausedForExitRef.current = true
      scale.pause()
    } else if (!exitPromptOpen && pausedForExitRef.current) {
      pausedForExitRef.current = false
      scale.start()
    }
  }, [exitPromptOpen, practiceActive, scale.metronome.status, scale.pause, scale.start])

  const startPractice = (): void => {
    setSettingsOpen(false)
    if (scale.isComplete) {
      recorder.beginSession()
      scale.restart()
      return
    }
    if (scale.metronome.status !== 'paused') recorder.beginSession()
    scale.start()
  }

  const restartPractice = (): void => {
    setSettingsOpen(false)
    recorder.beginSession()
    scale.restart()
  }

  const openSettings = (): void => {
    setDraftKey(scale.selectedKey)
    setDraftMode(scale.selectedMode)
    setDraftRange(scale.range)
    setDraftLoopCount(scale.loopCount)
    setDraftNotesPerBeat(scale.notesPerBeat)
    setDraftBpm(scale.bpm)
    setDraftMetronomeSoundEnabled(scale.metronomeSound.enabled)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    scale.setSelectedKey(draftKey)
    scale.setSelectedMode(draftMode)
    scale.setRange(draftRange)
    scale.setLoopCount(draftLoopCount)
    scale.setNotesPerBeat(draftNotesPerBeat)
    scale.setBpm(draftBpm)
    if (draftMetronomeSoundEnabled !== scale.metronomeSound.enabled) {
      void scale.metronomeSound.setEnabled(draftMetronomeSoundEnabled)
    }
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  const latestResult = scale.latestResult
  const settingsSummary = `${scale.selectedScale.name} · ${scale.selectedModeName} · ${scale.range === 'two-octave' ? '两组八度' : '一组八度'} · ${scale.loopCount}次 · ${scale.bpm} BPM · 每拍${scale.notesPerBeat}音`
  const completedNotes = Math.max(0, Math.min(scale.currentStepIndex, scale.report.totalNotes))
  const errorCount = scale.report.wrongNote + scale.report.missingNote + scale.report.extraNote
  const judgedCount = scale.report.correct + errorCount + scale.report.early + scale.report.late + scale.report.restError

  return (
    <section className="scale-page practice-workspace-page">
      <PracticePageHeader
        controls={<MetronomeVolumeControl id="scale-header-metronome-volume" value={scale.metronomeSound.volume} onChange={scale.metronomeSound.setVolume} />}
        eyebrow="Scale Practice"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="音阶练习"
      />

      <div className="practice-single-column">
        <section className="midi-panel scale-panel practice-primary-panel">
          <div className="panel-title-row">
            <div><h3>节拍器与当前目标</h3><p>一小节预备拍后开始，跟随节拍器逐音弹奏。</p></div>
            <span className={`audio-status-badge status-${scale.metronome.status === 'running' ? 'ready' : 'suspended'}`}>
              {scale.metronome.status === 'running' ? '运行中' : scale.metronome.status === 'paused' ? '已暂停' : '未开始'}
            </span>
          </div>
          <div className="metronome-display">
            <div><span>{scale.metronome.isCountingIn ? '预备拍' : '当前小节'}</span><strong>{scale.metronome.isCountingIn ? `${scale.metronome.countInBeat} / 4` : `第 ${scale.metronome.currentMeasure || 1} 小节`}</strong></div>
            <div><span>当前拍</span><strong>{scale.metronome.currentBeat}</strong></div>
          </div>
          <div className="beat-dots" aria-label="当前拍点">
            {[1, 2, 3, 4].map((beat) => <span key={beat} className={`${scale.metronome.currentBeat === beat ? 'is-active' : ''} ${scale.metronome.isCountingIn ? 'is-count-in' : ''}`}>{beat}</span>)}
          </div>
          <div className="current-target-card practice-current-target">
            <span>当前目标</span><strong>{scale.isComplete ? '练习结束' : scale.currentStep?.label ?? scale.steps[0]?.label ?? '—'}</strong><small>{scale.selectedScale.name} · {scale.selectedModeName}</small>
          </div>
          {latestResult ? (
            <PracticeFeedbackNotice
              detail={formatLatestMessage(latestResult)}
              label="最近结果"
              resultType={latestResult.type}
              title={formatLatestResult(latestResult)}
            />
          ) : null}
          <div className="practice-primary-actions">
            {scale.metronome.status === 'idle' || scale.isComplete ? <AppButton onClick={startPractice}>开始练习</AppButton> : null}
            {scale.metronome.status === 'running' ? <AppButton variant="secondary" onClick={scale.pause}>暂停</AppButton> : null}
            {scale.metronome.status === 'paused' ? <AppButton onClick={startPractice}>继续练习</AppButton> : null}
            {practiceActive ? <AppButton variant="secondary" onClick={scale.stop}>停止</AppButton> : null}
            {practiceActive ? <AppButton variant="ghost" onClick={restartPractice}>重新开始</AppButton> : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <PracticeStatBar items={[
          { label: '当前音符', value: scale.currentStep?.label ?? '—' },
          { label: '已完成', value: `${completedNotes} / ${scale.report.totalNotes}` },
          { label: '正确', value: scale.report.correct },
          { label: '错误', value: errorCount },
          { label: '提前', value: scale.report.early },
          { label: '过晚', value: scale.report.late },
          { label: '正确率', value: judgedCount > 0 ? `${scale.report.accuracy}%` : '—' }
        ]} />

        {showVirtualKeyboard ? (
          <section className="midi-panel scale-panel scale-keyboard-panel practice-keyboard-panel">
            <div className="panel-title-row"><div><h3>虚拟钢琴键盘</h3><p>当前目标音为淡色边框，MIDI 实际输入仍实时高亮。</p></div></div>
            <FullKeyboard activeNotes={activeNotes} correctNotes={scale.correctNotes} targetNotes={scale.targetNotes} wrongNotes={scale.wrongNotes} />
          </section>
        ) : null}

        <section className="midi-panel scale-panel scale-sequence-panel">
          <div className="panel-title-row"><div><h3>音阶序列</h3><p>{scale.selectedScale.name} · {scale.selectedModeName} · 调号：{scale.selectedScale.accidentals.length > 0 ? scale.selectedScale.accidentals.join(' / ') : '无升降号'}</p></div></div>
          <div className="scale-sequence-grid">
            {scale.steps.map((step, index) => (
              <span key={`${step.id}-${index}`} className={`${scale.currentStepIndex === index ? 'is-active' : ''} ${index < scale.currentStepIndex ? 'is-past' : ''}`}>
                <small>{index + 1}</small><strong>{step.label}</strong>
              </span>
            ))}
          </div>
        </section>

      </div>

      <PracticeSettingsDrawer isLocked={settingsLocked} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="音阶练习设置">
        <label className="midi-field" htmlFor="scale-key-select"><span>调性</span>
          <select id="scale-key-select" className="midi-select" disabled={settingsLocked} value={draftKey} onChange={(event) => setDraftKey(event.target.value as MajorScaleKey)}>
            {scale.scales.map((pattern) => <option key={pattern.key} value={pattern.key}>{pattern.name}</option>)}
          </select>
        </label>
        <label className="midi-field" htmlFor="scale-mode-select"><span>练习手型</span>
          <select id="scale-mode-select" className="midi-select" disabled={settingsLocked} value={draftMode} onChange={(event) => setDraftMode(event.target.value as ScalePracticeMode)}>
            {scale.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name} · {PRACTICE_DIFFICULTY_LABELS[mode.difficulty]}</option>)}
          </select>
        </label>
        <p className="judgement-help">{scale.modes.find((mode) => mode.id === draftMode)?.description}</p>
        <div className="tolerance-control"><span>音域</span><div className="segmented-control">
          <button className={draftRange === 'one-octave' ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftRange('one-octave')}>一组八度</button>
          <button className={draftRange === 'two-octave' ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftRange('two-octave')}>两组八度</button>
        </div></div>
        <div className="tolerance-control"><span>循环次数</span><div className="segmented-control">
          {[1, 2, 4].map((count) => <button key={count} className={draftLoopCount === count ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftLoopCount(count)}>{count}次</button>)}
        </div><label className="midi-field" htmlFor="scale-loop-count"><span>自定义 1 - 20 次</span><input id="scale-loop-count" className="midi-select" disabled={settingsLocked} max="20" min="1" type="number" value={draftLoopCount} onChange={(event) => setDraftLoopCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label></div>
        <div className="tolerance-control"><span>每拍音符数</span><div className="segmented-control">
          {([1, 2, 4] as ScaleNotesPerBeat[]).map((count) => <button key={count} className={draftNotesPerBeat === count ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftNotesPerBeat(count)}>每拍{count}音</button>)}
        </div></div>
        <label className="bpm-control" htmlFor="scale-bpm-input"><div><span>目标速度</span><strong>{draftBpm} BPM</strong></div>
          <input id="scale-bpm-input" type="range" min="40" max="200" disabled={settingsLocked} value={draftBpm} onChange={(event) => setDraftBpm(Number(event.target.value))} />
        </label>
        <div className="tolerance-control"><span>节拍器声音</span><div className="segmented-control">
          <button className={draftMetronomeSoundEnabled ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftMetronomeSoundEnabled(true)}>开启</button>
          <button className={!draftMetronomeSoundEnabled ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftMetronomeSoundEnabled(false)}>关闭</button>
        </div></div>
        <div className="tolerance-control"><span>显示虚拟键盘</span><div className="segmented-control">
          <button className={draftShowVirtualKeyboard ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftShowVirtualKeyboard(true)}>显示</button>
          <button className={!draftShowVirtualKeyboard ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftShowVirtualKeyboard(false)}>隐藏</button>
        </div></div>
      </PracticeSettingsDrawer>

      {scale.isComplete ? (
        <PracticeReportModal title="音阶练习完成" onBack={scale.reset} onRepeat={restartPractice}>
          <p className="practice-report-summary">{settingsSummary}</p>
          <div className="report-grid">
            <div><span>调性</span><strong>{scale.report.keyName}</strong></div><div><span>模式</span><strong>{scale.report.modeName}</strong></div><div><span>BPM</span><strong>{scale.report.bpm}</strong></div>
            <div><span>循环次数</span><strong>{scale.report.loopCount}</strong></div><div><span>每拍音符</span><strong>{scale.report.notesPerBeat}</strong></div><div><span>完成音符数</span><strong>{scale.report.completedNotes}</strong></div>
            <div><span>总音符数</span><strong>{scale.report.totalNotes}</strong></div><div><span>正确数量</span><strong>{scale.report.correct}</strong></div><div><span>错音数量</span><strong>{scale.report.wrongNote}</strong></div>
            <div><span>漏音数量</span><strong>{scale.report.missingNote}</strong></div><div><span>多音数量</span><strong>{scale.report.extraNote}</strong></div><div><span>早弹数量</span><strong>{scale.report.early}</strong></div>
            <div><span>晚弹数量</span><strong>{scale.report.late}</strong></div><div><span>平均偏移</span><strong>{scale.report.averageOffsetMs}ms</strong></div><div><span>正确率</span><strong>{scale.report.accuracy}%</strong></div>
            <div><span>最高连续正确</span><strong>{scale.report.bestStreak}</strong></div><div><span>最容易错的音</span><strong>{scale.report.mostMissedNote}</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
