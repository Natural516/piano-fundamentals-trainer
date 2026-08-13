import { useEffect, useMemo, useState } from 'react'
import { useMetronome } from '../hooks/useMetronome'
import { useMetronomeSound } from '../hooks/useMetronomeSound'
import { usePracticeEngine } from '../hooks/usePracticeEngine'
import { getJudgementLabel } from '../utils/judgement'
import { midiNumberToNoteName } from '../utils/midiNotes'
import type { TargetEvent, TestExercise, ToleranceLevel } from '../utils/practiceTypes'
import { AppButton } from './AppButton'
import { MetronomeVolumeControl } from './MetronomeVolumeControl'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { SettingsIcon } from './SettingsIcon'

function createTestExercises(beatMs: number): TestExercise[] {
  return [
    {
      id: 'single-c4',
      title: '测试 1：单音四分音符',
      description: '4/4，每拍弹 C4',
      bpm: 60,
      targets: [0, 1, 2, 3].map((beat) => ({
        id: `single-c4-${beat + 1}`,
        timeMs: beat * beatMs,
        notes: [60],
        durationMs: beatMs,
        type: 'note',
        label: `第 ${beat + 1} 拍 C4`,
        hand: 'both'
      }))
    },
    {
      id: 'c-major-chord',
      title: '测试 2：简单和弦',
      description: '每小节第 1 拍弹 C 大三和弦',
      bpm: 60,
      targets: [0, 4].map((beat, index) => ({
        id: `c-major-chord-${index + 1}`,
        timeMs: beat * beatMs,
        notes: [60, 64, 67],
        durationMs: beatMs,
        type: 'chord',
        label: `第 ${index + 1} 小节 C 大三和弦`,
        hand: 'both'
      }))
    },
    {
      id: 'rest-check',
      title: '测试 3：休止测试',
      description: '第 1、3 拍弹 C4，第 2、4 拍休止',
      bpm: 60,
      targets: [
        {
          id: 'rest-check-1',
          timeMs: 0,
          notes: [60],
          durationMs: beatMs,
          type: 'note',
          label: '第 1 拍 C4',
          hand: 'both'
        },
        {
          id: 'rest-check-2',
          timeMs: beatMs,
          notes: [],
          durationMs: beatMs,
          type: 'rest',
          label: '第 2 拍休止'
        },
        {
          id: 'rest-check-3',
          timeMs: beatMs * 2,
          notes: [60],
          durationMs: beatMs,
          type: 'note',
          label: '第 3 拍 C4',
          hand: 'both'
        },
        {
          id: 'rest-check-4',
          timeMs: beatMs * 3,
          notes: [],
          durationMs: beatMs,
          type: 'rest',
          label: '第 4 拍休止'
        }
      ]
    }
  ]
}

