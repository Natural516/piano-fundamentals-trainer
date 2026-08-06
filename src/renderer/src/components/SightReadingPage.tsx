import { useCallback, useEffect, useState } from 'react'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import type {
  SightReadingQuestionCount,
  SightReadingRange,
  SightReadingStaffMode
} from '../hooks/useSightReadingPractice'
import {
  RANGE_LABELS,
  STAFF_MODE_LABELS,
  useSightReadingPractice
} from '../hooks/useSightReadingPractice'
import { getRangeDescription } from '../utils/sightReadingNotes'
import { createSightReadingRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'
import { SettingsIcon } from './SettingsIcon'
import { SightReadingStaff } from './SightReadingStaff'

interface SightReadingPageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
  onPracticeRunningChange: (running: boolean) => void
}

type TimeLimitOption = 3 | 5 | 10 | 'custom'

const staffModeOptions: SightReadingStaffMode[] = ['treble', 'bass', 'grand']
const rangeOptions: SightReadingRange[] = ['common', 'extended']
const questionCountOptions: SightReadingQuestionCount[] = [10, 20, 50, 100]
const fixedTimeLimitOptions: Array<3 | 5 | 10> = [3, 5, 10]

function getTimeLimitOption(seconds: number): TimeLimitOption {
  return seconds === 3 || seconds === 5 || seconds === 10 ? seconds : 'custom'
}

function formatReactionTime(value: number | null): string {
  return value === null ? '暂无' : `${value} ms`
}

function ClefReportCard({
  accuracy,
  correct,
  timeout,
  title,
  total,
  wrong
}: {
  accuracy: number
  correct: number
  timeout: number
  title: string
  total: number
  wrong: number
}): JSX.Element {
  return (
    <div>
      <span>{title}</span>
      <strong>{total} 题</strong>
      <small>正确 {correct} / 错误 {wrong} / 超时 {timeout} / 正确率 {accuracy}%</small>
    </div>
  )
}

