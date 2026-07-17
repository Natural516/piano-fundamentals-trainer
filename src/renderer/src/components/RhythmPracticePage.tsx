import type { MidiEventRecord } from '../types'
import { useRhythmPractice } from '../hooks/useRhythmPractice'
import { getJudgementLabel, getToleranceMs } from '../utils/judgement'
import { midiNumberToNoteName } from '../utils/midiNotes'
import type { JudgementResult, TargetEvent, ToleranceLevel } from '../utils/practiceTypes'
import { RHYTHM_MEASURE_COUNT, RHYTHM_PRACTICE_NOTE } from '../utils/rhythmPatterns'
import { AppButton } from './AppButton'

interface RhythmPracticePageProps {
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
}

const toleranceOptions: Array<{ value: ToleranceLevel; label: string }> = [
  { value: 'loose', label: '宽松' },
  { value: 'standard', label: '标准' },
  { value: 'strict', label: '严格' }
]

function formatTarget(target: TargetEvent | null): string {
  if (!target) {
    return '等待开始'
  }

  if (target.type === 'rest') {
    return '休止'
  }

  return target.notes.map(midiNumberToNoteName).join(' / ')
}

function formatOffset(offset?: number): string {
  if (typeof offset !== 'number') {
    return '-'
  }

  return `${offset > 0 ? '+' : ''}${offset}ms`
}

function formatLatestResult(result: JudgementResult | null): string {
  if (!result) {
    return '暂无判定'
  }

  return getJudgementLabel(result.type)
}

