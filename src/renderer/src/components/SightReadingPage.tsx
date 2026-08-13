import { useCallback, useEffect, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import type {
  MajorKeyId,
  SightReadingNotePoolMode,
  SightReadingQuestionCount,
  SightReadingStaffMode
} from '../hooks/useSightReadingPractice'
import {
  STAFF_MODE_LABELS,
  useSightReadingPractice
} from '../hooks/useSightReadingPractice'
import { getRangeDescription } from '../utils/sightReadingNotes'
import { MAJOR_KEY_DISPLAY_SIGNATURES, getMajorKeySignature } from '../utils/musicKeySignatures'
import { SIGHT_READING_NOTE_POOL_MODE_LABELS } from '../utils/sightReadingSettings'
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
import { SightReadingTimeBar } from './SightReadingTimeBar'

interface SightReadingPageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

const staffModeOptions: SightReadingStaffMode[] = ['treble', 'bass', 'grand']
const questionCountOptions: SightReadingQuestionCount[] = [10, 20, 50, 100]
const noteCountLabels: Record<1 | 2 | 3, string> = { 1: '单音', 2: '双音', 3: '三音' }
const notePoolOptions: Array<{
  description: string
  id: SightReadingNotePoolMode
  suffix: string
}> = [
  {
    id: 'diatonic',
    suffix: '基础',
    description: '只出现当前大调七个音级，适合熟悉调号和调内音。'
  },
  {
    id: 'chromatic',
    suffix: '进阶',
    description: '题目可出现调外音，并按乐理显示升号、降号或还原号。'
  }
]

function formatReactionTime(value: number | null): string {
  return value === null ? '暂无' : `${value} ms`
}

function SightNoteErrorDetails({
  wrongNoteCounts,
  timeoutNoteCounts
}: {
  wrongNoteCounts: Array<{ noteName: string; count: number }>
  timeoutNoteCounts: Array<{ noteName: string; count: number }>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const timeoutByNote = new Map(timeoutNoteCounts.map((entry) => [entry.noteName, entry.count]))
  const rows = wrongNoteCounts.map((entry) => ({
    noteName: entry.noteName,
    wrong: entry.count,
    timeout: timeoutByNote.get(entry.noteName) ?? 0
  }))
  const problems = rows.filter((row) => row.wrong > 0 || row.timeout > 0)
  const visibleRows = showAll ? rows : problems

  return (
    <div className="sight-error-table">
      <div className="sight-error-table__header">
        <h4>每个音的错误与超时次数</h4>
        <button
          className="sight-report-toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起详情' : '查看详情 >'}
        </button>
      </div>
      {open ? (
        <>
          {problems.length === 0 ? (
            <p className="sight-error-table__empty">本次没有错误或超时</p>
          ) : null}
          {rows.length > 0 ? (
            <div className="sight-error-table__actions">
              <button
                className="sight-report-toggle"
                type="button"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? '只显示问题音' : '显示全部音符'}
              </button>
            </div>
          ) : null}
          {visibleRows.length > 0 ? (
            <div className="sight-error-table__grid">
              {visibleRows.map((row) => (
                <span key={row.noteName}>
                  {row.noteName}
                  <strong>错 {row.wrong} / 超时 {row.timeout}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function SightReadingPage({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: SightReadingPageProps): JSX.Element {
  const practice = useSightReadingPractice()
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('sight-reading')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftStaffMode, setDraftStaffMode] = useState<SightReadingStaffMode>(practice.staffMode)
  const [draftKeySignature, setDraftKeySignature] = useState<MajorKeyId>(practice.keySignature)
  const [draftNotePoolMode, setDraftNotePoolMode] = useState<SightReadingNotePoolMode>(practice.notePoolMode)
  const [draftQuestionCount, setDraftQuestionCount] = useState<SightReadingQuestionCount>(practice.questionCount)
  const [draftShowNoteName, setDraftShowNoteName] = useState(practice.showNoteName)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
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
    setDraftStaffMode(practice.staffMode)
    setDraftKeySignature(practice.keySignature)
    setDraftNotePoolMode(practice.notePoolMode)
    setDraftQuestionCount(practice.questionCount)
    setDraftShowNoteName(practice.showNoteName)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    practice.setStaffMode(draftStaffMode)
    practice.setKeySignature(draftKeySignature)
    practice.setNotePoolMode(draftNotePoolMode)
    practice.setQuestionCount(draftQuestionCount)
    practice.setShowNoteName(draftShowNoteName)
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  const targetNoteName = practice.currentNote?.noteName ?? '-'
  const targetNotes = practice.currentNote ? [practice.currentNote.midiNumber] : []
  const correctNotes = practice.result === 'correct' && practice.currentNote ? [practice.currentNote.midiNumber] : []
  const wrongNotes = practice.result === 'wrong_note' && practice.currentInputMidiNumber !== null
    ? [practice.currentInputMidiNumber]
    : []
  const settingsSummary = `${getMajorKeySignature(practice.keySignature).displayName} · ${SIGHT_READING_NOTE_POOL_MODE_LABELS[practice.notePoolMode]} · ${STAFF_MODE_LABELS[practice.staffMode]} · ${noteCountLabels[practice.noteCount]} · ${practice.questionCount}题 · 每题固定 ${practice.answerTimeLimitSeconds} 秒 · ${practice.showNoteName ? '显示音名' : '隐藏音名'}`
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

          <SightReadingTimeBar
            getRemainingTimeMs={practice.getRemainingTimeMs}
            isFeedback={practice.result !== null}
            isPaused={practice.isPaused}
            isRunning={isRunning}
          />

          <SightReadingStaff
            feedback={practice.result}
            keySignature={practice.keySignature}
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
          <span>固定音域</span>
          <small>{getRangeDescription(draftStaffMode)}</small>
        </div>

        <label className="midi-field" htmlFor="sight-reading-key-signature">
          <span>调性</span>
          <select
            id="sight-reading-key-signature"
            className="midi-select"
            disabled={isRunning}
            value={draftKeySignature}
            onChange={(event) => setDraftKeySignature(event.target.value as MajorKeyId)}
          >
            {MAJOR_KEY_DISPLAY_SIGNATURES.map((key) => (
              <option key={key.id} value={key.id}>{key.displayName}</option>
            ))}
          </select>
        </label>

        <div className="sight-setting-group">
          <span>音符内容</span>
          <div className="sight-segmented sight-segmented--two sight-note-pool-options">
            {notePoolOptions.map((option) => (
              <button
                key={option.id}
                className={draftNotePoolMode === option.id ? 'is-active' : ''}
                disabled={isRunning}
                type="button"
                onClick={() => setDraftNotePoolMode(option.id)}
              >
                <strong>{SIGHT_READING_NOTE_POOL_MODE_LABELS[option.id]}（{option.suffix}）</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
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
        <PracticeReportModal title="识谱练习完成" onBack={practice.reset} onRepeat={startPractice}>
          <div className="sight-report-grid">
            <div><span>题数</span><strong>{practice.report.totalQuestions}</strong></div>
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
          <SightNoteErrorDetails
            wrongNoteCounts={practice.report.wrongNoteCounts}
            timeoutNoteCounts={practice.report.timeoutNoteCounts}
          />
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
