import type { ActiveMidiNote, MidiEventRecord } from '../types'
import type {
  SightReadingClefMode,
  SightReadingQuestionCount,
  SightReadingRange,
  SightReadingResult
} from '../hooks/useSightReadingPractice'
import { CLEF_LABELS, RANGE_LABELS, useSightReadingPractice } from '../hooks/useSightReadingPractice'
import { getRangeDescription } from '../utils/sightReadingNotes'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'
import { SightReadingStaff } from './SightReadingStaff'

interface SightReadingPageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
}

const clefOptions: SightReadingClefMode[] = ['treble', 'bass', 'mixed']
const rangeOptions: SightReadingRange[] = ['basic', 'common', 'extended']
const questionCountOptions: SightReadingQuestionCount[] = [10, 20, 50]

function formatResult(result: SightReadingResult): string {
  if (result === 'correct') {
    return '正确'
  }

  if (result === 'wrong_note') {
    return '错误'
  }

  return '等待输入'
}

function getUniqueNoteNames(notes: Array<{ noteName: string }>): string {
  return Array.from(new Set(notes.map((note) => note.noteName))).join(' / ')
}

function ClefReportCard({
  accuracy,
  correct,
  title,
  total,
  wrong
}: {
  accuracy: number
  correct: number
  title: string
  total: number
  wrong: number
}): JSX.Element {
  return (
    <div>
      <span>{title}</span>
      <strong>{total} 题</strong>
      <small>正确 {correct} / 错误 {wrong} / 正确率 {accuracy}%</small>
    </div>
  )
}

