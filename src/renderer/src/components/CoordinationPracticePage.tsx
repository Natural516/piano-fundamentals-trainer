import { useCallback } from 'react'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { useCoordinationPractice } from '../hooks/useCoordinationPractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import type { CoordinationJudgementType } from '../utils/coordinationTypes'
import type { ToleranceLevel } from '../utils/practiceTypes'
import { TOLERANCE_MS } from '../utils/judgement'
import { createCoordinationRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { CoordinationGridView } from './CoordinationGridView'
import { FullKeyboard } from './FullKeyboard'

interface CoordinationPracticePageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
}

const toleranceOptions: ToleranceLevel[] = ['loose', 'standard', 'strict']
const toleranceLabels: Record<ToleranceLevel, string> = {
  loose: '宽松',
  standard: '标准',
  strict: '严格'
}

const resultLabels: Record<CoordinationJudgementType, string> = {
  correct: '正确',
  wrong_note: '错音',
  missing_note: '漏音',
  extra_note: '多音',
  early: '早弹',
  late: '晚弹',
  rest_error: '休止错误'
}

function formatOffset(offset: number | undefined): string {
  if (typeof offset !== 'number') return '无输入'
  return `${offset > 0 ? '+' : ''}${offset}ms`
}

export function CoordinationPracticePage({
  activeNotes,
  latestMidiEvent,
  onBackHome
}: CoordinationPracticePageProps): JSX.Element {
  const coordination = useCoordinationPractice(latestMidiEvent)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createCoordinationRecord({
      timing,
      report: coordination.report,
      patternId: coordination.selectedPatternId
    }),
    [coordination.report, coordination.selectedPatternId]
  )
  const recorder = usePracticeSessionRecorder(coordination.isComplete, createRecord)
  const startPractice = (): void => {
    if (coordination.metronome.status === 'idle' || coordination.isComplete) recorder.beginSession()
    coordination.start()
  }
  const settingsLocked = coordination.metronome.status !== 'idle'
  const statusLabel = coordination.isComplete
    ? '已完成'
    : coordination.metronome.isCountingIn
      ? `预备拍 ${coordination.metronome.countInBeat}/4`
      : coordination.metronome.status === 'paused'
        ? '已暂停'
        : coordination.isRunning
          ? '练习中'
          : '未开始'

  return (
    <section className="coordination-page">
      <header className="midi-page-header coordination-page-header">
        <div>
          <span className="eyebrow">Hand Coordination</span>
          <h2>左右手协调</h2>
          <p>双手同步 · 错位节奏 · 伴奏型训练</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="coordination-grid-layout">
        <section className="midi-panel coordination-panel coordination-settings-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习设置</h3>
              <p>C 大调 · 4/4 拍 · 每小节八个八分格</p>
            </div>
          </div>

          <label className="midi-field" htmlFor="coordination-pattern">
            <span>协调模板</span>
            <select
              id="coordination-pattern"
              className="midi-select"
              disabled={settingsLocked}
              value={coordination.selectedPatternId}
              onChange={(event) => coordination.setSelectedPatternId(event.target.value)}
            >
              {coordination.patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>{pattern.name}</option>
              ))}
            </select>
          </label>

          <div className="coordination-setting-group">
            <span>BPM</span>
            <div className="bpm-control">
              <input
                disabled={settingsLocked}
                max="120"
                min="40"
                type="number"
                value={coordination.bpm}
                onChange={(event) => coordination.setBpm(Number(event.target.value))}
              />
              <input
                aria-label="协调练习 BPM"
                disabled={settingsLocked}
                max="120"
                min="40"
                type="range"
                value={coordination.bpm}
                onChange={(event) => coordination.setBpm(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="coordination-setting-group">
            <span>判定宽容度</span>
            <div className="segmented-control">
              {toleranceOptions.map((level) => (
                <button
                  key={level}
                  className={coordination.toleranceLevel === level ? 'is-active' : ''}
                  disabled={settingsLocked}
                  type="button"
                  onClick={() => coordination.setToleranceLevel(level)}
                >
                  {toleranceLabels[level]} ±{TOLERANCE_MS[level]}ms
                </button>
              ))}
            </div>
          </div>

          <div className="coordination-setting-group">
            <span>小节数</span>
            <div className="segmented-control">
              {coordination.measureOptions.map((count) => (
                <button
                  key={count}
                  className={coordination.measureCount === count ? 'is-active' : ''}
                  disabled={settingsLocked}
                  type="button"
                  onClick={() => coordination.setMeasureCount(count)}
                >
                  {count} 小节
                </button>
              ))}
            </div>
          </div>

          <div className="practice-control-row coordination-control-row">
            {coordination.metronome.status === 'idle' || coordination.isComplete ? (
              <AppButton className="primary-button coordination-action-button" onClick={startPractice}>
                {coordination.isComplete ? '再练一次' : '开始练习'}
              </AppButton>
            ) : coordination.isRunning ? (
              <AppButton variant="secondary" onClick={coordination.pause}>暂停练习</AppButton>
            ) : (
              <AppButton onClick={startPractice}>继续练习</AppButton>
            )}
            {coordination.metronome.status !== 'idle' && !coordination.isComplete ? (
              <AppButton variant="ghost" onClick={coordination.stop}>停止练习</AppButton>
            ) : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <section className="midi-panel coordination-panel coordination-status-panel">
          <div className="panel-title-row">
            <div>
              <h3>节拍器状态</h3>
              <p>练习前播放一小节预备拍，正式开始后按八分格推进。</p>
            </div>
            <span className={`audio-status-badge status-${coordination.isRunning ? 'ready' : 'suspended'}`}>
              {statusLabel}
            </span>
          </div>

          <div className="coordination-status-grid">
            <div><span>当前小节</span><strong>{coordination.metronome.isCountingIn ? '预备' : Math.min(coordination.currentMeasureIndex + 1, coordination.measureCount)}</strong></div>
            <div><span>当前格</span><strong>{coordination.currentStep?.label ?? '-'}</strong></div>
            <div><span>当前拍</span><strong>{coordination.metronome.currentBeat} / 4</strong></div>
            <div><span>八分格时值</span><strong>{Math.round(coordination.metronome.beatDurationMs / 2)}ms</strong></div>
          </div>

          <div className="metronome-sound-header coordination-sound-row">
            <div>
              <strong>节拍器声音</strong>
              <span>{coordination.metronomeSound.enabled ? '开启' : '关闭'} / 音量 {coordination.metronomeSound.volume}%</span>
            </div>
            <AppButton
              className={`monitor-toggle ${coordination.metronomeSound.enabled ? 'is-on' : ''}`}
              variant="ghost"
              onClick={() => void coordination.metronomeSound.setEnabled(!coordination.metronomeSound.enabled)}
            >
              {coordination.metronomeSound.enabled ? '开启' : '关闭'}
            </AppButton>
          </div>
        </section>

        <section className="midi-panel coordination-panel coordination-pattern-panel">
          <div className="panel-title-row">
            <div>
              <h3>{coordination.selectedPattern.name}</h3>
              <p>{coordination.selectedPattern.description}</p>
            </div>
            <span className="log-count-badge">第 {coordination.currentMeasureIndex + 1} / {coordination.measureCount} 小节</span>
          </div>
          <CoordinationGridView
            currentPosition={coordination.currentPosition}
            pattern={coordination.selectedPattern}
            results={coordination.currentMeasureResults}
          />
        </section>

        <section className="midi-panel coordination-panel coordination-feedback-panel">
          <div className="panel-title-row">
            <div>
              <h3>实时反馈</h3>
              <p>每格只记录一个主要结果，同步偏差作为附加警告。</p>
            </div>
          </div>

          <div className={`latest-judgement ${coordination.latestResult ? `result-${coordination.latestResult.type}` : ''}`}>
            <span>最近结果</span>
            <strong>
              {coordination.latestResult ? resultLabels[coordination.latestResult.type] : '等待练习开始'}
              {coordination.latestResult?.syncWarning ? ' · 同步警告' : ''}
            </strong>
            <small>{coordination.latestResult?.message ?? 'MIDI noteOn 将按当前八分格归组。'}</small>
          </div>

          <div className="judgement-result-list coordination-result-list">
            {coordination.recentResults.length > 0 ? coordination.recentResults.map((result) => (
              <article key={result.id} className={`judgement-result-item result-${result.type}`}>
                <span>{resultLabels[result.type]}</span>
                <strong>{result.label}{result.syncWarning ? ' · 同步警告' : ''}</strong>
                <small>{formatOffset(result.timingOffsetMs)}</small>
              </article>
            )) : <div className="empty-midi-state compact">暂无判定结果</div>}
          </div>
        </section>

        <section className="midi-panel coordination-panel report-panel coordination-report-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习报告</h3>
              <p>正确率以全部有效八分格为分母，包含应弹格和应保持休止的格。</p>
            </div>
            <span className="log-count-badge">{coordination.report.correct}/{coordination.report.totalCells}</span>
          </div>
          <div className="report-grid coordination-report-grid">
            <div><span>模板</span><strong>{coordination.report.patternName}</strong></div>
            <div><span>BPM</span><strong>{coordination.report.bpm}</strong></div>
            <div><span>小节数</span><strong>{coordination.report.measureCount}</strong></div>
            <div><span>总格子数</span><strong>{coordination.report.totalCells}</strong></div>
            <div><span>需弹格子</span><strong>{coordination.report.playableCells}</strong></div>
            <div><span>正确</span><strong>{coordination.report.correct}</strong></div>
            <div><span>错音</span><strong>{coordination.report.wrongNote}</strong></div>
            <div><span>漏音</span><strong>{coordination.report.missingNote}</strong></div>
            <div><span>多音</span><strong>{coordination.report.extraNote}</strong></div>
            <div><span>休止错误</span><strong>{coordination.report.restError}</strong></div>
            <div><span>早弹</span><strong>{coordination.report.early}</strong></div>
            <div><span>晚弹</span><strong>{coordination.report.late}</strong></div>
            <div><span>同步警告</span><strong>{coordination.report.syncWarning}</strong></div>
            <div><span>平均偏移</span><strong>{coordination.report.averageOffsetMs}ms</strong></div>
            <div><span>正确率</span><strong>{coordination.report.accuracy}%</strong></div>
            <div><span>左手错误</span><strong>{coordination.report.leftWrongCount}</strong></div>
            <div><span>右手错误</span><strong>{coordination.report.rightWrongCount}</strong></div>
            <div><span>未归属多音</span><strong>{coordination.report.generalExtraCount}</strong></div>
            <div><span>最易错位置</span><strong>{coordination.report.hardestPosition}</strong></div>
          </div>
        </section>

        <section className="midi-panel coordination-panel coordination-keyboard-panel">
          <div className="panel-title-row">
            <div>
              <h3>虚拟钢琴键盘</h3>
              <p>当前左右手目标音淡色高亮，实际 MIDI 输入保持实时显示。</p>
            </div>
          </div>
          <FullKeyboard
            activeNotes={activeNotes}
            correctNotes={coordination.correctNotes}
            targetNotes={coordination.targetNotes}
            wrongNotes={coordination.wrongNotes}
          />
        </section>
      </div>
    </section>
  )
}
