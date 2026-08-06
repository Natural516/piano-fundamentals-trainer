import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useCoordinationPractice } from '../hooks/useCoordinationPractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import type { CoordinationJudgementType } from '../utils/coordinationTypes'
import { COORDINATION_CATEGORY_LABELS } from '../utils/coordinationPatterns'
import { PRACTICE_DIFFICULTY_LABELS } from '../utils/practiceContentTypes'
import type { CoordinationCategory } from '../utils/coordinationTypes'
import { createCoordinationRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { CoordinationGridView } from './CoordinationGridView'
import { FullKeyboard } from './FullKeyboard'
import { MetronomeVolumeControl } from './MetronomeVolumeControl'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeFeedbackNotice } from './PracticeFeedbackNotice'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'

interface CoordinationPracticePageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
  exitPromptOpen: boolean
  onPracticeRunningChange: (isRunning: boolean) => void
}

const resultLabels: Record<CoordinationJudgementType, string> = {
  correct: '正确', wrong_note: '错音', missing_note: '漏音', extra_note: '多音', early: '早弹', late: '晚弹', rest_error: '休止错误'
}
const coordinationCategories = Object.keys(COORDINATION_CATEGORY_LABELS) as CoordinationCategory[]

function formatOffset(offset: number | undefined): string {
  if (typeof offset !== 'number') return '无输入'
  return `${offset > 0 ? '+' : ''}${offset}ms`
}