export function RhythmPracticePage({ latestMidiEvent, onBackHome }: RhythmPracticePageProps): JSX.Element {
  const rhythm = useRhythmPractice(latestMidiEvent)
  const latestResult = rhythm.latestResult?.result ?? null
  const noteName = midiNumberToNoteName(RHYTHM_PRACTICE_NOTE)

  return (
    <section className="rhythm-page">
      <header className="midi-page-header rhythm-page-header">
        <div>
          <span className="eyebrow">Rhythm Practice</span>
          <h2>节奏与切分</h2>
          <p>4/4 拍 · 节奏稳定性训练</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="rhythm-grid-layout">
        <section className="midi-panel rhythm-panel rhythm-settings-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习设置</h3>
              <p>第一版固定使用 C4，软件只判断按键时机。</p>
            </div>
          </div>

          <label className="midi-select-label" htmlFor="rhythm-pattern-select">
            当前节奏模板
          </label>
          <select
            id="rhythm-pattern-select"
            className="midi-select"
            disabled={rhythm.isRunning}
            value={rhythm.selectedPatternId}
            onChange={(event) => rhythm.setSelectedPatternId(event.target.value)}
          >
            {rhythm.patterns.map((pattern) => (
              <option key={pattern.id} value={pattern.id}>
                {pattern.name}
              </option>
            ))}
          </select>
          <p className="judgement-help">{rhythm.selectedPattern.description}</p>

          <label className="bpm-control" htmlFor="rhythm-bpm-input">
            <div>
              <span>BPM</span>
              <strong>{rhythm.bpm}</strong>
            </div>
            <input
              id="rhythm-bpm-input"
              type="range"
              min="40"
              max="200"
              disabled={rhythm.isRunning}
              value={rhythm.bpm}
              onChange={(event) => rhythm.setBpm(Number(event.target.value))}
            />
          </label>

          <div className="tolerance-control">
            <span>判定宽容度</span>
            <div className="segmented-control">
              {toleranceOptions.map((option) => (
                <button
                  key={option.value}
                  className={rhythm.toleranceLevel === option.value ? 'is-active' : ''}
                  disabled={rhythm.isRunning}
                  type="button"
                  onClick={() => rhythm.setToleranceLevel(option.value)}
                >
                  {option.label}
                  <small>±{getToleranceMs(option.value)}ms</small>
                </button>
              ))}
            </div>
          </div>

          <div className="practice-control-row">
            <AppButton className="primary-button rhythm-action-button" onClick={rhythm.start}>
              {rhythm.metronome.status === 'paused' ? '继续练习' : '开始练习'}
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={rhythm.pause}>
              暂停
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={rhythm.stop}>
              停止
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={rhythm.restart}>
              重新开始
            </AppButton>
          </div>
        </section>

        <section className="midi-panel rhythm-panel">
          <div className="panel-title-row">
            <div>
              <h3>节拍器状态</h3>
              <p>一小节预备拍后进入正式练习。</p>
            </div>
            <span className={`audio-status-badge status-${rhythm.metronome.status === 'running' ? 'ready' : 'suspended'}`}>
              {rhythm.metronome.status === 'running' ? '运行中' : rhythm.metronome.status === 'paused' ? '已暂停' : '未开始'}
            </span>
          </div>

          <div className="metronome-display">
            <div>
              <span>{rhythm.metronome.isCountingIn ? '预备拍' : '当前小节'}</span>
              <strong>
                {rhythm.metronome.isCountingIn
                  ? `${rhythm.metronome.countInBeat} / 4`
                  : `${rhythm.metronome.currentMeasure || 1} / ${RHYTHM_MEASURE_COUNT}`}
              </strong>
            </div>
            <div>
              <span>当前拍</span>
              <strong>{rhythm.metronome.currentBeat}</strong>
            </div>
          </div>

          <div className="beat-dots" aria-label="当前拍点">
            {[1, 2, 3, 4].map((beat) => (
              <span
                key={beat}
                className={`${rhythm.metronome.currentBeat === beat ? 'is-active' : ''} ${rhythm.metronome.isCountingIn ? 'is-count-in' : ''}`}
              >
                {beat}
              </span>
            ))}
          </div>

          <div className="current-target-card">
            <span>当前目标</span>
            <strong>{rhythm.isComplete ? '练习结束' : formatTarget(rhythm.currentTarget)}</strong>
            <small>{rhythm.currentTarget?.label || (rhythm.metronome.isCountingIn ? '等待预备拍结束' : `练习音：${noteName}`)}</small>
          </div>
        </section>

        <section className="midi-panel rhythm-panel rhythm-pattern-panel">
          <div className="panel-title-row">
            <div>
              <h3>节奏格子</h3>
              <p>{rhythm.selectedPattern.name} · {RHYTHM_MEASURE_COUNT} 小节 · 练习音 {noteName}</p>
            </div>
          </div>

          <div className={`rhythm-pattern-grid rhythm-${rhythm.selectedPattern.subdivision}`}>
            <div className="rhythm-grid-row rhythm-label-row">
              {rhythm.cells.map((cell, index) => (
                <span key={cell.id} className={rhythm.currentCellIndex === index ? 'is-active' : ''}>
                  {cell.label}
                </span>
              ))}
            </div>
            <div className="rhythm-grid-row rhythm-symbol-row">
              {rhythm.cells.map((cell, index) => (
                <span
                  key={`${cell.id}-symbol`}
                  className={`${cell.type === 'note' ? 'is-note' : 'is-rest'} ${rhythm.currentCellIndex === index ? 'is-active' : ''}`}
                >
                  {cell.type === 'note' ? '●' : '空'}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="midi-panel rhythm-panel rhythm-result-panel">
          <div className="panel-title-row">
            <div>
              <h3>实时判定</h3>
              <p>只读取 MIDI noteOn，noteOff 不参与节奏判定。</p>
            </div>
          </div>

          <div className={`latest-judgement ${latestResult ? `result-${latestResult.type}` : ''}`}>
            <span>最近结果</span>
            <strong>{formatLatestResult(latestResult)}</strong>
            <small>{latestResult ? `${latestResult.message} / offset ${formatOffset(latestResult.timeOffsetMs)}` : '开始后按 C4 跟随节拍器'}</small>
          </div>

          <div className="judgement-result-list rhythm-result-list">
            {rhythm.recentResults.length > 0 ? (
              rhythm.recentResults.map(({ result, source }) => (
                <article key={`${source}-${result.id}`} className={`judgement-result-item result-${result.type}`}>
                  <span>{getJudgementLabel(result.type)}</span>
                  <strong>{result.target.label || result.target.id}</strong>
                  <small>{formatOffset(result.timeOffsetMs)}</small>
                </article>
              ))
            ) : (
              <div className="empty-midi-state compact">暂无判定结果</div>
            )}
          </div>
        </section>

        <section className="midi-panel rhythm-panel report-panel rhythm-report-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习报告</h3>
              <p>{rhythm.isComplete ? '节奏练习完成。' : '练习中会实时汇总当前统计。'}</p>
            </div>
            <span className="log-count-badge">{rhythm.report.correct}/{rhythm.report.totalTargets}</span>
          </div>

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
        </section>

        <section className="midi-panel rhythm-panel rhythm-sound-panel">
          <div className="metronome-sound-header">
            <div>
              <strong>节拍器声音</strong>
              <span>{rhythm.metronomeSound.enabled ? '开启' : '关闭'} / 音量 {rhythm.metronomeSound.volume}%</span>
            </div>
            <AppButton
              className={`monitor-toggle ${rhythm.metronomeSound.enabled ? 'is-on' : ''}`}
              variant="ghost"
              onClick={() => {
                void rhythm.metronomeSound.setEnabled(!rhythm.metronomeSound.enabled)
              }}
            >
              {rhythm.metronomeSound.enabled ? '开启' : '关闭'}
            </AppButton>
          </div>
          <label className="metronome-volume-control" htmlFor="rhythm-metronome-volume">
            <span>节拍器音量</span>
            <strong>{rhythm.metronomeSound.volume}%</strong>
            <input
              id="rhythm-metronome-volume"
              type="range"
              min="0"
              max="100"
              value={rhythm.metronomeSound.volume}
              onChange={(event) => rhythm.metronomeSound.setVolume(Number(event.target.value))}
            />
          </label>
        </section>
      </div>
    </section>
  )
}
