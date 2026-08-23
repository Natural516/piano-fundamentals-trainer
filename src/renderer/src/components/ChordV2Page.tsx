import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote, MidiConnectionState } from '../types'
import { useChordV2Practice } from '../hooks/useChordV2Practice'
import { CHORD_V2_DIFFICULTY_LABELS, type ChordV2Difficulty, type ChordV2InversionMode, type ChordV2JudgeMode, type ChordV2Texture } from '../chordV2/chordV2Types'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'
import { ProgressionPracticePanel } from './ProgressionPracticePanel'
import { isExperimentalFeatureVisible } from '../featureFlags'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import { useMidiDisconnectProtection } from '../hooks/useMidiDisconnectProtection'
import { createChordV2Record } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'

interface ChordV2PageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  midiConnectionState: MidiConnectionState
  onPracticeRunningChange: (running: boolean) => void
}

const judgeModeOptions: Array<{ id: ChordV2JudgeMode; label: string }> = [
  { id: 'identity', label: '和弦身份' },
  { id: 'inversion', label: '转位' },
  { id: 'exact', label: '指定排列' }
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
  midiConnectionState,
  onPracticeRunningChange
}: ChordV2PageProps): JSX.Element {
  const chord = useChordV2Practice()
  const [content, setContent] = useState<'chord' | 'progression'>('chord')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftJudgeMode, setDraftJudgeMode] = useState<ChordV2JudgeMode>(chord.judgeMode)
  const [draftInversionMode, setDraftInversionMode] = useState<ChordV2InversionMode>(chord.inversionMode)
  const [draftTexture, setDraftTexture] = useState<ChordV2Texture>(chord.texture)
  const [draftSpacing, setDraftSpacing] = useState<'close' | 'open'>(chord.spacing)
  const [draftDifficulty, setDraftDifficulty] = useState<ChordV2Difficulty>(chord.difficulty)
  const [draftQuestionCount, setDraftQuestionCount] = useState(chord.questionCount)
  const pausedForExitRef = useRef(false)
  const createRecord = useCallback((timing: PracticeSessionTiming) => createChordV2Record({
    timing,
    report: chord.report,
    completedQuestions: chord.completedQuestions,
    judgeMode: chord.judgeMode,
    inversionMode: chord.inversionMode,
    texture: chord.texture,
    spacing: chord.spacing,
    difficulty: chord.difficulty
  }), [chord.completedQuestions, chord.difficulty, chord.inversionMode, chord.judgeMode, chord.report, chord.spacing, chord.texture])
  const recorder = usePracticeSessionRecorder(chord.status === 'finished', createRecord, {
    practiceType: 'chord',
    exerciseId: `chord-v2-l${chord.difficulty}`,
    mode: `${chord.judgeMode}:${chord.texture}`
  })
  const protectDisconnectedSession = useCallback(() => {
    recorder.interruptDevice()
    chord.pause()
  }, [chord.pause, recorder.interruptDevice])
  useMidiDisconnectProtection(midiConnectionState, chord.sessionActive, protectDisconnectedSession)

  useEffect(() => {
    onPracticeRunningChange(chord.sessionActive)
  }, [chord.sessionActive, onPracticeRunningChange])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!chord.sessionActive) {
      pausedForExitRef.current = false
      return
    }
    if (exitPromptOpen) {
      pausedForExitRef.current = true
      recorder.checkpoint()
      chord.pause()
    } else if (pausedForExitRef.current) {
      pausedForExitRef.current = false
      recorder.resumeSession()
      chord.resume()
    }
  }, [chord.pause, chord.resume, chord.sessionActive, exitPromptOpen, recorder.checkpoint, recorder.resumeSession])

  const startPractice = (): void => {
    if (chord.isPaused) {
      recorder.resumeSession()
      chord.resume()
      return
    }
    if (!recorder.beginSession()) return
    chord.start()
  }

  const stopPractice = (): void => {
    recorder.stopSession()
    chord.stop()
  }

  const pausePractice = (): void => {
    recorder.checkpoint()
    chord.pause()
  }

  const openSettings = (): void => {
    setDraftJudgeMode(chord.judgeMode)
    setDraftInversionMode(chord.inversionMode)
    setDraftTexture(chord.texture)
    setDraftSpacing(chord.spacing)
    setDraftDifficulty(chord.difficulty)
    setDraftQuestionCount(chord.questionCount)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    chord.setJudgeMode(draftJudgeMode)
    chord.setInversionMode(draftInversionMode)
    chord.setTexture(draftTexture)
    chord.setSpacing(draftSpacing)
    chord.setDifficulty(draftDifficulty)
    chord.setQuestionCount(draftQuestionCount)
    setSettingsOpen(false)
  }

  const question = chord.currentQuestion
  const feedbackType = chord.feedback?.type
  const settingsSummary = `${judgeModeOptions.find((option) => option.id === chord.judgeMode)?.label} · ${textureOptions.find((option) => option.id === chord.texture)?.label} · ${CHORD_V2_DIFFICULTY_LABELS[chord.difficulty]}`
  const hasClearPriority = chord.report.wrong + chord.report.missing + chord.report.extra + chord.report.wrongBass > 0

  return (
    <section className="chord-v2-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="练习目标"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="和弦练习"
      />

      <div className="practice-single-column">
        {isExperimentalFeatureVisible('FEATURE_EXPERIMENTAL_HARMONY_GENERATOR') ? (
          <div className="practice-content-toggle">
            <button className={content === 'chord' ? 'is-active' : ''} type="button" onClick={() => setContent('chord')}>单和弦</button>
            <button className={content === 'progression' ? 'is-active' : ''} type="button" onClick={() => setContent('progression')}>和声进行</button>
          </div>
        ) : null}

        {content === 'progression' ? (
          <ProgressionPracticePanel
            activeNotes={activeNotes}
            exitPromptOpen={exitPromptOpen}
            onPracticeRunningChange={onPracticeRunningChange}
          />
        ) : (
        <>
        <section className={`midi-panel chord-v2-panel practice-primary-panel ${chord.feedback ? `has-${feedbackType}` : ''}`}>
          <div className="panel-title-row">
            <div>
              <h3>当前目标</h3>
              <p>看清和弦名称与低音位置，再按当前方式完整弹出目标和弦。</p>
            </div>
            <span className={`audio-status-badge status-${chord.isRunning ? 'ready' : 'suspended'}`}>
              {chord.isRunning ? '练习中' : chord.isPaused ? '已暂停' : chord.status === 'finished' ? '已结束' : '未开始'}
            </span>
          </div>

          {question ? (
            <>
              <div className="chord-v2-target">
                <strong>{question.symbol}</strong>
                <span>{question.identity.quality} · {question.judgeMode === 'inversion' ? '转位判定' : question.judgeMode === 'exact' ? '指定排列' : '和弦识别'}</span>
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
            {!chord.isRunning ? <AppButton onClick={startPractice}>{chord.isPaused ? '继续练习' : chord.status === 'finished' ? '再练一次' : '开始练习'}</AppButton> : null}
            {chord.isRunning ? <AppButton variant="secondary" onClick={pausePractice}>暂停</AppButton> : null}
            {chord.sessionActive ? <AppButton variant="ghost" onClick={stopPractice}>停止</AppButton> : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
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
        </>
        )}
      </div>

      <PracticeSettingsDrawer
        isLocked={chord.sessionActive}
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
        <div className="tolerance-control"><span>声部疏密</span><div className="segmented-control">
          <button className={draftSpacing === 'close' ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftSpacing('close')}>密集</button>
          <button className={draftSpacing === 'open' ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftSpacing('open')}>开放</button>
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
        <PracticeReportModal
          title="这一轮和弦完成了"
          onBack={chord.stop}
          onRepeat={startPractice}
          primaryAction={hasClearPriority ? 'repeat' : 'back'}
          repeatLabel={hasClearPriority ? '按建议再练' : '再练一轮'}
        >
          <div className="f2-result-story">
            <section><span>做得最好</span><h4>本轮完整弹对 {chord.report.correct} 个和弦。</h4></section>
            <section><span>最需要处理</span><h4>{chord.report.wrongBass > 0 ? '先留意转位和最低音的位置。' : chord.report.missing > 0 ? '先把每个和弦的组成音弹完整。' : chord.report.wrong > 0 || chord.report.extra > 0 ? '先处理不属于目标和弦的音。' : '本轮没有集中的和弦错误。'}</h4></section>
            <section><span>为什么优先处理</span><p>{chord.report.wrong + chord.report.missing + chord.report.extra + chord.report.wrongBass > 0 ? '优先项来自本轮实际记录的低音、漏音与多音。' : '当前记录没有指出明确弱点，不额外猜测。'}</p></section>
            <section className="is-next"><span>下一步练法</span><h4>{hasClearPriority ? '保持当前题型再练一轮，弹之前先在心里确认组成音和最低音。' : '当前没有明确优先问题，可以完成这一项；想确认稳定性时再练一轮。'}</h4></section>
          </div>
          <details className="f2-result-details"><summary>查看详细数据</summary><div className="report-grid">
            <div><span>总题数</span><strong>{chord.report.totalQuestions}</strong></div>
            <div><span>正确</span><strong>{chord.report.correct}</strong></div>
            <div><span>错误</span><strong>{chord.report.wrong}</strong></div>
            <div><span>漏音</span><strong>{chord.report.missing}</strong></div>
            <div><span>多音</span><strong>{chord.report.extra}</strong></div>
            <div><span>转位错误</span><strong>{chord.report.wrongBass}</strong></div>
            <div><span>正确率</span><strong>{chord.report.accuracy}%</strong></div>
          </div></details>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