export function SightReadingPage({
  activeNotes,
  latestMidiEvent,
  onBackHome
}: SightReadingPageProps): JSX.Element {
  const practice = useSightReadingPractice(latestMidiEvent)
  const isRunning = practice.status === 'running'
  const targetNoteName = practice.currentNote?.noteName ?? '-'
  const currentClefLabel = practice.currentNote ? CLEF_LABELS[practice.currentNote.clef] : CLEF_LABELS[practice.clefMode]
  const shouldRevealTarget = practice.showNoteName || practice.result === 'wrong_note' || practice.status === 'finished'
  const targetNotes = practice.currentNote ? [practice.currentNote.midiNumber] : []
  const correctNotes = practice.result === 'correct' && practice.currentNote ? [practice.currentNote.midiNumber] : []
  const wrongNotes = practice.result === 'wrong_note' && practice.currentInputMidiNumber ? [practice.currentInputMidiNumber] : []

  if (practice.status === 'finished' && practice.report) {
    return (
      <section className="sight-page">
        <header className="midi-page-header sight-page-header">
          <div>
            <span className="eyebrow">Sight Reading</span>
            <h2>识谱练习完成</h2>
            <p>C 大调 · {CLEF_LABELS[practice.report.clefMode]} · {RANGE_LABELS[practice.report.range]}</p>
          </div>
          <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
            返回首页
          </AppButton>
        </header>

        <section className="midi-panel sight-report-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习报告</h3>
              <p>本阶段统计单音识谱的首次正确率。</p>
            </div>
          </div>

          <div className="sight-report-grid">
            <div><span>总题数</span><strong>{practice.report.totalQuestions}</strong></div>
            <div><span>正确</span><strong>{practice.report.correct}</strong></div>
            <div><span>错误</span><strong>{practice.report.wrong}</strong></div>
            <div><span>正确率</span><strong>{practice.report.accuracy}%</strong></div>
            <div><span>最高连对</span><strong>{practice.report.bestStreak}</strong></div>
            <div><span>最容易错的音</span><strong>{practice.report.mostMissedNote}</strong></div>
          </div>

          <div className="sight-clef-report-grid">
            <ClefReportCard title="高音谱号" {...practice.report.treble} />
            <ClefReportCard title="低音谱号" {...practice.report.bass} />
          </div>

          <div className="sight-error-table">
            <h4>每个音的错误次数</h4>
            <div>
              {practice.report.errorCounts.map((entry) => (
                <span key={entry.noteName}>
                  {entry.noteName}
                  <strong>{entry.count}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="sight-action-row">
            <AppButton className="primary-button" onClick={practice.start}>
              再练一次
            </AppButton>
            <AppButton className="ghost-button" variant="secondary" onClick={onBackHome}>
              返回首页
            </AppButton>
          </div>
        </section>
      </section>
    )
  }

  return (
    <section className="sight-page">
      <header className="midi-page-header sight-page-header">
        <div>
          <span className="eyebrow">Sight Reading</span>
          <h2>识谱练习</h2>
          <p>C 大调 · 单音识别 · {CLEF_LABELS[practice.clefMode]} · {RANGE_LABELS[practice.range]}</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
      </header>

      <div className="sight-layout">
        <section className="midi-panel sight-main-panel">
          <div className="panel-title-row">
            <div>
              <h3>当前题目</h3>
              <p>请根据五线谱上的音符，在 MIDI 键盘上按下对应琴键。</p>
            </div>
            <span className={`sight-result-badge result-${practice.result ?? 'waiting'}`}>
              {formatResult(practice.result)}
            </span>
          </div>

          <SightReadingStaff note={practice.currentNote} showNoteName={practice.showNoteName} />
        </section>

        <aside className="midi-panel sight-side-panel">
          <div className="panel-title-row">
            <div>
              <h3>练习设置</h3>
              <p>{isRunning ? '练习进行中，设置将在停止后可修改。' : '设置会在下一次开始练习时生效。'}</p>
            </div>
          </div>

          <div className="sight-setting-group">
            <span>谱号</span>
            <div className="sight-segmented">
              {clefOptions.map((option) => (
                <button
                  key={option}
                  className={practice.clefMode === option ? 'is-active' : ''}
                  disabled={isRunning}
                  type="button"
                  onClick={() => practice.setClefMode(option)}
                >
                  {CLEF_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="sight-setting-group">
            <span>音域</span>
            <div className="sight-segmented">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  className={practice.range === option ? 'is-active' : ''}
                  disabled={isRunning}
                  type="button"
                  onClick={() => practice.setRange(option)}
                >
                  {RANGE_LABELS[option]}
                </button>
              ))}
            </div>
            <small>{getRangeDescription(practice.clefMode, practice.range)}</small>
          </div>

          <div className="sight-setting-group">
            <span>题数</span>
            <div className="sight-segmented">
              {questionCountOptions.map((count) => (
                <button
                  key={count}
                  className={practice.questionCount === count ? 'is-active' : ''}
                  disabled={isRunning}
                  type="button"
                  onClick={() => practice.setQuestionCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="sight-setting-group">
            <span>音名提示</span>
            <div className="sight-segmented">
              <button
                className={practice.showNoteName ? 'is-active' : ''}
                type="button"
                onClick={() => practice.setShowNoteName(true)}
              >
                显示
              </button>
              <button
                className={!practice.showNoteName ? 'is-active' : ''}
                type="button"
                onClick={() => practice.setShowNoteName(false)}
              >
                隐藏
              </button>
            </div>
          </div>

          <div className="sight-action-row">
            {isRunning ? (
              <AppButton className="ghost-button" variant="secondary" onClick={practice.reset}>
                停止练习
              </AppButton>
            ) : (
              <AppButton className="primary-button" onClick={practice.start}>
                开始练习
              </AppButton>
            )}
          </div>

          <div className="sight-feedback-card">
            <span>当前谱号</span>
            <strong>{currentClefLabel}</strong>
          </div>

          <div className="sight-feedback-card">
            <span>当前音域</span>
            <strong>{RANGE_LABELS[practice.range]}</strong>
          </div>

          <div className="sight-feedback-card">
            <span>目标音</span>
            <strong>{practice.currentNote ? (shouldRevealTarget ? targetNoteName : '隐藏') : '-'}</strong>
          </div>

          <div className="sight-feedback-card">
            <span>当前输入</span>
            <strong>{practice.currentInput || '-'}</strong>
          </div>

          <div className={`sight-feedback-card result-${practice.result ?? 'waiting'}`}>
            <span>判定结果</span>
            <strong>{formatResult(practice.result)}</strong>
            {practice.result === 'wrong_note' && practice.currentNote ? (
              <small>
                目标音：{targetNoteName} / 你按下：{practice.currentInput || '-'}。请重新尝试，按对后进入下一题。
              </small>
            ) : null}
          </div>

          {practice.result === 'wrong_note' ? (
            <AppButton className="ghost-button sight-next-button" variant="secondary" onClick={practice.nextQuestion}>
              下一题
            </AppButton>
          ) : null}

          <div className="sight-stat-grid">
            <div><span>已完成</span><strong>{practice.completedQuestions} / {practice.questionCount}</strong></div>
            <div><span>正确</span><strong>{practice.correctCount}</strong></div>
            <div><span>错误</span><strong>{practice.wrongCount}</strong></div>
            <div><span>当前连对</span><strong>{practice.currentStreak}</strong></div>
            <div><span>正确率</span><strong>{practice.accuracy}%</strong></div>
          </div>
        </aside>
      </div>

      <section className="midi-panel sight-keyboard-panel">
        <div className="panel-title-row">
          <div>
            <h3>虚拟钢琴键盘</h3>
            <p>目标音为淡色边框，实际按下仍按 MIDI 输入高亮。</p>
          </div>
        </div>
        <FullKeyboard
          activeNotes={activeNotes}
          correctNotes={correctNotes}
          targetNotes={targetNotes}
          wrongNotes={wrongNotes}
        />
      </section>

      <section className="midi-panel sight-range-panel">
        <h3>当前题库</h3>
        <p>{getUniqueNoteNames(practice.availableNotes)}</p>
      </section>
    </section>
  )
}
