import { useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useProgressionPractice } from '../hooks/useProgressionPractice'
import { PROGRESSION_IDS, PROGRESSION_LABELS, type ProgressionId } from '../harmony/progressionTypes'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeStatBar } from './PracticeStatBar'

interface ProgressionPracticePanelProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function ProgressionPracticePanel({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: ProgressionPracticePanelProps): JSX.Element {
  const progression = useProgressionPractice()
  const pausedForExitRef = useRef(false)

  useEffect(() => {
    onPracticeRunningChange(progression.isRunning)
  }, [onPracticeRunningChange, progression.isRunning])

  useEffect(() => {
    if (!progression.isRunning) {
      pausedForExitRef.current = false
      return
    }
    if (exitPromptOpen) {
      pausedForExitRef.current = true
      progression.stop()
    } else if (pausedForExitRef.current) {
      pausedForExitRef.current = false
      progression.start()
    }
  }, [exitPromptOpen, progression.isRunning, progression.start, progression.stop])

  const step = progression.currentStep
  const stepSymbol = step ? `${step.roman} · ${PROGRESSION_LABELS[progression.progressionId]} 第 ${progression.currentStepIndex + 1} 步` : '—'

  return (
    <>
      <div className="progression-panel-controls">
        <label className="midi-field"><span>进行</span>
          <select
            className="midi-select"
            disabled={progression.isRunning}
            value={progression.progressionId}
            onChange={(event) => progression.setProgressionId(event.target.value as ProgressionId)}
          >
            {PROGRESSION_IDS.map((id) => <option key={id} value={id}>{PROGRESSION_LABELS[id]}</option>)}
          </select>
        </label>
        <label className="midi-field"><span>调性</span>
          <select
            className="midi-select"
            disabled={progression.isRunning}
            value={progression.keyPitchClass}
            onChange={(event) => progression.setKeyPitchClass(Number(event.target.value))}
          >
            {KEY_NAMES.map((name, pitchClass) => <option key={name} value={pitchClass}>{name}</option>)}
          </select>
        </label>
        <div className="tolerance-control"><span>奏法</span><div className="segmented-control">
          <button className={progression.texture === 'block' ? 'is-active' : ''} disabled={progression.isRunning} type="button" onClick={() => progression.setTexture('block')}>柱式</button>
          <button className={progression.texture === 'arpeggio' ? 'is-active' : ''} disabled={progression.isRunning} type="button" onClick={() => progression.setTexture('arpeggio')}>分解</button>
        </div></div>
      </div>

      <div className="progression-step-display">
        <strong>{step ? stepSymbol : progression.status === 'finished' ? '进行完成' : '准备开始'}</strong>
        {step ? <span>功能：{step.function ?? '其他'} · 目标 Voicing：[{step.voicing.exactNotes.join(', ')}]</span> : null}
      </div>

      {step ? (
        <MiniKeyboard
          activeNotes={activeNotes}
          targetNotes={step.voicing.exactNotes}
          correctNotes={progression.feedback === '正确' || progression.feedback === '分解和弦顺序正确' ? step.voicing.exactNotes : []}
          wrongNotes={progression.feedback && progression.feedback !== '正确' && progression.feedback !== '分解和弦顺序正确' ? progression.inputNotes : []}
        />
      ) : null}

      {progression.feedback ? (
        <p className={`practice-feedback-message ${progression.feedback === '正确' || progression.feedback === '分解和弦顺序正确' ? 'result-correct' : 'result-wrong_note'}`}>
          {progression.feedback}
        </p>
      ) : null}

      <div className="practice-primary-actions">
        {!progression.isRunning ? (
          <AppButton onClick={progression.start}>{progression.status === 'finished' ? '再练一次' : '开始进行'}</AppButton>
        ) : (
          <AppButton variant="secondary" onClick={progression.stop}>停止</AppButton>
        )}
      </div>

      <PracticeStatBar items={[
        { label: '进度', value: `${progression.currentStepIndex} / ${progression.progression?.steps.length ?? 0}` },
        { label: '正确', value: progression.report.correct },
        { label: '错误', value: progression.report.wrong },
        { label: '正确率', value: progression.currentStepIndex > 0 ? `${progression.report.accuracy}%` : '—' }
      ]} />

      {progression.stepResults.length > 0 ? (
        <div className="progression-steps-log">
          {progression.stepResults.map((entry, index) => (
            <span key={`${entry.step}-${index}`} className={entry.result === 'correct' ? 'is-correct' : 'is-wrong'}>
              {index + 1}. {entry.step} · {entry.result === 'correct' ? '正确' : '错误'}
            </span>
          ))}
        </div>
      ) : null}

      {progression.status === 'finished' ? (
        <PracticeReportModal title="进行练习完成" onBack={progression.stop} onRepeat={progression.start}>
          <div className="report-grid">
            <div><span>总步数</span><strong>{progression.report.totalSteps}</strong></div>
            <div><span>正确</span><strong>{progression.report.correct}</strong></div>
            <div><span>错误</span><strong>{progression.report.wrong}</strong></div>
            <div><span>正确率</span><strong>{progression.report.accuracy}%</strong></div>
            <div><span>最容易错的进行步</span><strong>{progression.report.hardestStep}</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </>
  )
}