export function CoordinationPracticePage({
  activeNotes,
  exitPromptOpen,
  latestMidiEvent,
  onBackHome,
  onPracticeRunningChange
}: CoordinationPracticePageProps): JSX.Element {
  const coordination = useCoordinationPractice(latestMidiEvent)
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('coordination')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftPatternId, setDraftPatternId] = useState(coordination.selectedPatternId)
  const [draftBpm, setDraftBpm] = useState(coordination.bpm)
  const [draftMeasureCount, setDraftMeasureCount] = useState(coordination.measureCount)
  const [draftMetronomeSoundEnabled, setDraftMetronomeSoundEnabled] = useState(coordination.metronomeSound.enabled)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createCoordinationRecord({
      timing,
      report: coordination.report,
      patternId: coordination.selectedPatternId,
      difficulty: coordination.selectedPattern.difficulty
    }),
    [coordination.report, coordination.selectedPattern.difficulty, coordination.selectedPatternId]
  )
  const recorder = usePracticeSessionRecorder(coordination.isComplete, createRecord)
  const settingsLocked = coordination.metronome.status !== 'idle' && !coordination.isComplete
  const pausedForExitRef = useRef(false)

  useEffect(() => {
    onPracticeRunningChange(settingsLocked)
  }, [onPracticeRunningChange, settingsLocked])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!settingsLocked) {
      pausedForExitRef.current = false
      return
    }

    if (exitPromptOpen && coordination.metronome.status === 'running') {
      pausedForExitRef.current = true
      coordination.pause()
    } else if (!exitPromptOpen && pausedForExitRef.current) {
      pausedForExitRef.current = false
      coordination.start()
    }
  }, [coordination.metronome.status, coordination.pause, coordination.start, exitPromptOpen, settingsLocked])

  const startPractice = (): void => {
    setSettingsOpen(false)
    if (coordination.metronome.status === 'idle' || coordination.isComplete) recorder.beginSession()
    coordination.start()
  }

  const openSettings = (): void => {
    setDraftPatternId(coordination.selectedPatternId)
    setDraftBpm(coordination.bpm)
    setDraftMeasureCount(coordination.measureCount)
    setDraftMetronomeSoundEnabled(coordination.metronomeSound.enabled)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    coordination.setSelectedPatternId(draftPatternId)
    coordination.setBpm(draftBpm)
    coordination.setMeasureCount(draftMeasureCount)
    if (draftMetronomeSoundEnabled !== coordination.metronomeSound.enabled) {
      void coordination.metronomeSound.setEnabled(draftMetronomeSoundEnabled)
    }
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  const statusLabel = coordination.isComplete
    ? '已完成'
    : coordination.metronome.isCountingIn
      ? `预备拍 ${coordination.metronome.countInBeat}/4`
      : coordination.metronome.status === 'paused'
        ? '已暂停'
        : coordination.isRunning ? '练习中' : '未开始'
  const settingsSummary = `${COORDINATION_CATEGORY_LABELS[coordination.selectedPattern.category]} · ${coordination.selectedPattern.name} · ${coordination.bpm} BPM · ${coordination.measureCount}小节 · ${PRACTICE_DIFFICULTY_LABELS[coordination.selectedPattern.difficulty]}`
  const judgedCount = coordination.report.correct
    + coordination.report.wrongNote
    + coordination.report.missingNote
    + coordination.report.extraNote
    + coordination.report.restError
    + coordination.report.early
    + coordination.report.late

  return (
    <section className="coordination-page practice-workspace-page">
      <PracticePageHeader
        controls={<MetronomeVolumeControl id="coordination-header-metronome-volume" value={coordination.metronomeSound.volume} onChange={coordination.metronomeSound.setVolume} />}
        eyebrow="Hand Coordination"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="左右手协调"
      />

      <div className="practice-single-column">
        <section className="midi-panel coordination-panel coordination-status-panel practice-primary-panel">
          <div className="panel-title-row">
            <div><h3>节拍器与练习状态</h3><p>练习前播放一小节预备拍，正式开始后按八分格推进。</p></div>
            <span className={`audio-status-badge status-${coordination.isRunning ? 'ready' : 'suspended'}`}>{statusLabel}</span>
          </div>
          <div className="coordination-status-grid">
            <div><span>当前小节</span><strong>{coordination.metronome.isCountingIn ? '预备' : Math.min(coordination.currentMeasureIndex + 1, coordination.measureCount)}</strong></div>
            <div><span>当前格</span><strong>{coordination.currentStep?.label ?? '-'}</strong></div>
            <div><span>当前拍</span><strong>{coordination.metronome.currentBeat} / 4</strong></div>
            <div><span>当前细分</span><strong>{coordination.currentStep?.label ?? '—'}</strong></div>
          </div>
          {coordination.latestResult ? (
            <PracticeFeedbackNotice
              detail={`${coordination.latestResult.message} · ${formatOffset(coordination.latestResult.timingOffsetMs)}`}
              label="最近结果"
              resultType={coordination.latestResult.type}
              title={`${resultLabels[coordination.latestResult.type]}${coordination.latestResult.syncWarning ? ' · 同步警告' : ''}`}
            />
          ) : null}
          <div className="practice-primary-actions">
            {coordination.metronome.status === 'idle' || coordination.isComplete ? (
              <AppButton onClick={startPractice}>{coordination.isComplete ? '再练一次' : '开始练习'}</AppButton>
            ) : coordination.isRunning ? <AppButton variant="secondary" onClick={coordination.pause}>暂停练习</AppButton> : <AppButton onClick={startPractice}>继续练习</AppButton>}
            {coordination.metronome.status !== 'idle' && !coordination.isComplete ? <AppButton variant="ghost" onClick={coordination.stop}>停止练习</AppButton> : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <PracticeStatBar items={[
          { label: '当前小节', value: `${coordination.currentMeasureIndex + 1} / ${coordination.measureCount}` },
          { label: '左手错误', value: coordination.report.leftWrongCount },
          { label: '右手错误', value: coordination.report.rightWrongCount },
          { label: '同步警告', value: coordination.report.syncWarning },
          { label: '正确', value: coordination.report.correct },
          { label: '正确率', value: judgedCount > 0 ? `${coordination.report.accuracy}%` : '—' }
        ]} />

        <section className="midi-panel coordination-panel coordination-pattern-panel">
          <div className="panel-title-row"><div><h3>{coordination.selectedPattern.name}</h3><p>{coordination.selectedPattern.description}</p></div><span className="log-count-badge">第 {coordination.currentMeasureIndex + 1} / {coordination.measureCount} 小节</span></div>
          <CoordinationGridView currentPosition={coordination.currentPosition} pattern={coordination.selectedPattern} results={coordination.currentMeasureResults} />
        </section>

        {showVirtualKeyboard ? (
          <section className="midi-panel coordination-panel coordination-keyboard-panel practice-keyboard-panel">
            <div className="panel-title-row"><div><h3>虚拟钢琴键盘</h3><p>当前左右手目标音淡色高亮，实际 MIDI 输入保持实时显示。</p></div></div>
            <FullKeyboard activeNotes={activeNotes} correctNotes={coordination.correctNotes} targetNotes={coordination.targetNotes} wrongNotes={coordination.wrongNotes} />
          </section>
        ) : null}

      </div>

      <PracticeSettingsDrawer isLocked={settingsLocked} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="左右手协调设置">
        <label className="midi-field" htmlFor="coordination-pattern"><span>协调模板</span>
          <select id="coordination-pattern" className="midi-select" disabled={settingsLocked} value={draftPatternId} onChange={(event) => setDraftPatternId(event.target.value)}>
            {coordinationCategories.map((category) => (
              <optgroup key={category} label={COORDINATION_CATEGORY_LABELS[category]}>
                {coordination.patterns.filter((pattern) => pattern.category === category).map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>{pattern.name} · {PRACTICE_DIFFICULTY_LABELS[pattern.difficulty]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="coordination-setting-group"><span>BPM</span><div className="bpm-control">
          <input disabled={settingsLocked} max="120" min="40" type="number" value={draftBpm} onChange={(event) => setDraftBpm(Number(event.target.value))} />
          <input aria-label="协调练习 BPM" disabled={settingsLocked} max="120" min="40" type="range" value={draftBpm} onChange={(event) => setDraftBpm(Number(event.target.value))} />
        </div></div>
        <div className="coordination-setting-group"><span>小节数</span><div className="segmented-control">
          {coordination.measureOptions.map((count) => <button key={count} className={draftMeasureCount === count ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftMeasureCount(count)}>{count} 小节</button>)}
        </div></div>
        <div className="coordination-setting-group"><span>节拍器声音</span><div className="segmented-control">
          <button className={draftMetronomeSoundEnabled ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftMetronomeSoundEnabled(true)}>开启</button>
          <button className={!draftMetronomeSoundEnabled ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftMetronomeSoundEnabled(false)}>关闭</button>
        </div></div>
        <div className="coordination-setting-group"><span>显示虚拟键盘</span><div className="segmented-control">
          <button className={draftShowVirtualKeyboard ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftShowVirtualKeyboard(true)}>显示</button>
          <button className={!draftShowVirtualKeyboard ? 'is-active' : ''} disabled={settingsLocked} type="button" onClick={() => setDraftShowVirtualKeyboard(false)}>隐藏</button>
        </div></div>
      </PracticeSettingsDrawer>

      {coordination.isComplete ? (
        <PracticeReportModal title="左右手协调练习完成">
          <p className="practice-report-summary">{settingsSummary}</p>
          <div className="report-grid coordination-report-grid">
            <div><span>模板</span><strong>{coordination.report.patternName}</strong></div><div><span>BPM</span><strong>{coordination.report.bpm}</strong></div><div><span>小节数</span><strong>{coordination.report.measureCount}</strong></div>
            <div><span>完成循环数</span><strong>{coordination.report.completedLoops}</strong></div>
            <div><span>总格子数</span><strong>{coordination.report.totalCells}</strong></div><div><span>需弹格子</span><strong>{coordination.report.playableCells}</strong></div><div><span>正确</span><strong>{coordination.report.correct}</strong></div>
            <div><span>错音</span><strong>{coordination.report.wrongNote}</strong></div><div><span>漏音</span><strong>{coordination.report.missingNote}</strong></div><div><span>多音</span><strong>{coordination.report.extraNote}</strong></div>
            <div><span>休止错误</span><strong>{coordination.report.restError}</strong></div><div><span>早弹</span><strong>{coordination.report.early}</strong></div><div><span>晚弹</span><strong>{coordination.report.late}</strong></div>
            <div><span>同步警告</span><strong>{coordination.report.syncWarning}</strong></div><div><span>平均偏移</span><strong>{coordination.report.averageOffsetMs}ms</strong></div><div><span>正确率</span><strong>{coordination.report.accuracy}%</strong></div>
            <div><span>左手错误</span><strong>{coordination.report.leftWrongCount}</strong></div><div><span>右手错误</span><strong>{coordination.report.rightWrongCount}</strong></div><div><span>未归属多音</span><strong>{coordination.report.generalExtraCount}</strong></div>
            <div><span>最易错位置</span><strong>{coordination.report.hardestPosition}</strong></div>
          </div>
          <div className="practice-report-actions"><AppButton onClick={startPractice}>再练一次</AppButton><AppButton variant="secondary" onClick={onBackHome}>返回首页</AppButton></div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
