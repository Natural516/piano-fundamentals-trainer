import { useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useChordV2Practice } from '../hooks/useChordV2Practice'
import { CHORD_V2_DIFFICULTY_LABELS, type ChordV2Difficulty, type ChordV2InversionMode, type ChordV2JudgeMode, type ChordV2Texture } from '../chordV2/chordV2Types'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'

interface ChordV2PageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

const judgeModeOptions: Array<{ id: ChordV2JudgeMode; label: string }> = [
  { id: 'identity', label: '和弦身份' },
  { id: 'inversion', label: '转位' },
  { id: 'exact', label: '指定 Voicing' }
]
const inversionModeOptions: Array<{ id: ChordV2InversionMode; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'root', label: '只练原位' },
  { id: 'inversions', label: '只练转位' }
]
const textureOptions: Array<{ id: ChordV2Texture; label: string }> = [
  { id: 'block', label: '柱式' },
  { id: 'arpeggio', label: '分解' },
  { id: 'composite', label: '综合' }
]

export function ChordV2Page({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: ChordV2PageProps): JSX.Element {
  const chord = useChordV2Practice()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftJudgeMode, setDraftJudgeMode] = useState<ChordV2JudgeMode>(chord.judgeMode)
  const [draftInversionMode, setDraftInversionMode] = useState<ChordV2InversionMode>(chord.inversionMode)
  const [draftTexture, setDraftTexture] = useState<ChordV2Texture>(chord.texture)
  const [draftDifficulty, setDraftDifficulty] = useState<ChordV2Difficulty>(chord.difficulty)
  const [draftQuestionCount, setDraftQuestionCount] = useState(chord.questionCount)
  const pausedForExitRef = useRef(false)

  useEffect(() => {
    onPracticeRunningChange(chord.isRunning)
  }, [chord.isRunning, onPracticeRunningChange])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!chord.isRunning) {
      pausedForExitRef.current = false
      return
    }
    if (exitPromptOpen) {
      pausedForExitRef.current = true
      chord.stop()
    } else if (pausedForExitRef.current) {
      pausedForExitRef.current = false
      chord.start()
    }
  }, [chord.isRunning, chord.start, chord.stop, exitPromptOpen])

  const openSettings = (): void => {
    setDraftJudgeMode(chord.judgeMode)
    setDraftInversionMode(chord.inversionMode)
    setDraftTexture(chord.texture)
    setDraftDifficulty(chord.difficulty)
    setDraftQuestionCount(chord.questionCount)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    chord.setJudgeMode(draftJudgeMode)
    chord.setInversionMode(draftInversionMode)
    chord.setTexture(draftTexture)
    chord.setDifficulty(draftDifficulty)
    chord.setQuestionCount(draftQuestionCount)
    setSettingsOpen(false)
  }

  const question = chord.currentQuestion
  const feedbackType = chord.feedback?.type
  const settingsSummary = `${judgeModeOptions.find((option) => option.id === chord.judgeMode)?.label} · ${textureOptions.find((option) => option.id === chord.texture)?.label} · ${CHORD_V2_DIFFICULTY_LABELS[chord.difficulty]}`

  return (
    <section className="chord-v2-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="Chord Practice V2"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="和弦练习 V2"
      />

      <div className="practice-single-column">
        <section className={`midi-panel chord-v2-panel practice-primary-panel ${chord.feedback ? `has-${feedbackType}` : ''}`}>
          <div className="panel-title-row">
            <div>
              <h3>当前目标</h3>
              <p>按当前判定模式弹出目标 Voicing；柱式 150ms 收齐，分解按顺序判定。</p>
            </div>
            <span className={`audio-status-badge status-${chord.isRunning ? 'ready' : 'suspended'}`}>
              {chord.isRunning ? '练习中' : chord.status === 'finished' ? '已结束' : '未开始'}
            </span>
          </div>

          {question ? (
            <>
              <div className="chord-v2-target">
                <strong>{question.symbol}</strong>
                <span>{question.identity.quality} · {question.judgeMode === 'inversion' ? '转位判定' : question.judgeMode === 'exact' ? '精确 Voicing' : '和弦身份'}</span>
              </div>
              <MiniKeyboard
                activeNotes={activeNotes}
                targetNotes={question.voicing.exactNotes}
                correctNotes={feedbackType === 'correct' ? question.voicing.exactNotes : []}
                wrongNotes={feedbackType && feedbackType !== 'correct' ? chord.inputNotes : []}
              />
              {chord.feedback ? (
                <p className={`practice-feedback-message result-${feedbackType}`}>{chord.feedback.message}</p>
              ) : null}
            </>
          ) : (
            <div className="chord-v2-empty">
              <strong>{chord.status === 'finished' ? '练习完成' : '准备开始'}</strong>
              <span>选择判定模式与难度后开始。</span>
            </div>
          )}

          <div className="practice-primary-actions">
            {!chord.isRunning ? <AppButton onClick={chord.start}>{chord.status === 'finished' ? '再练一次' : '开始练习'}</AppButton> : null}
            {chord.isRunning ? <AppButton variant="secondary" onClick={chord.stop}>停止</AppButton> : null}
          </div>
        </section>

        <PracticeStatBar items={[
          { label: '已完成', value: `${chord.completedQuestions} / ${chord.questionCount}` },
          { label: '正确', value: chord.report.correct },
          { label: '错误', value: chord.report.wrong },
          { label: '漏音', value: chord.report.missing },
          { label: '多音', value: chord.report.extra },
          { label: '转位错误', value: chord.report.wrongBass },
          { label: '正确率', value: chord.completedQuestions > 0 ? `${chord.report.accuracy}%` : '—' }
        ]} />
      </div>

      <PracticeSettingsDrawer
        isLocked={chord.isRunning}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        title="和弦练习设置"
      >
        <div className="tolerance-control"><span>判定模式</span><div className="segmented-control">
          {judgeModeOptions.map((option) => (
            <button key={option.id} className={draftJudgeMode === option.id ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftJudgeMode(option.id)}>
              {option.label}
            </button>
          ))}
        </div></div>
        <div className="tolerance-control"><span>转位</span><div className="segmented-control">
          {inversionModeOptions.map((option) => (
            <button key={option.id} className={draftInversionMode === option.id ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftInversionMode(option.id)}>
              {option.label}
            </button>
          ))}
        </div></div>
        <div className="tolerance-control"><span>奏法</span><div className="segmented-control">
          {textureOptions.map((option) => (
            <button key={option.id} className={draftTexture === option.id ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftTexture(option.id)}>
              {option.label}
            </button>
          ))}
        </div></div>
        <div className="tolerance-control"><span>难度</span><div className="segmented-control chord-v2-difficulty">
          {([1, 2, 3, 4, 5, 6, 7] as ChordV2Difficulty[]).map((level) => (
            <button key={level} className={draftDifficulty === level ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftDifficulty(level)}>
              L{level}
            </button>
          ))}
        </div></div>
        <div className="tolerance-control"><span>题数</span><div className="segmented-control">
          {[10, 20, 50].map((count) => (
            <button key={count} className={draftQuestionCount === count ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftQuestionCount(count)}>
              {count}
            </button>
          ))}
        </div></div>
      </PracticeSettingsDrawer>

      {chord.status === 'finished' ? (
        <PracticeReportModal title="和弦练习完成" onBack={chord.stop} onRepeat={chord.start}>
          <div className="report-grid">
            <div><span>总题数</span><strong>{chord.report.totalQuestions}</strong></div>
            <div><span>正确</span><strong>{chord.report.correct}</strong></div>
            <div><span>错误</span><strong>{chord.report.wrong}</strong></div>
            <div><span>漏音</span><strong>{chord.report.missing}</strong></div>
            <div><span>多音</span><strong>{chord.report.extra}</strong></div>
            <div><span>转位错误</span><strong>{chord.report.wrongBass}</strong></div>
            <div><span>正确率</span><strong>{chord.report.accuracy}%</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