export function SightReadingPage({
  activeNotes,
  exitPromptOpen,
  latestMidiEvent,
  onBackHome,
  onPracticeRunningChange
}: SightReadingPageProps): JSX.Element {
  const practice = useSightReadingPractice(latestMidiEvent)
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('sight-reading')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftStaffMode, setDraftStaffMode] = useState<SightReadingStaffMode>(practice.staffMode)
  const [draftRange, setDraftRange] = useState<SightReadingRange>(practice.range)
  const [draftQuestionCount, setDraftQuestionCount] = useState<SightReadingQuestionCount>(practice.questionCount)
  const [draftShowNoteName, setDraftShowNoteName] = useState(practice.showNoteName)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const [draftTimeLimitOption, setDraftTimeLimitOption] = useState<TimeLimitOption>(
    getTimeLimitOption(practice.answerTimeLimitSeconds)
  )
  const [draftCustomTimeLimit, setDraftCustomTimeLimit] = useState(String(practice.answerTimeLimitSeconds))
  const [timeLimitError, setTimeLimitError] = useState('')
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => practice.report
      ? createSightReadingRecord({ timing, report: practice.report, showNoteName: practice.showNoteName })
      : null,
    [practice.report, practice.showNoteName]
  )
  const recorder = usePracticeSessionRecorder(practice.status === 'finished', createRecord)
  const isRunning = practice.status === 'running'

  useEffect(() => {
    onPracticeRunningChange(isRunning)
  }, [isRunning, onPracticeRunningChange])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!isRunning) return
    if (exitPromptOpen) practice.pause()
    else practice.resume()
  }, [exitPromptOpen, isRunning, practice.pause, practice.resume])

  const startPractice = (): void => {
    setSettingsOpen(false)
    recorder.beginSession()
    practice.start()
  }

  const openSettings = (): void => {
    const option = getTimeLimitOption(practice.answerTimeLimitSeconds)
    setDraftStaffMode(practice.staffMode)
    setDraftRange(practice.range)
    setDraftQuestionCount(practice.questionCount)
    setDraftShowNoteName(practice.showNoteName)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setDraftTimeLimitOption(option)
    setDraftCustomTimeLimit(String(practice.answerTimeLimitSeconds))
    setTimeLimitError('')
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    let answerTimeLimitSeconds: number

    if (draftTimeLimitOption === 'custom') {
      const trimmed = draftCustomTimeLimit.trim()
      if (!/^\d+$/.test(trimmed)) {
        setTimeLimitError('请输入 1～60 之间的整数秒数。')
        return
      }

      answerTimeLimitSeconds = Number(trimmed)
      if (!Number.isInteger(answerTimeLimitSeconds) || answerTimeLimitSeconds < 1 || answerTimeLimitSeconds > 60) {
        setTimeLimitError('自定义答题时限必须是 1～60 之间的整数。')
        return
      }
    } else {
      answerTimeLimitSeconds = draftTimeLimitOption
    }

    practice.setStaffMode(draftStaffMode)
    practice.setRange(draftRange)
    practice.setQuestionCount(draftQuestionCount)
    practice.setAnswerTimeLimitSeconds(answerTimeLimitSeconds)
    practice.setShowNoteName(draftShowNoteName)
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setTimeLimitError('')
    setSettingsOpen(false)
  }

  const targetNoteName = practice.currentNote?.noteName ?? '-'
  const targetNotes = practice.currentNote ? [practice.currentNote.midiNumber] : []
  const correctNotes = practice.result === 'correct' && practice.currentNote ? [practice.currentNote.midiNumber] : []
  const wrongNotes = practice.result === 'wrong_note' && practice.currentInputMidiNumber !== null
    ? [practice.currentInputMidiNumber]
    : []
  const settingsSummary = `C 大调 · ${STAFF_MODE_LABELS[practice.staffMode]} · ${RANGE_LABELS[practice.range]}音域 · ${practice.questionCount}题 · 每题 ${practice.answerTimeLimitSeconds} 秒 · ${practice.showNoteName ? '显示音名' : '隐藏音名'}`
  const feedbackLabel = practice.result === 'correct'
    ? '正确'
    : practice.result === 'wrong_note'
      ? '错误'
      : practice.result === 'timeout'
        ? '超时'
        : ''

  return (
    <section className="sight-page practice-workspace-page">
      <header className="midi-page-header sight-page-header practice-page-header">
        <div>
          <span className="eyebrow">Sight Reading</span>
          <h2>识谱练习</h2>
          <p className="practice-settings-summary">{settingsSummary}</p>
        </div>
        <div className="practice-page-header__actions">
          <button
            className="practice-settings-trigger"
            type="button"
            aria-label="练习设置"
            title="练习设置"
            onClick={openSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="practice-single-column">
        <section className={`midi-panel sight-main-panel practice-primary-panel ${practice.result ? `has-${practice.result}` : ''}`}>
          <div className="panel-title-row">
            <div>
              <h3>当前题目</h3>
              <p>根据谱面，在答题时限内按下第一个判断音。</p>
            </div>
            {feedbackLabel ? (
              <span className={`sight-inline-feedback result-${practice.result}`}>{feedbackLabel}</span>
            ) : null}
          </div>

          <SightReadingStaff
            feedback={practice.result}
            note={practice.currentNote}
            showNoteName={practice.showNoteName}
            staffMode={practice.staffMode}
          />

          {practice.result === 'wrong_note' && practice.currentNote ? (
            <p className="practice-feedback-message result-wrong_note">
              目标音：{targetNoteName} / 你按下：{practice.currentInput || '-'}
            </p>
          ) : null}
          {practice.result === 'timeout' && practice.currentNote ? (
            <p className="practice-feedback-message result-timeout">本题超时，目标音：{targetNoteName}</p>
          ) : null}

          <div className="practice-primary-actions">
            {isRunning ? (
              <AppButton variant="secondary" onClick={practice.reset}>停止练习</AppButton>
            ) : (
              <AppButton onClick={startPractice}>开始练习</AppButton>
            )}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <PracticeStatBar
          items={[
            { label: '已完成', value: `${practice.completedQuestions} / ${practice.questionCount}` },
            { label: '正确', value: practice.correctCount },
            { label: '错误', value: practice.wrongCount },
            { label: '超时', value: practice.timeoutCount },
            { label: '当前连对', value: practice.currentStreak },
            { label: '当前正确率', value: practice.completedQuestions > 0 ? `${practice.accuracy}%` : '—' }
          ]}
        />

        {showVirtualKeyboard ? (
          <section className="midi-panel sight-keyboard-panel practice-keyboard-panel">
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
        ) : null}
      </div>

      {practice.isPaused ? (
        <div className="sight-pause-overlay" role="status" aria-live="polite">
          <div>
            <strong>练习已暂停</strong>
            <span>返回应用后将从当前题的剩余时间继续。</span>
          </div>
        </div>
      ) : null}

      <PracticeSettingsDrawer
        isLocked={isRunning}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        title="识谱练习设置"
      >
        <div className="sight-setting-group">
          <span>谱表模式</span>
          <div className="sight-segmented">
            {staffModeOptions.map((option) => (
              <button
                key={option}
                className={draftStaffMode === option ? 'is-active' : ''}
                disabled={isRunning}
                type="button"
                onClick={() => setDraftStaffMode(option)}
              >
                {STAFF_MODE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="sight-setting-group">
          <span>音域</span>
          <div className="sight-segmented sight-segmented--two">
            {rangeOptions.map((option) => (
              <button
                key={option}
                className={draftRange === option ? 'is-active' : ''}
                disabled={isRunning}
                type="button"
                onClick={() => setDraftRange(option)}
              >
                {RANGE_LABELS[option]}
              </button>
            ))}
          </div>
          <small>{getRangeDescription(draftStaffMode, draftRange)}</small>
        </div>

        <div className="sight-setting-group">
          <span>题数</span>
          <div className="sight-segmented sight-segmented--four">
            {questionCountOptions.map((count) => (
              <button
                key={count}
                className={draftQuestionCount === count ? 'is-active' : ''}
                disabled={isRunning}
                type="button"
                onClick={() => setDraftQuestionCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="sight-setting-group">
          <span>答题时限</span>
          <div className="sight-segmented sight-segmented--four">
            {fixedTimeLimitOptions.map((seconds) => (
              <button
                key={seconds}
                className={draftTimeLimitOption === seconds ? 'is-active' : ''}
                disabled={isRunning}
                type="button"
                onClick={() => {
                  setDraftTimeLimitOption(seconds)
                  setTimeLimitError('')
                }}
              >
                {seconds} 秒
              </button>
            ))}
            <button
              className={draftTimeLimitOption === 'custom' ? 'is-active' : ''}
              disabled={isRunning}
              type="button"
              onClick={() => {
                setDraftTimeLimitOption('custom')
                setTimeLimitError('')
              }}
            >
              自定义
            </button>
          </div>
          {draftTimeLimitOption === 'custom' ? (
            <label className="sight-custom-time-limit">
              <input
                aria-invalid={Boolean(timeLimitError)}
                disabled={isRunning}
                inputMode="numeric"
                maxLength={2}
                type="text"
                value={draftCustomTimeLimit}
                onChange={(event) => {
                  setDraftCustomTimeLimit(event.target.value)
                  setTimeLimitError('')
                }}
              />
              <span>秒（1～60 的整数）</span>
            </label>
          ) : null}
          {timeLimitError ? <small className="sight-setting-error">{timeLimitError}</small> : null}
        </div>

        <div className="sight-setting-group">
          <span>音名提示</span>
          <div className="sight-segmented sight-segmented--two">
            <button
              className={draftShowNoteName ? 'is-active' : ''}
              disabled={isRunning}
              type="button"
              onClick={() => setDraftShowNoteName(true)}
            >
              显示
            </button>
            <button
              className={!draftShowNoteName ? 'is-active' : ''}
              disabled={isRunning}
              type="button"
              onClick={() => setDraftShowNoteName(false)}
            >
              隐藏
            </button>
          </div>
        </div>
        <div className="sight-setting-group">
          <span>显示虚拟键盘</span>
          <div className="sight-segmented sight-segmented--two">
            <button
              className={draftShowVirtualKeyboard ? 'is-active' : ''}
              disabled={isRunning}
              type="button"
              onClick={() => setDraftShowVirtualKeyboard(true)}
            >
              显示
            </button>
            <button
              className={!draftShowVirtualKeyboard ? 'is-active' : ''}
              disabled={isRunning}
              type="button"
              onClick={() => setDraftShowVirtualKeyboard(false)}
            >
              隐藏
            </button>
          </div>
        </div>
      </PracticeSettingsDrawer>

      {practice.status === 'finished' && practice.report ? (
        <PracticeReportModal title="识谱练习完成">
          <p className="practice-report-summary">
            C 大调 · {STAFF_MODE_LABELS[practice.report.staffMode]} · {RANGE_LABELS[practice.report.range]}音域
          </p>
          <div className="sight-report-grid">
            <div><span>练习名称</span><strong>识谱练习</strong></div>
            <div><span>谱表模式</span><strong>{STAFF_MODE_LABELS[practice.report.staffMode]}</strong></div>
            <div><span>音域</span><strong>{RANGE_LABELS[practice.report.range]}</strong></div>
            <div><span>题数</span><strong>{practice.report.totalQuestions}</strong></div>
            <div><span>每题时限</span><strong>{practice.report.answerTimeLimitSeconds} 秒</strong></div>
            <div><span>完成题数</span><strong>{practice.report.completedQuestions}</strong></div>
            <div><span>正确</span><strong>{practice.report.correct}</strong></div>
            <div><span>错误</span><strong>{practice.report.wrong}</strong></div>
            <div><span>超时</span><strong>{practice.report.timeout}</strong></div>
            <div><span>正确率</span><strong>{practice.report.accuracy}%</strong></div>
            <div><span>平均反应</span><strong>{formatReactionTime(practice.report.averageReactionMs)}</strong></div>
            <div><span>最高连对</span><strong>{practice.report.bestStreak}</strong></div>
            <div><span>最容易错的音</span><strong>{practice.report.mostWrongNote}</strong></div>
            <div><span>最容易超时的音</span><strong>{practice.report.mostTimedOutNote}</strong></div>
            <div><span>最快反应</span><strong>{formatReactionTime(practice.report.fastestReactionMs)}</strong></div>
            <div><span>最慢反应</span><strong>{formatReactionTime(practice.report.slowestReactionMs)}</strong></div>
          </div>
          <div className="sight-clef-report-grid">
            <ClefReportCard title="高音谱表" {...practice.report.treble} />
            <ClefReportCard title="低音谱表" {...practice.report.bass} />
          </div>
          <div className="sight-error-table">
            <h4>每个音的错误与超时次数</h4>
            <div>
              {practice.report.wrongNoteCounts.map((entry) => (
                <span key={entry.noteName}>
                  {entry.noteName}
                  <strong>
                    错 {entry.count} / 超时 {practice.report?.timeoutNoteCounts.find((item) => item.noteName === entry.noteName)?.count ?? 0}
                  </strong>
                </span>
              ))}
            </div>
          </div>
          <div className="practice-report-actions">
            <AppButton onClick={startPractice}>再练一次</AppButton>
            <AppButton variant="secondary" onClick={onBackHome}>返回首页</AppButton>
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