function formatTargetNotes(target: TargetEvent | null): string {
  if (!target) {
    return '暂无目标'
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

export function JudgementTestPage(): JSX.Element {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [selectedExerciseId, setSelectedExerciseId] = useState('single-c4')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftMetronomeSoundEnabled, setDraftMetronomeSoundEnabled] = useState(metronomeSound.enabled)
  const toleranceLevel: ToleranceLevel = 'standard'
  const beatMs = 60000 / metronome.bpm
  const exercises = useMemo(() => createTestExercises(beatMs), [beatMs])
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? exercises[0]
  const practice = usePracticeEngine({
    targets: selectedExercise.targets,
    metronome,
    toleranceLevel
  })

  useEffect(() => {
    practice.reset()
    metronome.stop()
    metronome.setBpm(selectedExercise.bpm)
  }, [selectedExerciseId])

  useEffect(() => {
    if (practice.isComplete && metronome.isRunning) {
      metronome.pause()
    }
  }, [metronome.isRunning, metronome.pause, practice.isComplete])

  const currentTarget = practice.currentTarget
  const latestResult = practice.latestResult
  const recentResults = practice.results.slice(-6).reverse()

  const openSettings = (): void => {
    setDraftMetronomeSoundEnabled(metronomeSound.enabled)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    if (draftMetronomeSoundEnabled !== metronomeSound.enabled) {
      void metronomeSound.setEnabled(draftMetronomeSoundEnabled)
    }
    setSettingsOpen(false)
  }

  return (
    <section className="judgement-page">
      <header className="midi-page-header judgement-header">
        <div>
          <span className="eyebrow">Practice Clock / Judgement Engine</span>
          <h2>节拍器与判定测试</h2>
          <p>验证 BPM、预备拍、目标事件、MIDI 输入与通用判定结果。</p>
        </div>
        <div className="midi-page-header__actions">
          <MetronomeVolumeControl id="judgement-header-metronome-volume" value={metronomeSound.volume} onChange={metronomeSound.setVolume} />
          <button className="practice-settings-trigger" type="button" aria-label="判定测试设置" title="判定测试设置" onClick={openSettings}>
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="judgement-grid">
        <section className="midi-panel judgement-panel">
          <div className="panel-title-row">
            <div>
              <h3>测试设置</h3>
              <p>当前阶段只用于验证通用系统，不接入正式练习模块</p>
            </div>
          </div>

          <label className="midi-select-label" htmlFor="exercise-select">
            测试练习
          </label>
          <select
            id="exercise-select"
            className="midi-select"
            value={selectedExerciseId}
            onChange={(event) => setSelectedExerciseId(event.target.value)}
          >
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.title}
              </option>
            ))}
          </select>
          <p className="judgement-help">{selectedExercise.description}</p>

          <label className="bpm-control" htmlFor="bpm-input">
            <div>
              <span>BPM</span>
              <strong>{metronome.bpm}</strong>
            </div>
            <input
              id="bpm-input"
              type="range"
              min="40"
              max="200"
              value={metronome.bpm}
              onChange={(event) => metronome.setBpm(Number(event.target.value))}
            />
          </label>

          <div className="practice-control-row">
            <button
              className="primary-button judgement-action-button"
              type="button"
              onClick={() => {
                void metronomeSound.prepare()
                if (metronome.status === 'paused') {
                  metronome.start()
                } else {
                  practice.reset()
                  metronome.restart()
                }
              }}
            >
              开始测试
            </button>
            <button className="ghost-button" type="button" onClick={metronome.pause}>
              暂停
            </button>
            <button className="ghost-button" type="button" onClick={metronome.stop}>
              停止
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                void metronomeSound.prepare()
                practice.reset()
                metronome.restart()
              }}
            >
              重新开始
            </button>
          </div>
        </section>

        <section className="midi-panel judgement-panel">
          <div className="panel-title-row">
            <div>
              <h3>当前拍点</h3>
              <p>4/4，一小节预备拍后进入正式测试</p>
            </div>
            <span className={`audio-status-badge status-${metronome.status === 'running' ? 'ready' : 'suspended'}`}>
              {metronome.status === 'running' ? '运行中' : metronome.status === 'paused' ? '已暂停' : '未开始'}
            </span>
          </div>

          <div className="metronome-display">
            <div>
              <span>{metronome.isCountingIn ? '预备拍' : '当前小节'}</span>
              <strong>{metronome.isCountingIn ? `${metronome.countInBeat} / 4` : `第 ${metronome.currentMeasure || 1} 小节`}</strong>
            </div>
            <div>
              <span>当前拍</span>
              <strong>{metronome.currentBeat}</strong>
            </div>
          </div>

          <div className="beat-dots" aria-label="当前拍点">
            {[1, 2, 3, 4].map((beat) => (
              <span
                key={beat}
                className={`${metronome.currentBeat === beat ? 'is-active' : ''} ${metronome.isCountingIn ? 'is-count-in' : ''}`}
              >
                {beat}
              </span>
            ))}
          </div>

          <div className="current-target-card">
            <span>当前目标音</span>
            <strong>{practice.isComplete ? '测试结束' : formatTargetNotes(currentTarget)}</strong>
            <small>{currentTarget?.label || (metronome.isCountingIn ? '等待预备拍结束' : '等待开始')}</small>
          </div>
        </section>

        <section className="midi-panel judgement-panel judgement-result-panel">
          <div className="panel-title-row">
            <div>
              <h3>实时判定结果</h3>
              <p>只读取 noteOn 输入，noteOff 和 CC 事件不参与本阶段判定</p>
            </div>
          </div>

          <div className={`latest-judgement ${latestResult ? `result-${latestResult.type}` : ''}`}>
            <span>最近结果</span>
            <strong>{latestResult ? latestResult.label : '暂无判定'}</strong>
            <small>{latestResult ? `${latestResult.message} / offset ${formatOffset(latestResult.timeOffsetMs)}` : '开始测试后按下 MIDI 键盘'}</small>
          </div>

          <div className="judgement-result-list">
            {recentResults.length > 0 ? (
              recentResults.map((result) => (
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

        <section className="midi-panel judgement-panel report-panel">
          <div className="panel-title-row">
            <div>
              <h3>测试结束报告</h3>
              <p>目标完成后自动汇总，也可以中途查看当前统计</p>
            </div>
            <span className="log-count-badge">{practice.results.length}/{practice.report.totalTargets}</span>
          </div>

          <div className="report-grid">
            <div><span>总目标数</span><strong>{practice.report.totalTargets}</strong></div>
            <div><span>正确数量</span><strong>{practice.report.correct}</strong></div>
            <div><span>错音数量</span><strong>{practice.report.wrongNote}</strong></div>
            <div><span>漏音数量</span><strong>{practice.report.missingNote}</strong></div>
            <div><span>多音数量</span><strong>{practice.report.extraNote}</strong></div>
            <div><span>早弹数量</span><strong>{practice.report.early}</strong></div>
            <div><span>晚弹数量</span><strong>{practice.report.late}</strong></div>
            <div><span>休止错误</span><strong>{practice.report.restError}</strong></div>
            <div><span>平均 offset</span><strong>{practice.report.averageOffsetMs}ms</strong></div>
            <div><span>正确率</span><strong>{practice.report.accuracy}%</strong></div>
          </div>
        </section>
      </div>

      <PracticeSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="判定测试设置">
        <div className="tolerance-control"><span>节拍器声音</span><div className="segmented-control">
          <button className={draftMetronomeSoundEnabled ? 'is-active' : ''} type="button" onClick={() => setDraftMetronomeSoundEnabled(true)}>开启</button>
          <button className={!draftMetronomeSoundEnabled ? 'is-active' : ''} type="button" onClick={() => setDraftMetronomeSoundEnabled(false)}>关闭</button>
        </div><small>强拍为较高频短促点击，弱拍为较低频轻点击。</small></div>
      </PracticeSettingsDrawer>
    </section>
  )
}
