import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote, MidiEventRecord } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useChordPractice, CHORD_INVERSION_MODE_LABELS, CHORD_QUALITY_LABELS } from '../hooks/useChordPractice'
import { usePracticeSessionRecorder } from '../hooks/usePracticeSessionRecorder'
import type { ChordContentCategory, ChordInversionMode, ChordKeySignature, ChordQualityFilter, ChordQuestionCount, SeventhChordQualityFilter } from '../utils/chordTypes'
import { CHORD_INPUT_WINDOW_MS } from '../utils/chordPatterns'
import { SEVENTH_CHORD_QUALITY_LABELS } from '../utils/chordDefinitions'
import { PRACTICE_DIFFICULTY_LABELS } from '../utils/practiceContentTypes'
import { CHORD_CONTENT_CATEGORY_LABELS } from '../utils/chordTrainingContents'
import { createChordRecord } from '../utils/practiceRecordAdapters'
import type { PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { ChordTargetView } from './ChordTargetView'
import { FullKeyboard } from './FullKeyboard'
import { MetronomeVolumeControl } from './MetronomeVolumeControl'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeSettingsDrawer } from './PracticeSettingsDrawer'
import { PracticeStatBar } from './PracticeStatBar'

interface ChordPracticePageProps {
  activeNotes: ActiveMidiNote[]
  latestMidiEvent: MidiEventRecord | null
  onBackHome: () => void
  exitPromptOpen: boolean
  onPracticeRunningChange: (isRunning: boolean) => void
}

const qualityOptions: ChordQualityFilter[] = ['major', 'minor', 'both']
const seventhQualityOptions: SeventhChordQualityFilter[] = ['all', 'major7', 'dominant7', 'minor7', 'half-diminished7']
const inversionOptions: ChordInversionMode[] = ['root', 'first', 'second', 'third', 'root-first', 'all', 'random']
const keyOptions: ChordKeySignature[] = ['C', 'G', 'F']
const contentCategories = Object.keys(CHORD_CONTENT_CATEGORY_LABELS) as ChordContentCategory[]

