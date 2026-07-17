import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { useScalePractice } from '../hooks/useScalePractice'
import { getJudgementLabel, getToleranceMs } from '../utils/judgement'
import type { JudgementResult, ToleranceLevel } from '../utils/practiceTypes'
import type { MajorScaleKey, ScalePracticeMode } from '../utils/scaleTypes'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'

interface ScalePracticePageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
}

const toleranceOptions: Array<{ value: ToleranceLevel; label: string }> = [
  { value: 'loose', label: '宽松' },
  { value: 'standard', label: '标准' },
  { value: 'strict', label: '严格' }
]

function formatOffset(offset?: number): string {
  if (typeof offset !== 'number') {
    return '-'
  }

  return `${offset > 0 ? '+' : ''}${offset}ms`
}

function formatLatestResult(result: JudgementResult | null): string {
  return result ? getJudgementLabel(result.type) : '暂无判定'
}

function formatLatestMessage(result: JudgementResult | null): string {
  if (!result) {
    return '开始后按顺序弹奏当前音阶'
  }

  if (result.type === 'missing_note') {
    return `${result.message}，请补弹当前目标音`
  }

  return `${result.message} / offset ${formatOffset(result.timeOffsetMs)}`
}

export function ScalePracticePage({
  activeNotes,
  latestMidiEvent,
  onBackHome
}: ScalePracticePageProps): JSX.Element {
  const scale = useScalePractice(latestMidiEvent)
  const latestResult = scale.latestResult

  return (
    <section className="scale-page">
      <header className="midi-page-header scale-page-header">
        <div>
          <span className="eyebrow">Scale Practice</span>
          <h2>音阶练习</h2>
          <p>十二大调 · 顺序与节奏训练</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="scale-grid-layout">
        <section className="midi-panel scale-panel scale-settings-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习设置</h3>
              <p>第一版为一个八度大调音阶，一拍一个目标音。</p>
            </div>
          </div>

          <label className="midi-select-label" htmlFor="scale-key-select">
            调性
          </label>
          <select
            id="scale-key-select"
            className="midi-select"
            disabled={scale.isRunning}
            value={scale.selectedKey}
            onChange={(event) => scale.setSelectedKey(event.target.value as MajorScaleKey)}
          >
            {scale.scales.map((pattern) => (
              <option key={pattern.key} value={pattern.key}>
                {pattern.name}
              </option>
            ))}
          </select>

          <label className="midi-select-label" htmlFor="scale-mode-select">
            练习手型
          </label>
          <select
            id="scale-mode-select"
            className="midi-select"
            disabled={scale.isRunning}
            value={scale.selectedMode}
            onChange={(event) => scale.setSelectedMode(event.target.value as ScalePracticeMode)}
          >
            {scale.modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
          </select>
          <p className="judgement-help">
            {scale.modes.find((mode) => mode.id === scale.selectedMode)?.description}
          </p>

          <label className="bpm-control" htmlFor="scale-bpm-input">
            <div>
              <span>BPM</span>
              <strong>{scale.bpm}</strong>
            </div>
            <input
              id="scale-bpm-input"
              type="range"
              min="40"
              max="200"
              disabled={scale.isRunning}
              value={scale.bpm}
              onChange={(event) => scale.setBpm(Number(event.target.value))}
            />
          </label>

          <div className="tolerance-control">
            <span>判定宽容度</span>
            <div className="segmented-control">
              {toleranceOptions.map((option) => (
                <button
                  key={option.value}
                  className={scale.toleranceLevel === option.value ? 'is-active' : ''}
                  disabled={scale.isRunning}
                  type="button"
                  onClick={() => scale.setToleranceLevel(option.value)}
                >
                  {option.label}
                  <small>±{getToleranceMs(option.value)}ms</small>
                </button>
              ))}
            </div>
          </div>

          <div className="practice-control-row">
            <AppButton className="primary-button scale-action-button" onClick={scale.start}>
              {scale.metronome.status === 'paused' ? '继续练习' : '开始练习'}
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={scale.pause}>
              暂停
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={scale.stop}>
              停止
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={scale.restart}>
              重新开始
            </AppButton>
          </div>
        </section>

        <section className="midi-panel scale-panel">
          <div className="panel-title-row">
            <div>
              <h3>节拍器状态</h3>
              <p>一小节预备拍后开始，跟随节拍器逐音弹奏。</p>
            </div>
            <span className={`audio-status-badge status-${scale.metronome.status === 'running' ? 'ready' : 'suspended'}`}>
              {scale.metronome.status === 'running' ? '运行中' : scale.metronome.status === 'paused' ? '已暂停' : '未开始'}
            </span>
          </div>

          <div className="metronome-display">
            <div>
              <span>{scale.metronome.isCountingIn ? '预备拍' : '当前小节'}</span>
              <strong>{scale.metronome.isCountingIn ? `${scale.metronome.countInBeat} / 4` : `第 ${scale.metronome.currentMeasure || 1} 小节`}</strong>
            </div>
            <div>
              <span>当前拍</span>
              <strong>{scale.metronome.currentBeat}</strong>
            </div>
          </div>

          <div className="beat-dots" aria-label="当前拍点">
            {[1, 2, 3, 4].map((beat) => (
              <span
                key={beat}
                className={`${scale.metronome.currentBeat === beat ? 'is-active' : ''} ${scale.metronome.isCountingIn ? 'is-count-in' : ''}`}
              >
                {beat}
              </span>
            ))}
          </div>

          <div className="current-target-card">
            <span>当前目标</span>
            <strong>{scale.isComplete ? '练习结束' : scale.currentStep?.label ?? '等待开始'}</strong>
            <small>{scale.selectedScale.name} · {scale.selectedModeName}</small>
          </div>
        </section>

        <section className="midi-panel scale-panel scale-sequence-panel">
          <div className="panel-title-row">
            <div>
              <h3>音阶序列</h3>
              <p>
                {scale.selectedScale.name} · {scale.selectedModeName} ·
                调号：{scale.selectedScale.accidentals.length > 0 ? scale.selectedScale.accidentals.join(' / ') : '无升降号'}
              </p>
            </div>
          </div>

          <div className="scale-sequence-grid">
            {scale.steps.map((step, index) => (
              <span
                key={`${step.id}-${index}`}
                className={`${scale.currentStepIndex === index ? 'is-active' : ''} ${index < scale.currentStepIndex ? 'is-past' : ''}`}
              >
                <small>{index + 1}</small>
                <strong>{step.label}</strong>
              </span>
            ))}
          </div>
        </section>

        <section className="midi-panel scale-panel scale-result-panel">
          <div className="panel-title-row">
            <div>
              <h3>实时判定</h3>
              <p>判断音符顺序和节奏时机，只读取 MIDI noteOn。</p>
            </div>
          </div>

          <div className={`latest-judgement ${latestResult ? `result-${latestResult.type}` : ''}`}>
            <span>最近结果</span>
            <strong>{formatLatestResult(latestResult)}</strong>
            <small>{formatLatestMessage(latestResult)}</small>
          </div>

          <div className="judgement-result-list scale-result-list">
            {scale.recentResults.length > 0 ? (
              scale.recentResults.map((result) => (
                <article key={result.id} className={`judgement-result-item result-${result.type}`}>
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

        <section className="midi-panel scale-panel report-panel scale-report-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习报告</h3>
              <p>{scale.isComplete ? '音阶练习完成。' : '练习中会实时汇总当前统计。'}</p>
            </div>
            <span className="log-count-badge">{scale.report.correct}/{scale.report.totalTargets}</span>
          </div>

          <div className="report-grid">
            <div><span>调性</span><strong>{scale.report.keyName}</strong></div>
            <div><span>模式</span><strong>{scale.report.modeName}</strong></div>
            <div><span>BPM</span><strong>{scale.report.bpm}</strong></div>
            <div><span>总音符数</span><strong>{scale.report.totalNotes}</strong></div>
            <div><span>正确数量</span><strong>{scale.report.correct}</strong></div>
            <div><span>错音数量</span><strong>{scale.report.wrongNote}</strong></div>
            <div><span>漏音数量</span><strong>{scale.report.missingNote}</strong></div>
            <div><span>多音数量</span><strong>{scale.report.extraNote}</strong></div>
            <div><span>早弹数量</span><strong>{scale.report.early}</strong></div>
            <div><span>晚弹数量</span><strong>{scale.report.late}</strong></div>
            <div><span>平均偏移</span><strong>{scale.report.averageOffsetMs}ms</strong></div>
            <div><span>正确率</span><strong>{scale.report.accuracy}%</strong></div>
            <div><span>最高连续正确</span><strong>{scale.report.bestStreak}</strong></div>
            <div><span>最容易错的音</span><strong>{scale.report.mostMissedNote}</strong></div>
          </div>
        </section>

        <section className="midi-panel scale-panel scale-keyboard-panel">
          <div className="panel-title-row">
            <div>
              <h3>虚拟钢琴键盘</h3>
              <p>当前目标音为淡色边框，MIDI 实际输入仍实时高亮。</p>
            </div>
          </div>
          <FullKeyboard
            activeNotes={activeNotes}
            correctNotes={scale.correctNotes}
            targetNotes={scale.targetNotes}
            wrongNotes={scale.wrongNotes}
          />
        </section>

        <section className="midi-panel scale-panel scale-sound-panel">
          <div className="metronome-sound-header">
            <div>
              <strong>节拍器声音</strong>
              <span>{scale.metronomeSound.enabled ? '开启' : '关闭'} / 音量 {scale.metronomeSound.volume}%</span>
            </div>
            <AppButton
              className={`monitor-toggle ${scale.metronomeSound.enabled ? 'is-on' : ''}`}
              variant="ghost"
              onClick={() => {
                void scale.metronomeSound.setEnabled(!scale.metronomeSound.enabled)
              }}
            >
              {scale.metronomeSound.enabled ? '开启' : '关闭'}
            </AppButton>
          </div>
          <label className="metronome-volume-control" htmlFor="scale-metronome-volume">
            <span>节拍器音量</span>
            <strong>{scale.metronomeSound.volume}%</strong>
            <input
              id="scale-metronome-volume"
              type="range"
              min="0"
              max="100"
              value={scale.metronomeSound.volume}
              onChange={(event) => scale.metronomeSound.setVolume(Number(event.target.value))}
            />
          </label>
        </section>
      </div>
    </section>
  )
}
