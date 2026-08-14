import { useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useScorePractice, type ScorePracticeMode } from '../hooks/useScorePractice'
import { loadMusicXmlDocument } from '../score/musicXmlParser'
import { extractMxlContainerAsync } from '../score/zipReader'
import { createEmptySegmentState, readPracticeSegments, upsertPracticeSegment, writePracticeSegments, type PracticeSegment } from '../score/practiceSegment'
import type { ScoreDocument } from '../score/musicXmlTypes'
import { isExperimentalFeatureVisible } from '../featureFlags'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeStatBar } from './PracticeStatBar'

interface ScorePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  onPracticeRunningChange: (running: boolean) => void
}

const DEMO_SCORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Wait Demo</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><rest/><duration>1</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="start"/></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note>
    </measure>
  </part>
</score-partwise>`

export function ScorePracticePage({
  activeNotes,
  exitPromptOpen,
  onPracticeRunningChange
}: ScorePracticePageProps): JSX.Element {
  const [score, setScore] = useState<ScoreDocument | null>(null)
  const [scoreTitle, setScoreTitle] = useState('')
  const [loadError, setLoadError] = useState('')
  const [segmentName, setSegmentName] = useState('')
  const [mode, setMode] = useState<ScorePracticeMode>('wait')
  const followVisible = isExperimentalFeatureVisible('FEATURE_SCORE_FOLLOWING')
  const effectiveMode: ScorePracticeMode = mode === 'follow' && !followVisible ? 'wait' : mode
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const practice = useScorePractice(score, effectiveMode)
  const pausedForExitRef = useRef(false)

  useEffect(() => {
    const demo = loadMusicXmlDocument(DEMO_SCORE_XML)
    setScore(demo)
    setScoreTitle(demo.title)
  }, [])

  useEffect(() => {
    onPracticeRunningChange(practice.isRunning)
  }, [onPracticeRunningChange, practice.isRunning])

  useEffect(() => {
    if (!practice.isRunning) {
      pausedForExitRef.current = false
      return
    }
    if (exitPromptOpen) {
      pausedForExitRef.current = true
      practice.stop()
    } else if (pausedForExitRef.current) {
      pausedForExitRef.current = false
      practice.start()
    }
  }, [exitPromptOpen, practice.isRunning, practice.start, practice.stop])

  const handleFile = async (file: File): Promise<void> => {
    setLoadError('')
    try {
      if (file.name.toLowerCase().endsWith('.mxl')) {
        const arrayBuffer = await file.arrayBuffer()
        const container = await extractMxlContainerAsync(new Uint8Array(arrayBuffer))
        if (!container) {
          setLoadError('MXL 中未找到 MusicXML 文件')
          return
        }
        const document = loadMusicXmlDocument(container.xmlText)
        setScore(document)
        setScoreTitle(document.title)
        return
      }

      const text = await file.text()
      const document = loadMusicXmlDocument(text)
      setScore(document)
      setScoreTitle(document.title)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'MusicXML 解析失败')
    }
  }

  const saveSegment = (): void => {
    if (!score) return
    const state = readPracticeSegments()
    const now = new Date().toISOString()
    const segment: PracticeSegment = {
      id: `segment-${Date.now()}`,
      scoreId: score.title,
      title: segmentName.trim() || score.title,
      startMeasure: 1,
      endMeasure: score.parts[0]?.measures.length ?? 1,
      tempo: score.defaultTempoBpm ?? 60,
      handMode: 'both',
      practiceMode: 'wait',
      loop: false,
      notes: '',
      createdAt: now,
      updatedAt: now
    }
    writePracticeSegments(upsertPracticeSegment(state, segment))
    setSegmentName('')
  }

  return (
    <section className="score-practice-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="Score Practice"
        title="曲谱练习"
        summary={scoreTitle ? `${scoreTitle} · ${effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'} 模式` : '导入 MusicXML / MXL 或使用内置示例'}
      />

      <div className="practice-single-column">
        <section className="midi-panel score-practice-panel practice-primary-panel">
          <div className="panel-title-row">
            <div>
              <h3>{scoreTitle || '未加载曲谱'}</h3>
              <p>
                {effectiveMode === 'wait'
                  ? 'Wait 模式：当前目标单元满足后才推进，不要求强制时间流逝。'
                  : effectiveMode === 'realtime'
                    ? 'Realtime 模式：时间持续运行，早/晚/漏/多按窗口判定，单个错误不会永久错位。'
                    : 'Follow 模式：软件跟随用户，停下等待、继续跟上，跳过/多弹不永久错位。'}
              </p>
            </div>
            <span className={`audio-status-badge status-${practice.isRunning ? 'ready' : 'suspended'}`}>
              {practice.status === 'running' ? '练习中' : practice.status === 'finished' ? '已完成' : '未开始'}
            </span>
          </div>

          <div className="score-practice-toolbar">
            <div className="segmented-control score-practice-mode">
              {(['wait', 'realtime', ...(followVisible ? ['follow'] : [])] as ScorePracticeMode[]).map((option) => (
                <button
                  key={option}
                  className={mode === option ? 'is-active' : ''}
                  disabled={practice.isRunning}
                  type="button"
                  onClick={() => setMode(option)}
                >
                  {option === 'wait' ? 'Wait' : option === 'realtime' ? 'Realtime' : 'Follow'}
                </button>
              ))}
            </div>
            <input
              ref={fileInputRef}
              className="score-practice-file"
              type="file"
              accept=".xml,.musicxml,.mxl"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <AppButton variant="secondary" onClick={() => fileInputRef.current?.click()}>导入曲谱</AppButton>
            <AppButton variant="ghost" onClick={() => {
              const demo = loadMusicXmlDocument(DEMO_SCORE_XML)
              setScore(demo)
              setScoreTitle(demo.title)
              setLoadError('')
            }}>加载示例</AppButton>
          </div>
          {loadError ? <p className="practice-save-error">{loadError}</p> : null}

          <div className="score-practice-target">
            {practice.isRunning && practice.expectedMidi.length > 0 ? (
              <>
                <strong>目标音：{practice.expectedMidi.join(' / ')}</strong>
                <MiniKeyboard
                  activeNotes={activeNotes}
                  targetNotes={practice.expectedMidi}
                  correctNotes={practice.feedback === 'correct' ? practice.expectedMidi : []}
                  wrongNotes={practice.feedback === 'wrong' ? activeNotes.map((note) => note.midiNumber) : []}
                />
              </>
            ) : (
              <div className="score-practice-empty">
                <strong>{practice.status === 'finished' ? '曲谱完成' : practice.expectedMidi.length === 0 && practice.isRunning ? '当前为休止或延音，自动推进' : `开始后按 ${effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'} 模式弹奏`}</strong>
              </div>
            )}
          </div>
          {mode === 'follow' && !followVisible ? (
            <p className="practice-save-error">Experimental feature disabled（Follow 暂未开放）</p>
          ) : null}

          {practice.feedback ? (
            <p className={`practice-feedback-message ${practice.feedback === 'correct' ? 'result-correct' : 'result-wrong_note'}`}>
              {practice.feedback === 'correct' ? '正确' : '错误：请弹奏目标音'}
            </p>
          ) : null}

          <div className="practice-primary-actions">
            {!practice.isRunning ? (
              <AppButton onClick={practice.start}>{practice.status === 'finished' ? '再练一次' : '开始练习'}</AppButton>
            ) : (
              <AppButton variant="secondary" onClick={practice.stop}>停止</AppButton>
            )}
          </div>

          <div className="score-practice-segment">
            <input
              aria-label="片段名称"
              value={segmentName}
              placeholder="保存为练习片段（可选）"
              onChange={(event) => setSegmentName(event.target.value)}
            />
            <AppButton variant="ghost" onClick={saveSegment} disabled={!score}>保存片段</AppButton>
          </div>
        </section>

        <PracticeStatBar items={[
          { label: '单元进度', value: `${practice.currentIndex} / ${practice.timelineUnits}` },
          { label: '正确', value: practice.report.correct },
          { label: '错误', value: practice.report.wrong },
          { label: '自动跳过', value: practice.report.skipped },
          { label: '漏音', value: practice.report.missing },
          { label: '多音', value: practice.report.extra },
          ...(effectiveMode !== 'wait' ? [{ label: '经过时间', value: `${Math.round(practice.elapsedMs / 1000)}s` }] : []),
          { label: '正确率', value: practice.currentIndex > 0 ? `${practice.report.accuracy}%` : '—' }
        ]} />
      </div>

      {practice.status === 'finished' ? (
        <PracticeReportModal title="曲谱练习完成" onBack={practice.reset} onRepeat={practice.start}>
          <div className="report-grid">
            <div><span>总单元</span><strong>{practice.report.totalUnits}</strong></div>
            <div><span>正确</span><strong>{practice.report.correct}</strong></div>
            <div><span>错误</span><strong>{practice.report.wrong}</strong></div>
            <div><span>自动跳过</span><strong>{practice.report.skipped}</strong></div>
            <div><span>漏音</span><strong>{practice.report.missing}</strong></div>
            <div><span>多音</span><strong>{practice.report.extra}</strong></div>
            <div><span>正确率</span><strong>{practice.report.accuracy}%</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
