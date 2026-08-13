import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useRhythmPractice } from '../hooks/useRhythmPractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import { getJudgementLabel } from '../utils/judgement'
import { midiNumberToNoteName } from '../utils/midiNotes'
import type { JudgementResult, TargetEvent } from '../utils/practiceTypes'
import { RHYTHM_BEATS_PER_MEASURE, RHYTHM_CATEGORY_LABELS, RHYTHM_MEASURE_COUNT, RHYTHM_PRACTICE_NOTE } from '../utils/rhythmPatterns'
import { PRACTICE_DIFFICULTY_LABELS } from '../utils/practiceContentTypes'
import type { RhythmCategory } from '../utils/rhythmTypes'
import { createRhythmRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'
import { MetronomeVolumeControl } from './MetronomeVolumeControl'
import { PracticeFeedbackNotice } from './PracticeFeedbackNotice'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'

interface RhythmPracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

const rhythmCategories = Object.keys(RHYTHM_CATEGORY_LABELS) as RhythmCategory[]

function formatTarget(target: TargetEvent | null): string {
  if (!target) return '等待开始'
  if (target.type === 'rest') return '休止'
  return target.notes.map(midiNumberToNoteName).join(' / ')
}

function formatOffset(offset?: number): string {
  if (typeof offset !== 'number') return '-'
  return `${offset > 0 ? '+' : ''}${offset}ms`
}

function formatLatestResult(result: JudgementResult | null): string {
  return result ? getJudgementLabel(result.type) : '暂无判定'
}

export function RhythmPracticePage({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: RhythmPracticePageProps): JSX.Element {
  const rhythm = useRhythmPractice()
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('rhythm')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftPatternId, setDraftPatternId] = useState(rhythm.selectedPatternId)
  const [draftBpm, setDraftBpm] = useState(rhythm.bpm)
  const [draftMetronomeSoundEnabled, setDraftMetronomeSoundEnabled] = useState(rhythm.metronomeSound.enabled)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const pausedForExitRef = useRef(false)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createRhythmRecord({
      timing,
      report: rhythm.report,
      patternId: rhythm.selectedPatternId,
      patternName: rhythm.selectedPattern.name,
      bpm: rhythm.bpm,
      tolerance: rhythm.toleranceLevel,
      difficulty: rhythm.selectedPattern.difficulty
    }),
    [rhythm.bpm, rhythm.report, rhythm.selectedPattern.difficulty, rhythm.selectedPattern.name, rhythm.selectedPatternId, rhythm.toleranceLevel]
  )
  const recorder = usePracticeSessionRecorder(rhythm.isComplete, createRecord)
  const settingsLocked = rhythm.metronome.status !== 'idle' && !rhythm.isComplete
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

    if (exitPromptOpen && rhythm.metronome.status === 'running') {
      pausedForExitRef.current = true
      rhythm.pause()
    } else if (!exitPromptOpen && pausedForExitRef.current) {
      pausedForExitRef.current = false
      rhythm.start()
    }
  }, [exitPromptOpen, practiceActive, rhythm.metronome.status, rhythm.pause, rhythm.start])

  const startPractice = (): void => {
    setSettingsOpen(false)
    if (rhythm.isComplete) {
      recorder.beginSession()
      rhythm.restart()
      return
    }
    if (rhythm.metronome.status !== 'paused') recorder.beginSession()
    rhythm.start()
  }

  const restartPractice = (): void => {
    setSettingsOpen(false)
    recorder.beginSession()
    rhythm.restart()
  }

  const openSettings = (): void => {
    setDraftPatternId(rhythm.selectedPatternId)
    setDraftBpm(rhythm.bpm)
    setDraftMetronomeSoundEnabled(rhythm.metronomeSound.enabled)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    rhythm.setSelectedPatternId(draftPatternId)
    rhythm.setBpm(draftBpm)
    if (draftMetronomeSoundEnabled !== rhythm.metronomeSound.enabled) {
      void rhythm.metronomeSound.setEnabled(draftMetronomeSoundEnabled)
    }
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  const latestResult = rhythm.latestResult?.result ?? null
  const noteName = midiNumberToNoteName(RHYTHM_PRACTICE_NOTE)
  const practiceNoteNames = Array.from(new Set(
    rhythm.selectedPattern.beats.flatMap((beat) => beat.notes ?? (beat.type === 'note' ? [RHYTHM_PRACTICE_NOTE] : []))
  )).map(midiNumberToNoteName).join(' / ') || noteName
  const settingsSummary = `4/4 · ${RHYTHM_CATEGORY_LABELS[rhythm.selectedPattern.category]} · ${rhythm.selectedPattern.name} · ${rhythm.bpm} BPM · ${PRACTICE_DIFFICULTY_LABELS[rhythm.selectedPattern.difficulty]}`
  const patternMeasureSpan = (rhythm.selectedPattern.lengthBeats ?? RHYTHM_BEATS_PER_MEASURE) / RHYTHM_BEATS_PER_MEASURE
  const totalMeasures = RHYTHM_MEASURE_COUNT * patternMeasureSpan
  const rhythmGridStyle = { gridTemplateColumns: rhythm.cells.map((cell) => `${cell.duration}fr`).join(' ') }
  const targetNotes = rhythm.currentTarget?.notes ?? []
  const correctNotes = latestResult?.type === 'correct' ? latestResult.inputNotes : []
  const wrongNotes = latestResult && latestResult.type !== 'correct' ? latestResult.inputNotes : []
  const judgedCount = rhythm.report.correct + rhythm.report.wrongNote + rhythm.report.missingNote +
    rhythm.report.extraNote + rhythm.report.early + rhythm.report.late + rhythm.report.restError + rhythm.report.extraInput

  return (
    <section className="rhythm-page practice-workspace-page">
      <PracticePageHeader
        controls={<MetronomeVolumeControl id="rhythm-header-metronome-volume" value={rhythm.metronomeSound.volume} onChange={rhythm.metronomeSound.setVolume} />}
        eyebrow="Rhythm Practice"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="节奏与切分"
      />

      <div className="practice-single-column">
        <section className="midi-panel rhythm-panel practice-primary-panel">
          <div className="panel-title-row">
            <div>
              <h3>节拍器与当前目标</h3>
              <p>一小节预备拍后进入正式练习，本模板使用 {practiceNoteNames}。</p>
            </div>
            <span className={`audio-status-badge status-${rhythm.metronome.status === 'running' ? 'ready' : 'suspended'}`}>
              {rhythm.metronome.status === 'running' ? '运行中' : rhythm.metronome.status === 'paused' ? '已暂停' : '未开始'}
            </span>
          </div>

          <div className="rhythm-live-row">
            <div className="rhythm-clock-card">
              <div className="metronome-display">
                <div>
                  <span>{rhythm.metronome.isCountingIn ? '预备拍' : '当前小节'}</span>
                  <strong>{rhythm.metronome.isCountingIn ? `${rhythm.metronome.countInBeat} / 4` : `${rhythm.metronome.currentMeasure || 1} / ${RHYTHM_MEASURE_COUNT}`}</strong>
                </div>
                <div><span>当前拍</span><strong>{rhythm.metronome.currentBeat}</strong></div>
              </div>

              <div className="beat-dots" aria-label="当前拍点">
                {[1, 2, 3, 4].map((beat) => (
                  <span key={beat} className={`${rhythm.metronome.currentBeat === beat ? 'is-active' : ''} ${rhythm.metronome.isCountingIn ? 'is-count-in' : ''}`}>{beat}</span>
                ))}
              </div>
            </div>
            <div className="current-target-card practice-current-target">
              <span>当前目标</span>
              <strong>{rhythm.isComplete ? '练习结束' : rhythm.currentTarget ? formatTarget(rhythm.currentTarget) : noteName}</strong>
              <small>{rhythm.currentTarget?.label || (rhythm.metronome.isCountingIn ? '预备拍进行中' : `练习音：${noteName}`)}</small>
            </div>
          </div>

          {latestResult ? (
            <PracticeFeedbackNotice
              detail={`${latestResult.message} / offset ${formatOffset(latestResult.timeOffsetMs)}`}
              label="最近结果"
              resultType={latestResult.type}
              title={formatLatestResult(latestResult)}
            />
          ) : null}

          <div className="practice-primary-actions">
              {rhythm.metronome.status === 'idle' || rhythm.isComplete ? <AppButton onClick={startPractice}>开始练习</AppButton> : null}
              {rhythm.metronome.status === 'running' ? <AppButton variant="secondary" onClick={rhythm.pause}>暂停</AppButton> : null}
              {rhythm.metronome.status === 'paused' ? <AppButton onClick={startPractice}>继续练习</AppButton> : null}
              {practiceActive ? <AppButton variant="secondary" onClick={rhythm.stop}>停止</AppButton> : null}
              {practiceActive ? <AppButton variant="ghost" onClick={restartPractice}>重新开始</AppButton> : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <PracticeStatBar items={[
          { label: '当前小节', value: rhythm.metronome.status === 'idle' ? '—' : `${Math.min(rhythm.metronome.currentMeasure || 1, totalMeasures)} / ${totalMeasures}` },
          { label: '正确', value: rhythm.report.correct },
          { label: '早弹', value: rhythm.report.early },
          { label: '晚弹', value: rhythm.report.late },
          { label: '漏弹', value: rhythm.report.missingNote },
          { label: '多余', value: rhythm.report.extraNote + rhythm.report.extraInput },
          { label: '正确率', value: judgedCount > 0 ? `${rhythm.report.accuracy}%` : '—' }
        ]} />

        <section className="midi-panel rhythm-panel rhythm-pattern-panel">
          <div className="panel-title-row">
            <div><h3>节奏格子</h3><p>{rhythm.selectedPattern.name} · {totalMeasures} 小节 · {practiceNoteNames}</p></div>
          </div>
          <div className={`rhythm-pattern-grid rhythm-${rhythm.selectedPattern.subdivision}`}>
            <div className="rhythm-grid-row rhythm-label-row" style={rhythmGridStyle}>
              {rhythm.cells.map((cell, index) => <span key={cell.id} className={rhythm.currentCellIndex === index ? 'is-active' : ''}>{cell.label}</span>)}
            </div>
            <div className="rhythm-grid-row rhythm-symbol-row" style={rhythmGridStyle}>
              {rhythm.cells.map((cell, index) => (
                <span key={`${cell.id}-symbol`} className={`${cell.type === 'note' ? 'is-note' : 'is-rest'} ${rhythm.currentCellIndex === index ? 'is-active' : ''}`}>
                  {cell.type === 'note' ? (cell.symbol ?? '●') : '空'}
                </span>
              ))}
            </div>
          </div>
        </section>

        {showVirtualKeyboard ? (
          <section className="midi-panel rhythm-panel practice-keyboard-panel">
            <div className="panel-title-row"><div><h3>虚拟钢琴键盘</h3><p>当前目标音淡色高亮，实际 MIDI 输入保持实时显示。</p></div></div>
            <FullKeyboard activeNotes={activeNotes} correctNotes={correctNotes} targetNotes={targetNotes} wrongNotes={wrongNotes} />
          </section>
        ) : null}

      </div>

      <PracticeSettingsDrawer isLocked={settingsLocked} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="节奏练习设置">
        <label className="midi-field" htmlFor="rhythm-pattern-select">
          <span>当前节奏模板</span>
          <select id="rhythm-pattern-select" className="midi-select" disabled={settingsLocked} value={draftPatternId} onChange={(event) => setDraftPatternId(event.target.value)}>
            {rhythmCategories.map((category) => (
              <optgroup key={category} label={RHYTHM_CATEGORY_LABELS[category]}>
                {rhythm.patterns.filter((pattern) => pattern.category === category).map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>{pattern.name} · {PRACTICE_DIFFICULTY_LABELS[pattern.difficulty]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="judgement-help">{rhythm.patterns.find((pattern) => pattern.id === draftPatternId)?.description}</p>
        <label className="bpm-control" htmlFor="rhythm-bpm-input">
          <div><span>BPM</span><strong>{draftBpm}</strong></div>
          <input id="rhythm-bpm-input" type="range" min="40" max="200" disabled={settingsLocked} value={draftBpm} onChange={(event) => setDraftBpm(Number(event.target.value))} />
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

      {rhythm.isComplete ? (
        <PracticeReportModal title="节奏练习完成" onBack={rhythm.reset} onRepeat={restartPractice}>
          <p className="practice-report-summary">{settingsSummary}</p>
          <div className="report-grid">
            <div><span>总节奏事件</span><strong>{rhythm.report.totalTargets}</strong></div>
            <div><span>正确次数</span><strong>{rhythm.report.correct}</strong></div>
            <div><span>早弹次数</span><strong>{rhythm.report.early}</strong></div>
            <div><span>晚弹次数</span><strong>{rhythm.report.late}</strong></div>
            <div><span>漏弹次数</span><strong>{rhythm.report.missingNote}</strong></div>
            <div><span>休止错误</span><strong>{rhythm.report.restError}</strong></div>
            <div><span>多余输入</span><strong>{rhythm.report.extraInput}</strong></div>
            <div><span>平均偏移</span><strong>{rhythm.report.averageOffsetMs}ms</strong></div>
            <div><span>节奏准确率</span><strong>{rhythm.report.accuracy}%</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
