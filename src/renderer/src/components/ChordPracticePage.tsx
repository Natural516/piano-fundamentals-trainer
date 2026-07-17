import { useCallback } from 'react'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { useChordPractice, CHORD_INVERSION_MODE_LABELS, CHORD_QUALITY_LABELS } from '../hooks/useChordPractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import type { ChordInversionMode, ChordQualityFilter } from '../utils/chordTypes'
import { CHORD_INPUT_WINDOW_MS } from '../utils/chordPatterns'
import { createChordRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { ChordTargetView } from './ChordTargetView'
import { FullKeyboard } from './FullKeyboard'

interface ChordPracticePageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
}

const qualityOptions: ChordQualityFilter[] = ['major', 'minor', 'both']
const inversionOptions: ChordInversionMode[] = ['root', 'root-first', 'all']

export function ChordPracticePage({
  activeNotes,
  latestMidiEvent,
  onBackHome
}: ChordPracticePageProps): JSX.Element {
  const chord = useChordPractice(latestMidiEvent)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createChordRecord({
      timing,
      report: chord.report,
      chordType: chord.qualityFilter,
      inversionMode: chord.inversionMode,
      questionCount: chord.questionCount
    }),
    [chord.inversionMode, chord.qualityFilter, chord.questionCount, chord.report]
  )
  const recorder = usePracticeSessionRecorder(chord.status === 'finished', createRecord)
  const startPractice = (): void => {
    recorder.beginSession()
    chord.start()
  }

  return (
    <section className="chord-page">
      <header className="midi-page-header chord-page-header">
        <div>
          <span className="eyebrow">Chord Practice</span>
          <h2>和弦练习</h2>
          <p>三和弦 · 原位与转位 · 柱式训练</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="chord-grid-layout">
        <section className="midi-panel chord-panel chord-settings-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习设置</h3>
              <p>当前阶段只练 C 大调自然三和弦柱式按键。</p>
            </div>
          </div>

          <div className="chord-setting-group">
            <span>题数</span>
            <div className="segmented-control">
              {chord.questionCountOptions.map((count) => (
                <button
                  key={count}
                  className={chord.questionCount === count ? 'is-active' : ''}
                  disabled={chord.isRunning}
                  type="button"
                  onClick={() => chord.setQuestionCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="chord-setting-group">
            <span>和弦类型</span>
            <div className="segmented-control">
              {qualityOptions.map((option) => (
                <button
                  key={option}
                  className={chord.qualityFilter === option ? 'is-active' : ''}
                  disabled={chord.isRunning}
                  type="button"
                  onClick={() => chord.setQualityFilter(option)}
                >
                  {CHORD_QUALITY_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="chord-setting-group">
            <span>转位</span>
            <div className="segmented-control chord-wide-segmented">
              {inversionOptions.map((option) => (
                <button
                  key={option}
                  className={chord.inversionMode === option ? 'is-active' : ''}
                  disabled={chord.isRunning}
                  type="button"
                  onClick={() => chord.setInversionMode(option)}
                >
                  {CHORD_INVERSION_MODE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="chord-setting-group">
            <span>音名提示</span>
            <div className="segmented-control">
              <button
                className={chord.showNoteNames ? 'is-active' : ''}
                type="button"
                onClick={() => chord.setShowNoteNames(true)}
              >
                显示
              </button>
              <button
                className={!chord.showNoteNames ? 'is-active' : ''}
                type="button"
                onClick={() => chord.setShowNoteNames(false)}
              >
                隐藏
              </button>
            </div>
          </div>

          <div className="chord-setting-group">
            <span>节拍器</span>
            <div className="segmented-control">
              <button
                className={chord.metronomeEnabled ? 'is-active' : ''}
                disabled={chord.isRunning}
                type="button"
                onClick={() => chord.setMetronomeEnabled(true)}
              >
                开启
              </button>
              <button
                className={!chord.metronomeEnabled ? 'is-active' : ''}
                disabled={chord.isRunning}
                type="button"
                onClick={() => chord.setMetronomeEnabled(false)}
              >
                关闭
              </button>
            </div>
            <small>节拍器仅作为辅助，不参与早晚判定。</small>
          </div>

          <div className="practice-control-row">
            {chord.isRunning ? (
              <AppButton className="ghost-button" variant="secondary" onClick={chord.stop}>
                停止练习
              </AppButton>
            ) : (
              <AppButton className="primary-button chord-action-button" onClick={startPractice}>
                开始练习
              </AppButton>
            )}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <section className="midi-panel chord-panel chord-main-panel">
          <div className="panel-title-row">
            <div>
              <h3>目标和弦</h3>
              <p>输入窗口 {CHORD_INPUT_WINDOW_MS}ms，窗口内重复音只计算一次。</p>
            </div>
            <span className={`audio-status-badge status-${chord.status === 'running' ? 'ready' : 'suspended'}`}>
              {chord.status === 'running' ? '练习中' : chord.status === 'finished' ? '已完成' : '未开始'}
            </span>
          </div>

          <ChordTargetView
            feedback={chord.feedback}
            showNoteNames={chord.showNoteNames}
            target={chord.currentTarget}
          />

          {chord.feedback && chord.feedback.type !== 'correct' && chord.isRunning ? (
            <AppButton className="ghost-button chord-next-button" variant="secondary" onClick={chord.nextQuestion}>
              下一题
            </AppButton>
          ) : null}
        </section>

        <section className="midi-panel chord-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习进度</h3>
              <p>{chord.metronomeEnabled ? '节拍器辅助已开启。' : '当前不使用节拍器判定。'}</p>
            </div>
          </div>

          <div className="chord-stat-grid">
            <div><span>已完成</span><strong>{chord.completedQuestions} / {chord.questionCount}</strong></div>
            <div><span>正确</span><strong>{chord.correctCount}</strong></div>
            <div><span>错误</span><strong>{chord.wrongCount}</strong></div>
            <div><span>当前连对</span><strong>{chord.currentStreak}</strong></div>
            <div><span>最高连对</span><strong>{chord.bestStreak}</strong></div>
          </div>

          {chord.metronomeEnabled ? (
            <>
              <div className="beat-dots chord-beat-dots" aria-label="当前拍点">
                {[1, 2, 3, 4].map((beat) => (
                  <span
                    key={beat}
                    className={`${chord.metronome.currentBeat === beat ? 'is-active' : ''} ${chord.metronome.isCountingIn ? 'is-count-in' : ''}`}
                  >
                    {beat}
                  </span>
                ))}
              </div>
              <div className="metronome-sound-header chord-sound-row">
                <div>
                  <strong>节拍器声音</strong>
                  <span>{chord.metronomeSound.enabled ? '开启' : '关闭'} / 音量 {chord.metronomeSound.volume}%</span>
                </div>
                <AppButton
                  className={`monitor-toggle ${chord.metronomeSound.enabled ? 'is-on' : ''}`}
                  variant="ghost"
                  onClick={() => {
                    void chord.metronomeSound.setEnabled(!chord.metronomeSound.enabled)
                  }}
                >
                  {chord.metronomeSound.enabled ? '开启' : '关闭'}
                </AppButton>
              </div>
            </>
          ) : null}
        </section>

        <section className="midi-panel chord-panel report-panel chord-report-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习报告</h3>
              <p>{chord.status === 'finished' ? '和弦练习完成。' : '练习中按首次表现实时统计。'}</p>
            </div>
            <span className="log-count-badge">{chord.report.correct}/{chord.report.totalQuestions}</span>
          </div>

          <div className="report-grid">
            <div><span>总题数</span><strong>{chord.report.totalQuestions}</strong></div>
            <div><span>正确数</span><strong>{chord.report.correct}</strong></div>
            <div><span>错误数</span><strong>{chord.report.wrong}</strong></div>
            <div><span>漏音次数</span><strong>{chord.report.missingNote}</strong></div>
            <div><span>多音次数</span><strong>{chord.report.extraNote}</strong></div>
            <div><span>错音次数</span><strong>{chord.report.wrongNote}</strong></div>
            <div><span>正确率</span><strong>{chord.report.accuracy}%</strong></div>
            <div><span>最高连对</span><strong>{chord.report.bestStreak}</strong></div>
            <div><span>最容易错的和弦</span><strong>{chord.report.mostMissedChord}</strong></div>
            <div><span>最容易漏的音</span><strong>{chord.report.mostMissedNote}</strong></div>
            <div><span>平均尝试次数</span><strong>{chord.report.averageAttempts}</strong></div>
          </div>
        </section>

        <section className="midi-panel chord-panel chord-keyboard-panel">
          <div className="panel-title-row">
            <div>
              <h3>虚拟钢琴键盘</h3>
              <p>目标和弦淡色高亮，正确为绿色，错误输入为红色。</p>
            </div>
          </div>
          <FullKeyboard
            activeNotes={activeNotes}
            correctNotes={chord.correctNotes}
            targetNotes={chord.targetNotes}
            wrongNotes={chord.wrongNotes}
          />
        </section>
      </div>
    </section>
  )
}