export function ChordPracticePage({
  activeNotes,
  exitPromptOpen,
  latestMidiEvent,
  onBackHome,
  onPracticeRunningChange
}: ChordPracticePageProps): JSX.Element {
  const chord = useChordPractice(latestMidiEvent)
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('chords')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftQuestionCount, setDraftQuestionCount] = useState<ChordQuestionCount>(chord.questionCount)
  const [draftQuality, setDraftQuality] = useState<ChordQualityFilter>(chord.qualityFilter)
  const [draftSeventhQuality, setDraftSeventhQuality] = useState<SeventhChordQualityFilter>(chord.seventhQualityFilter)
  const [draftInversion, setDraftInversion] = useState<ChordInversionMode>(chord.inversionMode)
  const [draftContentId, setDraftContentId] = useState(chord.selectedContentId)
  const [draftKeySignature, setDraftKeySignature] = useState<ChordKeySignature>(chord.keySignature)
  const [draftRoundCount, setDraftRoundCount] = useState(chord.roundCount)
  const [draftShowNoteNames, setDraftShowNoteNames] = useState(chord.showNoteNames)
  const [draftMetronomeEnabled, setDraftMetronomeEnabled] = useState(chord.metronomeEnabled)
  const [draftShowVirtualKeyboard, setDraftShowVirtualKeyboard] = useState(showVirtualKeyboard)
  const pausedForExitRef = useRef(false)
  const draftSelectedContent = chord.contents.find((content) => content.id === draftContentId) ?? chord.contents[0]
  const draftSupportsThirdInversion = draftSelectedContent.category === 'seventh'
  const draftIsIdentification = draftSelectedContent.category === 'triad' || draftSelectedContent.category === 'seventh'
  const draftIsProgression = Boolean(draftSelectedContent.progressionId)
  const createRecord = useCallback(
    (timing: PracticeSessionTiming) => createChordRecord({
      timing,
      report: chord.report,
      chordType: chord.qualityFilter,
      seventhChordType: chord.seventhQualityFilter,
      inversionMode: chord.inversionMode,
      questionCount: chord.questionCount,
      contentId: chord.selectedContentId,
      contentName: chord.selectedContent.name,
      difficulty: chord.selectedContent.difficulty,
      category: chord.selectedContent.category,
      inputStyle: chord.selectedContent.inputStyle,
      keySignature: chord.selectedContent.progressionId ? chord.keySignature : undefined,
      roundCount: chord.selectedContent.progressionId ? chord.roundCount : undefined
    }),
    [chord.inversionMode, chord.keySignature, chord.qualityFilter, chord.questionCount, chord.report, chord.roundCount, chord.selectedContent.category, chord.selectedContent.difficulty, chord.selectedContent.inputStyle, chord.selectedContent.name, chord.selectedContent.progressionId, chord.selectedContentId, chord.seventhQualityFilter]
  )
  const recorder = usePracticeSessionRecorder(chord.status === 'finished', createRecord)

  useEffect(() => {
    onPracticeRunningChange(chord.isRunning)
  }, [chord.isRunning, onPracticeRunningChange])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!chord.isRunning) {
      pausedForExitRef.current = false
      return
    }

    if (exitPromptOpen && !chord.isPaused) {
      pausedForExitRef.current = true
      chord.pause()
    } else if (!exitPromptOpen && pausedForExitRef.current) {
      pausedForExitRef.current = false
      chord.resume()
    }
  }, [chord.isPaused, chord.isRunning, chord.pause, chord.resume, exitPromptOpen])

  const startPractice = (): void => {
    setSettingsOpen(false)
    recorder.beginSession()
    chord.start()
  }

  const openSettings = (): void => {
    setDraftQuestionCount(chord.questionCount)
    setDraftQuality(chord.qualityFilter)
    setDraftSeventhQuality(chord.seventhQualityFilter)
    setDraftInversion(chord.inversionMode)
    setDraftContentId(chord.selectedContentId)
    setDraftKeySignature(chord.keySignature)
    setDraftRoundCount(chord.roundCount)
    setDraftShowNoteNames(chord.showNoteNames)
    setDraftMetronomeEnabled(chord.metronomeEnabled)
    setDraftShowVirtualKeyboard(showVirtualKeyboard)
    setSettingsOpen(true)
  }

  const saveSettings = (): void => {
    chord.setQuestionCount(draftQuestionCount)
    chord.setQualityFilter(draftQuality)
    chord.setSeventhQualityFilter(draftSeventhQuality)
    chord.setInversionMode(draftInversion === 'third' && !draftSupportsThirdInversion ? 'root' : draftInversion)
    chord.setSelectedContentId(draftContentId)
    chord.setKeySignature(draftKeySignature)
    chord.setRoundCount(draftRoundCount)
    chord.setShowNoteNames(draftShowNoteNames)
    chord.setMetronomeEnabled(draftMetronomeEnabled)
    setShowVirtualKeyboard(draftShowVirtualKeyboard)
    setSettingsOpen(false)
  }

  const handleDraftContentChange = (contentId: string): void => {
    const nextContent = chord.contents.find((content) => content.id === contentId)
    setDraftContentId(contentId)
    if (nextContent?.category !== 'seventh' && draftInversion === 'third') {
      setDraftInversion('root')
    }
  }

  const isProgression = Boolean(chord.selectedContent.progressionId)
  const chordTypeSummary = chord.selectedContent.category === 'seventh'
    ? SEVENTH_CHORD_QUALITY_LABELS[chord.seventhQualityFilter]
    : CHORD_QUALITY_LABELS[chord.qualityFilter]
  const inputStyleLabel = chord.selectedContent.inputStyle === 'arpeggio' ? '分解' : '柱式'
  const settingsSummary = `${chord.selectedContent.name} · ${isProgression ? `${chord.keySignature}大调 · ${chord.roundCount}轮 · ${inputStyleLabel}` : `${chordTypeSummary} · ${CHORD_INVERSION_MODE_LABELS[chord.inversionMode]} · ${chord.questionCount}题`} · ${PRACTICE_DIFFICULTY_LABELS[chord.selectedContent.difficulty]}`
  const judgedCount = chord.completedQuestions

  return (
    <section className="chord-page practice-workspace-page">
      <PracticePageHeader
        controls={chord.metronomeEnabled ? <MetronomeVolumeControl id="chord-header-metronome-volume" value={chord.metronomeSound.volume} onChange={chord.metronomeSound.setVolume} /> : undefined}
        eyebrow="Chord Practice"
        onOpenSettings={openSettings}
        summary={settingsSummary}
        title="和弦练习"
      />

      <div className="practice-single-column">
        <section className="midi-panel chord-panel chord-main-panel practice-primary-panel">
          <div className="panel-title-row">
            <div><h3>目标和弦</h3><p>输入窗口 {CHORD_INPUT_WINDOW_MS}ms，窗口内重复音只计算一次。</p></div>
            <span className={`audio-status-badge status-${chord.status === 'running' ? 'ready' : 'suspended'}`}>
              {chord.status === 'running' ? '练习中' : chord.status === 'finished' ? '已完成' : '未开始'}
            </span>
          </div>
          <ChordTargetView feedback={chord.feedback} showNoteNames={chord.showNoteNames} target={chord.currentTarget} />
          <div className="practice-primary-actions">
            {chord.isRunning ? <AppButton variant="secondary" onClick={chord.stop}>停止练习</AppButton> : <AppButton onClick={startPractice}>开始练习</AppButton>}
            {chord.feedback && chord.feedback.type !== 'correct' && chord.isRunning ? <AppButton variant="ghost" onClick={chord.nextQuestion}>下一题</AppButton> : null}
          </div>
          {recorder.saveError ? <p className="practice-save-error">{recorder.saveError}</p> : null}
        </section>

        <PracticeStatBar items={[
          { label: '已完成', value: `${chord.completedQuestions} / ${chord.report.totalQuestions}` },
          { label: '正确', value: chord.correctCount },
          { label: '错误', value: chord.wrongCount },
          { label: '缺音', value: chord.report.missingNote },
          { label: '多音', value: chord.report.extraNote },
          { label: '当前连对', value: chord.currentStreak },
          { label: '正确率', value: judgedCount > 0 ? `${chord.report.accuracy}%` : '—' }
        ]} />

        {showVirtualKeyboard ? (
          <section className="midi-panel chord-panel chord-keyboard-panel practice-keyboard-panel">
            <div className="panel-title-row"><div><h3>虚拟钢琴键盘</h3><p>目标和弦淡色高亮，正确为绿色，错误输入为红色。</p></div></div>
            <FullKeyboard activeNotes={activeNotes} correctNotes={chord.correctNotes} targetNotes={chord.targetNotes} wrongNotes={chord.wrongNotes} />
          </section>
        ) : null}

        {chord.metronomeEnabled ? (
          <section className="midi-panel chord-panel practice-auxiliary-panel">
            <div className="panel-title-row"><div><h3>节拍器辅助</h3><p>节拍器仅作为辅助，不参与早晚判定。</p></div></div>
            <div className="beat-dots chord-beat-dots" aria-label="当前拍点">
              {[1, 2, 3, 4].map((beat) => <span key={beat} className={`${chord.metronome.currentBeat === beat ? 'is-active' : ''} ${chord.metronome.isCountingIn ? 'is-count-in' : ''}`}>{beat}</span>)}
            </div>
          </section>
        ) : null}

      </div>

      <PracticeSettingsDrawer isLocked={chord.isRunning} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={saveSettings} title="和弦练习设置">
        <label className="midi-field" htmlFor="chord-content"><span>训练内容</span><select id="chord-content" className="midi-select" disabled={chord.isRunning} value={draftContentId} onChange={(event) => handleDraftContentChange(event.target.value)}>
          {contentCategories.map((category) => (
            <optgroup key={category} label={CHORD_CONTENT_CATEGORY_LABELS[category]}>
              {chord.contents.filter((content) => content.category === category).map((content) => (
                <option key={content.id} value={content.id}>{content.name} · {PRACTICE_DIFFICULTY_LABELS[content.difficulty]}</option>
              ))}
            </optgroup>
          ))}
        </select></label>
        <p className="judgement-help">{draftSelectedContent.description}</p>
        {draftIsProgression ? (
          <>
            <div className="chord-setting-group"><span>调性</span><div className="segmented-control">
              {keyOptions.map((key) => <button key={key} className={draftKeySignature === key ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftKeySignature(key)}>{key} 大调</button>)}
            </div></div>
            <div className="chord-setting-group"><span>进行轮数</span><div className="segmented-control">
              {[1, 2, 4].map((count) => <button key={count} className={draftRoundCount === count ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftRoundCount(count)}>{count}轮</button>)}
            </div></div>
          </>
        ) : null}
        {draftIsIdentification ? (
          <>
            <div className="chord-setting-group"><span>题数</span><div className="segmented-control">
              {chord.questionCountOptions.map((count) => <button key={count} className={draftQuestionCount === count ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftQuestionCount(count)}>{count}</button>)}
            </div></div>
            {draftSelectedContent.category === 'triad' ? (
              <div className="chord-setting-group"><span>三和弦类型</span><div className="segmented-control">
                {qualityOptions.map((option) => <button key={option} className={draftQuality === option ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftQuality(option)}>{CHORD_QUALITY_LABELS[option]}</button>)}
              </div></div>
            ) : (
              <div className="chord-setting-group"><span>七和弦类型</span><div className="segmented-control chord-wide-segmented">
                {seventhQualityOptions.map((option) => <button key={option} className={draftSeventhQuality === option ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftSeventhQuality(option)}>{SEVENTH_CHORD_QUALITY_LABELS[option]}</button>)}
              </div></div>
            )}
            <div className="chord-setting-group"><span>转位</span><div className="segmented-control chord-wide-segmented">
              {inversionOptions.filter((option) => option !== 'third' || draftSupportsThirdInversion).map((option) => <button key={option} className={draftInversion === option ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftInversion(option)}>{CHORD_INVERSION_MODE_LABELS[option]}</button>)}
            </div></div>
          </>
        ) : null}
        <div className="chord-setting-group"><span>音名提示</span><div className="segmented-control">
          <button className={draftShowNoteNames ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftShowNoteNames(true)}>显示</button>
          <button className={!draftShowNoteNames ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftShowNoteNames(false)}>隐藏</button>
        </div></div>
        <div className="chord-setting-group"><span>节拍器</span><div className="segmented-control">
          <button className={draftMetronomeEnabled ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftMetronomeEnabled(true)}>开启</button>
          <button className={!draftMetronomeEnabled ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftMetronomeEnabled(false)}>关闭</button>
        </div><small>节拍器仅作为辅助，不参与早晚判定。</small></div>
        <div className="chord-setting-group"><span>显示虚拟键盘</span><div className="segmented-control">
          <button className={draftShowVirtualKeyboard ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftShowVirtualKeyboard(true)}>显示</button>
          <button className={!draftShowVirtualKeyboard ? 'is-active' : ''} disabled={chord.isRunning} type="button" onClick={() => setDraftShowVirtualKeyboard(false)}>隐藏</button>
        </div></div>
      </PracticeSettingsDrawer>

      {chord.status === 'finished' ? (
        <PracticeReportModal title="和弦练习完成">
          <p className="practice-report-summary">{settingsSummary}</p>
          <div className="report-grid">
            <div><span>总题数</span><strong>{chord.report.totalQuestions}</strong></div><div><span>正确数</span><strong>{chord.report.correct}</strong></div><div><span>错误数</span><strong>{chord.report.wrong}</strong></div>
            <div><span>训练内容</span><strong>{chord.report.contentName}</strong></div>
            {isProgression ? (
              <><div><span>调性</span><strong>{chord.report.keySignature} 大调</strong></div><div><span>进行轮数</span><strong>{chord.report.roundCount}</strong></div><div><span>演奏形式</span><strong>{inputStyleLabel}</strong></div></>
            ) : (
              <><div><span>和弦类型</span><strong>{chordTypeSummary}</strong></div><div><span>转位</span><strong>{CHORD_INVERSION_MODE_LABELS[chord.inversionMode]}</strong></div></>
            )}
            <div><span>漏音次数</span><strong>{chord.report.missingNote}</strong></div><div><span>多音次数</span><strong>{chord.report.extraNote}</strong></div><div><span>错音次数</span><strong>{chord.report.wrongNote}</strong></div>
            <div><span>正确率</span><strong>{chord.report.accuracy}%</strong></div><div><span>最高连对</span><strong>{chord.report.bestStreak}</strong></div><div><span>最容易错的和弦</span><strong>{chord.report.mostMissedChord}</strong></div>
            <div><span>最容易漏的音</span><strong>{chord.report.mostMissedNote}</strong></div><div><span>平均尝试次数</span><strong>{chord.report.averageAttempts}</strong></div>
          </div>
          <div className="practice-report-actions"><AppButton onClick={startPractice}>再练一次</AppButton><AppButton variant="secondary" onClick={onBackHome}>返回首页</AppButton></div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
