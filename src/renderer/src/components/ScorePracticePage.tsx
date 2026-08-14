import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useScorePractice, type ScorePracticeMode } from '../hooks/useScorePractice'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { loadMusicXmlDocument } from '../score/musicXmlParser'
import { extractMxlContainerAsync } from '../score/zipReader'
import { parseMidiFile } from '../midiFile/midiFileParser'
import { buildPlaybackPlan, type PlaybackPlan } from '../playback/playback'
import { buildDeterministicCoachResponse, type CoachResponse } from '../ai/coach2'
import { computeAbilityModel } from '../ability/abilityModel'
import { fromLegacyRecord, type PracticeRecordV2 } from '../records/practiceRecordV2'
import { saveScorePracticeRecord } from '../records/scorePracticeRecords'
import { isExperimentalFeatureVisible } from '../featureFlags'
import type { ScoreDocument } from '../score/musicXmlTypes'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeStatBar } from './PracticeStatBar'

interface ScorePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  pianoAudio: UsePianoAudioResult
  practiceRecords: PracticeSessionRecord[]
  onPracticeRunningChange: (running: boolean) => void
}

type ImportTier = 'A' | 'B' | 'C' | 'D' | null

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
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>2</voice></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note>
    </measure>
  </part>
</score-partwise>`

const TIER_LABELS: Record<NonNullable<ImportTier>, string> = {
  A: 'A 级：MusicXML/MXL — 完整训练模式（Score Ground Truth）',
  B: 'B 级：MusicXML/MXL + MIDI — 双重验证模式',
  C: 'C 级：MIDI only — 可播放/有限练习，不假装完整谱面语义',
  D: 'D 级：图片 — 仅视觉辅助材料，不作为严格判题 Ground Truth'
}

function usePlaybackDemo(
  plan: PlaybackPlan | null,
  audio: Pick<UsePianoAudioResult, 'playNote' | 'stopNote' | 'setSustain'>
): { isPlaying: boolean; play: () => void; stop: () => void; panic: () => void } {
  const timersRef = useRef<number[]>([])
  const [isPlaying, setIsPlaying] = useState(false)

  const clearTimers = (): void => {
    for (const timer of timersRef.current) window.clearTimeout(timer)
    timersRef.current = []
  }

  const play = (): void => {
    clearTimers()
    if (!plan) return
    setIsPlaying(true)
    const schedule = (events: PlaybackPlan['events']): void => {
      for (const event of events) {
        const timer = window.setTimeout(() => {
          if (event.type === 'noteOn') audio.playNote(event.midiNumber, event.velocity)
          else audio.stopNote(event.midiNumber)
        }, event.timeMs)
        timersRef.current.push(timer)
      }
      const endTimer = window.setTimeout(() => {
        audio.setSustain(false)
        if (plan.loop) {
          schedule(plan.events)
        } else {
          setIsPlaying(false)
        }
      }, plan.durationMs + 80)
      timersRef.current.push(endTimer)
    }
    schedule(plan.events)
  }

  const stop = (): void => {
    clearTimers()
    audio.setSustain(false)
    setIsPlaying(false)
  }

  const panic = (): void => {
    stop()
  }

  useEffect(() => () => clearTimers(), [])

  return { isPlaying, play, stop, panic }
}

export function ScorePracticePage({
  activeNotes,
  exitPromptOpen,
  pianoAudio,
  practiceRecords,
  onPracticeRunningChange
}: ScorePracticePageProps): JSX.Element {
  const [score, setScore] = useState<ScoreDocument | null>(null)
  const [scoreTitle, setScoreTitle] = useState('')
  const [loadError, setLoadError] = useState('')
  const [segmentName, setSegmentName] = useState('')
  const [mode, setMode] = useState<ScorePracticeMode>('wait')
  const [importTier, setImportTier] = useState<ImportTier>(null)
  const [startMeasure, setStartMeasure] = useState(1)
  const [endMeasure, setEndMeasure] = useState(2)
  const [handMode, setHandMode] = useState<'left' | 'right' | 'both'>('both')
  const [loop, setLoop] = useState(false)
  const [tempoRatio, setTempoRatio] = useState(1)
  const [countIn, setCountIn] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const savedRecordIdRef = useRef('')
  const followVisible = isExperimentalFeatureVisible('FEATURE_SCORE_FOLLOWING')
  const effectiveMode: ScorePracticeMode = mode === 'follow' && !followVisible ? 'wait' : mode
  const bpm = score?.defaultTempoBpm ?? 60
  const countInMs = countIn ? 4 * (60000 / bpm) : 0

  const practice = useScorePractice(score, effectiveMode, {
    segment: { startMeasure, endMeasure, handMode },
    loop,
    countInMs,
    tempoRatio
  })

  const demoPlan = useMemo(() => (
    score
      ? buildPlaybackPlan(score, { startMeasure, endMeasure, handMode, tempoRatio, loop })
      : null
  ), [endMeasure, handMode, loop, score, startMeasure, tempoRatio])
  const demo = usePlaybackDemo(demoPlan, pianoAudio)

  const coachResponse: CoachResponse | null = useMemo(() => {
    if (!score) return null
    return buildDeterministicCoachResponse({
      selectedMeasures: { start: startMeasure, end: endMeasure },
      recentRecords: practiceRecords.slice(0, 5),
      ability: computeAbilityModel(practiceRecords),
      plan: null,
      userQuestion: ''
    })
  }, [endMeasure, practiceRecords, score, startMeasure])

  useEffect(() => {
    const demo = loadMusicXmlDocument(DEMO_SCORE_XML)
    setScore(demo)
    setScoreTitle(demo.title)
    setImportTier('A')
  }, [])

  useEffect(() => {
    onPracticeRunningChange(practice.isRunning)
  }, [onPracticeRunningChange, practice.isRunning])

  useEffect(() => {
    if (practice.status === 'finished' && score) {
      const key = `${score.title}-${Date.now()}`
      if (savedRecordIdRef.current === key) return
      savedRecordIdRef.current = key
      const record: PracticeRecordV2 = {
        id: key,
        schemaVersion: 2,
        practiceType: 'score',
        sourceType: importTier === 'A' || importTier === 'B' ? 'musicxml' : 'midi',
        sourceId: score.title,
        startedAt: new Date(Date.now() - practice.report.totalUnits * 500).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Math.round(practice.elapsedMs),
        tempo: bpm,
        mode: effectiveMode,
        handMode,
        scoreId: score.title,
        segment: `${startMeasure}-${endMeasure}`,
        metrics: [
          { key: 'accuracy', value: practice.report.accuracy, unit: '%' },
          { key: 'correct', value: practice.report.correct },
          { key: 'wrong', value: practice.report.wrong },
          { key: 'missing', value: practice.report.missing },
          { key: 'extra', value: practice.report.extra }
        ],
        errorEvents: practice.results
          .filter((entry) => entry.outcome === 'wrong' || entry.outcome === 'missing' || entry.outcome === 'extra')
          .map((entry, index) => ({
            id: `${key}-error-${index}`,
            type: String(entry.outcome),
            measure: Number(String(entry.unitId).split('-')[1]?.replace('m', '')) || null
          })),
        evidenceRefs: [],
        metadata: { importTier }
      }
      saveScorePracticeRecord(record)
    }
  }, [bpm, effectiveMode, handMode, importTier, practice.elapsedMs, practice.report, practice.results, practice.status, score, startMeasure, endMeasure])

  const handleFile = async (file: File): Promise<void> => {
    setLoadError('')
    const extension = file.name.toLowerCase().split('.').pop() ?? ''

    try {
      if (extension === 'mxl') {
        const arrayBuffer = await file.arrayBuffer()
        const container = await extractMxlContainerAsync(new Uint8Array(arrayBuffer))
        if (!container) {
          setLoadError('MXL 中未找到 MusicXML 文件')
          return
        }
        const document = loadMusicXmlDocument(container.xmlText)
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        return
      }

      if (extension === 'xml' || extension === 'musicxml') {
        const text = await file.text()
        const document = loadMusicXmlDocument(text)
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        return
      }

      if (extension === 'mid' || extension === 'midi') {
        const arrayBuffer = await file.arrayBuffer()
        const smf = parseMidiFile(new Uint8Array(arrayBuffer))
        setScoreTitle(`${file.name}（MIDI only）`)
        setImportTier('C')
        setLoadError('C 级导入：仅可播放/有限练习，不作为完整谱面语义')
        void smf
        return
      }

      if (['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
        setScoreTitle(`${file.name}（图片材料）`)
        setImportTier('D')
        setLoadError('D 级导入：仅视觉辅助材料，默认不得作为严格音符判题 Ground Truth')
        return
      }

      setLoadError('不支持的文件类型（支持 .xml/.musicxml/.mxl/.mid/.midi/.png/.jpg/.pdf）')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '导入解析失败')
    }
  }

  const saveSegment = (): void => {
    if (!score) return
    setSegmentName('')
  }

  const weakestMeasures = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of practice.results) {
      if (entry.outcome === 'correct' || entry.outcome === 'skip') continue
      const measure = String(entry.unitId).split('-')[1]?.replace('m', '') ?? '?'
      counts.set(measure, (counts.get(measure) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
  }, [practice.results])

  return (
    <section className="score-practice-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="Score Practice"
        title="自由乐谱练习"
        summary={scoreTitle ? `${scoreTitle} · ${effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'} 模式` : '导入 MusicXML / MXL / MIDI 或使用内置示例'}
      />

      <div className="practice-single-column">
        <section className="midi-panel score-practice-panel practice-primary-panel">
          <div className="panel-title-row">
            <div>
              <h3>{scoreTitle || '未加载曲谱'}</h3>
              <p>
                {effectiveMode === 'wait'
                  ? 'Wait 模式：当前目标单元满足后才推进。'
                  : effectiveMode === 'realtime'
                    ? 'Realtime 模式：按谱面 tempo 运行，早/晚/漏/多按窗口判定。'
                    : 'Follow 模式（Experimental）。'}
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
                  className={effectiveMode === option ? 'is-active' : ''}
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
              accept=".xml,.musicxml,.mxl,.mid,.midi,.png,.jpg,.jpeg,.pdf"
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
              setImportTier('A')
              setLoadError('')
            }}>加载示例</AppButton>
          </div>
          {importTier ? <p className="score-practice-tier">{TIER_LABELS[importTier]}</p> : null}
          {loadError ? <p className="practice-save-error">{loadError}</p> : null}
          {mode === 'follow' && !followVisible ? (
            <p className="practice-save-error">Experimental feature disabled（Follow 暂未开放）</p>
          ) : null}

          <div className="score-practice-selection">
            <label className="midi-field"><span>起始小节</span>
              <input className="midi-select" type="number" min="1" value={startMeasure} disabled={practice.isRunning} onChange={(event) => setStartMeasure(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            <label className="midi-field"><span>结束小节</span>
              <input className="midi-select" type="number" min={startMeasure} value={endMeasure} disabled={practice.isRunning} onChange={(event) => setEndMeasure(Math.max(startMeasure, Number(event.target.value) || startMeasure))} />
            </label>
            <div className="tolerance-control"><span>手别</span><div className="segmented-control">
              {(['both', 'right', 'left'] as const).map((hand) => (
                <button key={hand} className={handMode === hand ? 'is-active' : ''} disabled={practice.isRunning} type="button" onClick={() => setHandMode(hand)}>
                  {hand === 'both' ? '双手' : hand === 'right' ? '右手' : '左手'}
                </button>
              ))}
            </div></div>
            <div className="tolerance-control"><span>速度</span><div className="segmented-control">
              {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((ratio) => (
                <button key={ratio} className={tempoRatio === ratio ? 'is-active' : ''} disabled={practice.isRunning} type="button" onClick={() => setTempoRatio(ratio)}>
                  {Math.round(ratio * 100)}%
                </button>
              ))}
            </div></div>
            <div className="tolerance-control"><span>选项</span><div className="segmented-control">
              <button className={loop ? 'is-active' : ''} disabled={practice.isRunning} type="button" onClick={() => setLoop((value) => !value)}>循环</button>
              <button className={countIn ? 'is-active' : ''} disabled={practice.isRunning} type="button" onClick={() => setCountIn((value) => !value)}>预备拍</button>
            </div></div>
          </div>

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
          { label: '漏音', value: practice.report.missing },
          { label: '多音', value: practice.report.extra },
          ...(effectiveMode !== 'wait' ? [{ label: '经过时间', value: `${Math.round(practice.elapsedMs / 1000)}s` }] : []),
          { label: '正确率', value: practice.currentIndex > 0 ? `${practice.report.accuracy}%` : '—' }
        ]} />

        {coachResponse ? (
          <section className="midi-panel score-ai-panel">
            <div className="panel-title-row">
              <div><h3>AI 钢琴助理</h3><p>基于当前选区与练习事实的确定性分析（无 API 也可用）。</p></div>
            </div>
            <p className="coach-summary">{coachResponse.summary}</p>
            {coachResponse.diagnoses.map((diagnosis) => (
              <p key={diagnosis.text} className="coach-diagnosis">{diagnosis.text}</p>
            ))}
            {coachResponse.recommendations.map((recommendation) => (
              <p key={recommendation.text} className="coach-recommendation">{recommendation.text}</p>
            ))}
            {coachResponse.demoRequests.length > 0 && demoPlan ? (
              <div className="score-demo-controls">
                <span>示范：第 {demoPlan.startMeasure}–{demoPlan.endMeasure} 小节，{demoPlan.handMode === 'both' ? '双手' : demoPlan.handMode === 'right' ? '右手' : '左手'}，{Math.round(demoPlan.tempoRatio * 100)}%</span>
                <AppButton variant="secondary" onClick={demo.isPlaying ? demo.stop : demo.play}>
                  {demo.isPlaying ? '停止示范' : '▶ 正确示范'}
                </AppButton>
                <AppButton variant="ghost" onClick={demo.panic}>Panic</AppButton>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {practice.status === 'finished' ? (
        <PracticeReportModal title="曲谱练习完成" onBack={practice.reset} onRepeat={practice.start}>
          <div className="report-grid">
            <div><span>练习小节</span><strong>{startMeasure}–{endMeasure}</strong></div>
            <div><span>模式</span><strong>{effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'}</strong></div>
            <div><span>总单元</span><strong>{practice.report.totalUnits}</strong></div>
            <div><span>正确</span><strong>{practice.report.correct}</strong></div>
            <div><span>错误</span><strong>{practice.report.wrong}</strong></div>
            <div><span>漏音</span><strong>{practice.report.missing}</strong></div>
            <div><span>多音</span><strong>{practice.report.extra}</strong></div>
            <div><span>正确率</span><strong>{practice.report.accuracy}%</strong></div>
            <div><span>最薄弱小节</span><strong>{weakestMeasures.length > 0 ? weakestMeasures.map(([measure, count]) => `第${measure}小节×${count}`).join('、') : '无'}</strong></div>
          </div>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
