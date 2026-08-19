import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useScorePractice, type ScorePracticeMode } from '../hooks/useScorePractice'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { loadMusicXmlDocument } from '../score/musicXmlParser'
import { importMxlFile } from '../score/mxlImportService'
import { parseMidiFile } from '../midiFile/midiFileParser'
import {
  buildPlaybackPlan,
  createTeachingPlaybackController,
  type PlaybackPlan,
  type TeachingPlaybackController
} from '../playback/playback'
import { buildDeterministicCoachResponse, type CoachContext, type CoachResponse } from '../ai/coach2'
import { createOpenAiCompatibleClient } from '../ai/aiProvider'
import { readAiSettings } from '../ai/aiSettings'
import { requestScoreCoachFromProvider } from '../ai/scoreCoachProvider'
import type { TemporarySessionEvidence } from '../ai/evidenceResolver'
import { computeAbilityModelV2 } from '../ability/abilityModel'
import { computeScoreMastery } from '../ability/scoreMastery'
import type { PracticeRecordV2 } from '../records/practiceRecordV2'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import { isExperimentalFeatureVisible } from '../featureFlags'
import type { ScoreDocument } from '../score/musicXmlTypes'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import {
  getScoreImport,
  readScoreImports,
  upsertScoreImport,
  writeScoreImports
} from '../score/scoreImportRepository'
import {
  buildMidiReferenceNotes,
  buildScoreReferenceNotes,
  validateScoreAgainstMidi,
  type ReferenceValidationReport
} from '../score/referenceValidation'
import {
  readPracticeSegments,
  upsertPracticeSegment,
  writePracticeSegments,
  type PracticeSegment
} from '../score/practiceSegment'
import { AppButton } from './AppButton'
import { MiniKeyboard } from './MiniKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { PracticeStatBar } from './PracticeStatBar'
import { ScoreSheetRenderer } from './ScoreSheetRenderer'
import { buildScoreTimeV2 } from '../score/scoreTimeV2'
import { readDailyPlanV2 } from '../plan/dailyPlanV2Storage'
import type { ScorePracticePreset } from '../plan/planner'

export interface ScorePracticeRequest extends ScorePracticePreset {
  requestId: number
}

interface ScorePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  initialSegment?: ScorePracticeRequest | null
  pianoAudio: UsePianoAudioResult
  practiceRecords: PracticeSessionRecord[]
  onPracticeRunningChange: (running: boolean) => void
}

interface DemoRequestSettings {
  startMeasure: number
  endMeasure: number
  handMode: 'left' | 'right' | 'both'
  tempoRatio: number
  loop: boolean
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
  audio: Pick<UsePianoAudioResult, 'enableAudio' | 'playNote' | 'stopNote' | 'setSustain' | 'stopAllNotes'>
): { isPlaying: boolean; play: () => void; stop: () => void; panic: () => void } {
  const [isPlaying, setIsPlaying] = useState(false)
  const controllerRef = useRef<TeachingPlaybackController | null>(null)

  useEffect(() => {
    const controller = createTeachingPlaybackController({
      noteOn: audio.playNote,
      noteOff: audio.stopNote,
      setSustain: audio.setSustain,
      allNotesOff: audio.stopAllNotes
    }, setIsPlaying)
    controllerRef.current = controller
    return () => {
      controller.stop()
      controllerRef.current = null
    }
  }, [audio.playNote, audio.setSustain, audio.stopAllNotes, audio.stopNote])

  const play = (): void => {
    if (!plan) return
    void audio.enableAudio().then(() => controllerRef.current?.play(plan))
  }
  const stop = (): void => controllerRef.current?.stop()
  const panic = (): void => controllerRef.current?.panic()

  return { isPlaying, play, stop, panic }
}

export function ScorePracticePage({
  activeNotes,
  exitPromptOpen,
  initialSegment,
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
  const [savedSegments, setSavedSegments] = useState(() => readPracticeSegments().segments)
  const [savedMessage, setSavedMessage] = useState('')
  const [referenceMidiName, setReferenceMidiName] = useState('')
  const [validationReport, setValidationReport] = useState<ReferenceValidationReport | null>(null)
  const [coachQuestion, setCoachQuestion] = useState('')
  const [coachResponse, setCoachResponse] = useState<CoachResponse | null>(null)
  const [coachProviderStatus, setCoachProviderStatus] = useState('确定性 fallback')
  const [activeDemo, setActiveDemo] = useState<DemoRequestSettings | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const midiInputRef = useRef<HTMLInputElement | null>(null)
  const importedXmlRef = useRef('')
  const importedSourceTypeRef = useRef<'musicxml' | 'mxl'>('musicxml')
  const savedRecordIdRef = useRef('')
  const sessionRecordIdRef = useRef('')
  const pausedForExitRef = useRef(false)
  const sessionStartedAtRef = useRef('')
  const followVisible = isExperimentalFeatureVisible('FEATURE_SCORE_FOLLOWING')
  const effectiveMode: ScorePracticeMode = mode === 'follow' && !followVisible ? 'wait' : mode
  const bpm = score?.defaultTempoBpm ?? 60
  const countInMs = countIn ? 4 * (60000 / bpm) : 0
  const initialRequestId = initialSegment?.requestId
  const initialScoreId = initialSegment?.scoreId
  const initialStartMeasure = initialSegment?.startMeasure
  const initialEndMeasure = initialSegment?.endMeasure
  const initialMode = initialSegment?.mode
  const initialHandMode = initialSegment?.handMode
  const initialTempoRatio = initialSegment?.tempoRatio
  const initialLoop = initialSegment?.loop
  const initialCountIn = initialSegment?.countIn

  const practice = useScorePractice(score, effectiveMode, {
    segment: { startMeasure, endMeasure, handMode },
    loop,
    countInMs,
    tempoRatio
  })

  const demoRequest: DemoRequestSettings = activeDemo ?? { startMeasure, endMeasure, handMode, tempoRatio, loop }
  const demoPlan = useMemo(() => (
    score ? buildPlaybackPlan(score, demoRequest) : null
  ), [demoRequest, score])
  const demo = usePlaybackDemo(demoPlan, pianoAudio)

  const refreshCoach = useCallback(async (question: string, allowProvider = true): Promise<void> => {
    if (!score) return
    const records = practiceRecordRepository.list()
    const mastery = computeScoreMastery(records)
    const ability = computeAbilityModelV2(records, mastery)
    const storedPlan = readDailyPlanV2()
    const plan = storedPlan ? {
      date: storedPlan.date,
      totalTargetMinutes: storedPlan.items.reduce((sum, item) => sum + item.minutes, 0),
      rationale: [],
      items: storedPlan.items
    } : null
    const currentPlanItem = storedPlan?.items.find((item) => {
      const match = /^score:(.+):(\d+)$/.exec(item.exerciseId)
      return Boolean(match && match[1] === score.title && Number(match[2]) >= startMeasure && Number(match[2]) <= endMeasure)
    }) ?? null
    const firstMeasure = score.parts[0]?.measures[0]
    const timeEvents = buildScoreTimeV2(score).events
      .filter((event) => event.measureNumber >= startMeasure && event.measureNumber <= endMeasure && event.midiPitch !== null)
    const context: CoachContext = {
      selectedMeasures: { start: startMeasure, end: endMeasure },
      recentRecords: practiceRecords.slice(0, 5),
      ability,
      plan,
      userQuestion: question,
      scoreSession: practice.facts.length > 0 ? {
        scoreId: score.title,
        segment: `${startMeasure}-${endMeasure}`,
        recordId: savedRecordIdRef.current,
        sessionId: savedRecordIdRef.current ? undefined : sessionRecordIdRef.current || undefined,
        mode: effectiveMode,
        facts: practice.facts.map((entry) => ({
          measure: entry.originalMeasure ?? entry.measure ?? null,
          beat: entry.originalBeat ?? entry.beat ?? null,
          hand: entry.hand === 'left' || entry.hand === 'right' || entry.hand === 'both' ? entry.hand : null,
          staff: entry.staff ?? null,
          outcome: entry.outcome,
          expectedMidi: entry.expectedMidi,
          actualMidi: entry.actualMidi,
          sourceEventIds: entry.sourceEventIds
        }))
      } : null,
      scoreRecords: records.filter((record) => record.scoreId === score.title).slice(0, 5),
      scoreMastery: mastery,
      currentPlanItem,
      scoreFacts: {
        title: score.title,
        timeSignature: `${firstMeasure?.timeBeats ?? 4}/${firstMeasure?.timeBeatType ?? 4}`,
        onsetPattern: [...new Set(timeEvents.map((event) => event.onsetInMeasure / 480 + 1))].slice(0, 32),
        harmonyLabels: score.parts.flatMap((part) => part.measures)
          .filter((measure) => measure.number >= startMeasure && measure.number <= endMeasure)
          .flatMap((measure) => measure.harmonies.map((harmony) => `${harmony.rootStep}${harmony.kindText ?? harmony.kind}`))
      }
    }
    const response = buildDeterministicCoachResponse(context)
    setCoachResponse(response)
    setCoachProviderStatus('确定性 fallback')
    const demo = response.demoRequests[0]
    if (demo) {
      setActiveDemo({
        startMeasure: demo.measureStart,
        endMeasure: demo.measureEnd,
        handMode: demo.handMode,
        tempoRatio: demo.tempoRatio,
        loop: demo.loop
      })
    }
    if (!allowProvider) return
    const settings = readAiSettings()
    if (!settings.enabled || !settings.config.endpoint || !settings.config.apiKey || !settings.config.model) return
    setCoachProviderStatus('AI provider 请求中…')
    const temporary: TemporarySessionEvidence | null = context.scoreSession?.sessionId ? {
      sessionId: context.scoreSession.sessionId,
      scoreId: score.title,
      facts: practice.facts.map((fact) => ({
        originalMeasure: fact.originalMeasure,
        originalBeat: fact.originalBeat,
        hand: fact.hand,
        staff: fact.staff,
        outcome: fact.outcome,
        sourceEventIds: fact.sourceEventIds
      }))
    } : null
    const providerResult = await requestScoreCoachFromProvider(
      context,
      response,
      createOpenAiCompatibleClient(settings.config),
      {
        getPracticeRecord: (id) => practiceRecordRepository.get(id),
        getTemporarySession: (id) => temporary?.sessionId === id ? temporary : null
      }
    )
    setCoachResponse(providerResult.response)
    setCoachProviderStatus(providerResult.providerUsed ? 'OpenAI-compatible provider' : `确定性 fallback${providerResult.error ? `：${providerResult.error}` : ''}`)
    const providerDemo = providerResult.response.demoRequests[0]
    if (providerDemo) {
      setActiveDemo({
        startMeasure: providerDemo.measureStart,
        endMeasure: providerDemo.measureEnd,
        handMode: providerDemo.handMode,
        tempoRatio: providerDemo.tempoRatio,
        loop: providerDemo.loop
      })
    }
  }, [effectiveMode, practice.facts, practiceRecords, score, startMeasure, endMeasure])

  useEffect(() => {
    void refreshCoach('', false)
  }, [refreshCoach])

  useEffect(() => {
    if (!savedMessage) return undefined
    const timer = window.setTimeout(() => setSavedMessage(''), 2400)
    return () => window.clearTimeout(timer)
  }, [savedMessage])

  useEffect(() => {
    const imported = initialScoreId ? getScoreImport(initialScoreId) : null
    if (initialScoreId && imported) {
      const document = loadMusicXmlDocument(imported.xml)
      const measureCount = document.parts[0]?.measures.length ?? 1
      importedXmlRef.current = imported.xml
      importedSourceTypeRef.current = imported.sourceType
      setScore(document)
      setScoreTitle(document.title)
      setImportTier(imported.tier)
      const nextStart = Math.min(Math.max(1, initialStartMeasure ?? 1), measureCount)
      setStartMeasure(nextStart)
      setEndMeasure(Math.min(Math.max(nextStart, initialEndMeasure ?? nextStart), measureCount))
      setMode(initialMode ?? 'wait')
      setHandMode(initialHandMode ?? 'both')
      setTempoRatio(initialTempoRatio ?? 1)
      setLoop(initialLoop ?? false)
      setCountIn(initialCountIn ?? false)
      return
    }
    const demo = loadMusicXmlDocument(DEMO_SCORE_XML)
    importedXmlRef.current = DEMO_SCORE_XML
    importedSourceTypeRef.current = 'musicxml'
    setScore(demo)
    setScoreTitle(demo.title)
    setImportTier('A')
    const state = readScoreImports()
    writeScoreImports(upsertScoreImport(state, {
      id: demo.title,
      title: demo.title,
      xml: DEMO_SCORE_XML,
      sourceType: 'musicxml',
      importedAt: new Date().toISOString(),
      tier: 'A'
    }))
  }, [
    initialCountIn,
    initialEndMeasure,
    initialHandMode,
    initialLoop,
    initialMode,
    initialRequestId,
    initialScoreId,
    initialStartMeasure,
    initialTempoRatio
  ])

  useEffect(() => {
    onPracticeRunningChange(practice.sessionActive)
  }, [onPracticeRunningChange, practice.sessionActive])

  useEffect(() => {
    if (exitPromptOpen) {
      if (practice.phase === 'running' || practice.phase === 'count-in') {
        pausedForExitRef.current = true
        practice.pause()
      }
    } else if (practice.phase === 'paused' && pausedForExitRef.current) {
      pausedForExitRef.current = false
      practice.resume()
    }
  }, [exitPromptOpen, practice.phase, practice.pause, practice.resume])

  useEffect(() => {
    if (practice.phase === 'finished' && score) {
      if (savedRecordIdRef.current) return
      const key = sessionRecordIdRef.current || `score-session-${Date.now()}`
      savedRecordIdRef.current = key
      const startedAt = sessionStartedAtRef.current || new Date().toISOString()
      const errorEvents = practice.facts
        .filter((entry) => entry.outcome === 'wrong' || entry.outcome === 'missing' || entry.outcome === 'extra' || entry.outcome === 'late' || entry.outcome === 'early')
        .map((entry, index) => ({
          id: `${key}-error-${index}`,
          type: String(entry.outcome),
          measure: entry.measure ?? null,
          beat: entry.originalBeat ?? entry.beat ?? null,
          expected: entry.expectedMidi.length === 1 ? entry.expectedMidi[0] : null,
          actual: entry.actualMidi,
          hand: (entry.hand ?? null) as 'left' | 'right' | 'both' | null,
          staff: entry.staff ?? null,
          timingErrorMs: entry.offsetMs ?? null,
          sourceEventIds: entry.sourceEventIds
        }))
      const record: PracticeRecordV2 = {
        id: key,
        schemaVersion: 2,
        practiceType: 'score',
        sourceType: importTier === 'A' || importTier === 'B' ? importedSourceTypeRef.current : 'midi',
        sourceId: score.title,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Math.round(practice.elapsedMs),
        tempo: bpm,
        mode: effectiveMode,
        handMode,
        scoreId: score.title,
        segment: `${startMeasure}-${endMeasure}`,
        metrics: [
          { key: 'accuracy', value: practice.report.accuracy, unit: '%' },
          { key: 'completionAccuracy', value: practice.report.completionAccuracy, unit: '%' },
          { key: 'errorCount', value: practice.report.errorCount },
          { key: 'isPerfect', value: practice.report.isPerfect ? 1 : 0 },
          { key: 'correct', value: practice.report.correct },
          { key: 'wrong', value: practice.report.wrong },
          { key: 'missing', value: practice.report.missing },
          { key: 'extra', value: practice.report.extra },
          { key: 'earlyCount', value: practice.report.earlyCount },
          { key: 'lateCount', value: practice.report.lateCount },
          ...(practice.report.averageSignedOffsetMs === null ? [] : [{ key: 'averageSignedOffsetMs', value: practice.report.averageSignedOffsetMs, unit: 'ms' }]),
          ...(practice.report.medianAbsoluteOffsetMs === null ? [] : [{ key: 'medianAbsoluteOffsetMs', value: practice.report.medianAbsoluteOffsetMs, unit: 'ms' }]),
          ...(practice.report.maxAbsoluteOffsetMs === null ? [] : [{ key: 'maxAbsoluteOffsetMs', value: practice.report.maxAbsoluteOffsetMs, unit: 'ms' }])
        ],
        errorEvents,
        evidenceRefs: errorEvents.map((event) => ({
          practiceRecordId: key,
          errorEventId: event.id,
          measure: event.measure,
          beat: event.beat,
          hand: event.hand,
          staff: event.staff,
          sourceEventId: event.sourceEventIds?.[0] ?? null
        })),
        perMeasureMetrics: practice.report.perMeasureMetrics.map((measure) => ({
          ...measure,
          evidenceRefs: errorEvents
            .filter((event) => event.measure === measure.measureNumber)
            .map((event) => ({
              practiceRecordId: key,
              errorEventId: event.id,
              measure: event.measure,
              beat: event.beat,
              hand: event.hand,
              staff: event.staff,
              sourceEventId: event.sourceEventIds?.[0] ?? null
            }))
        })),
        metadata: {
          importTier: importTier ?? 'A',
          referenceMidi: referenceMidiName || null,
          tempoRatio,
          sessionId: sessionRecordIdRef.current
        }
      }
      practiceRecordRepository.add(record)
    }
  }, [bpm, effectiveMode, handMode, importTier, practice.elapsedMs, practice.facts, practice.phase, practice.report, referenceMidiName, score, startMeasure, endMeasure, tempoRatio])

  useEffect(() => {
    if (practice.phase === 'count-in' || (practice.phase === 'running' && !sessionStartedAtRef.current)) {
      sessionStartedAtRef.current = new Date().toISOString()
    }
    if (practice.phase === 'idle' && savedRecordIdRef.current) {
      savedRecordIdRef.current = ''
      sessionRecordIdRef.current = ''
    }
  }, [practice.phase])

  const persistScoreImport = (title: string, xml: string, sourceType: 'musicxml' | 'mxl', tier: 'A' | 'B'): void => {
    const state = readScoreImports()
    writeScoreImports(upsertScoreImport(state, {
      id: title,
      title,
      xml,
      sourceType,
      importedAt: new Date().toISOString(),
      tier
    }))
  }

  const handleFile = async (file: File): Promise<void> => {
    setLoadError('')
    const extension = file.name.toLowerCase().split('.').pop() ?? ''

    try {
      if (extension === 'mxl') {
        const payload = await importMxlFile(file)
        const document = payload.document
        importedXmlRef.current = payload.xmlText
        importedSourceTypeRef.current = 'mxl'
        persistScoreImport(document.title, payload.xmlText, 'mxl', 'A')
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setStartMeasure(1)
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        setValidationReport(null)
        setReferenceMidiName('')
        return
      }

      if (extension === 'xml' || extension === 'musicxml') {
        const text = await file.text()
        const document = loadMusicXmlDocument(text)
        importedXmlRef.current = text
        importedSourceTypeRef.current = 'musicxml'
        persistScoreImport(document.title, text, 'musicxml', 'A')
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setStartMeasure(1)
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        setValidationReport(null)
        setReferenceMidiName('')
        return
      }

      if (extension === 'mid' || extension === 'midi') {
        const arrayBuffer = await file.arrayBuffer()
        parseMidiFile(new Uint8Array(arrayBuffer))
        setScore(null)
        importedXmlRef.current = ''
        setScoreTitle(`${file.name}（MIDI only）`)
        setImportTier('C')
        setValidationReport(null)
        setReferenceMidiName('')
        setLoadError('C 级导入：仅可播放/有限练习，不作为完整谱面语义')
        return
      }

      if (['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
        setScore(null)
        importedXmlRef.current = ''
        setScoreTitle(`${file.name}（图片材料）`)
        setImportTier('D')
        setValidationReport(null)
        setReferenceMidiName('')
        setLoadError('D 级导入：仅视觉辅助材料，默认不得作为严格音符判题 Ground Truth')
        return
      }

      setLoadError('不支持的文件类型（支持 .xml/.musicxml/.mxl/.mid/.midi/.png/.jpg/.pdf）')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '导入解析失败')
    }
  }

  const handleReferenceMidi = async (file: File): Promise<void> => {
    if (!score) return
    setLoadError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const smf = parseMidiFile(new Uint8Array(arrayBuffer))
      const scoreNotes = buildScoreReferenceNotes(score)
      const midiNotes = buildMidiReferenceNotes(smf)
      const report = validateScoreAgainstMidi(scoreNotes, midiNotes, { tempoBpm: bpm })
      setReferenceMidiName(file.name)
      setValidationReport(report)
      if (report.consistent) {
        setImportTier('B')
        if (importedXmlRef.current) {
          persistScoreImport(scoreTitle || score.title, importedXmlRef.current, importedSourceTypeRef.current, 'B')
        }
      } else {
        setLoadError('谱面与参考 MIDI 存在差异（MusicXML 未被修改），详见校验报告。')
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '参考 MIDI 解析失败')
    }
  }

  const saveSegment = (): void => {
    if (!score) return
    const now = new Date().toISOString()
    const segment: PracticeSegment = {
      id: `${score.title}-${startMeasure}-${endMeasure}-${handMode}-${Date.now()}`,
      scoreId: score.title,
      title: segmentName.trim() || `第 ${startMeasure}–${endMeasure} 小节`,
      startMeasure,
      endMeasure,
      tempo: bpm,
      tempoRatio,
      handMode,
      practiceMode: effectiveMode,
      loop,
      countIn,
      notes: '',
      createdAt: now,
      updatedAt: now
    }
    const next = upsertPracticeSegment(readPracticeSegments(), segment)
    writePracticeSegments(next)
    setSavedSegments(next.segments)
    setSegmentName('')
    setSavedMessage('片段已保存')
  }

  const applySavedSegment = (segment: PracticeSegment): void => {
    setStartMeasure(segment.startMeasure)
    setEndMeasure(segment.endMeasure)
    setHandMode(segment.handMode)
    setTempoRatio(segment.tempoRatio ?? 1)
    setLoop(segment.loop)
    setCountIn(segment.countIn)
    setMode(segment.practiceMode)
    setSegmentName(segment.title)
    setSavedMessage('已载入片段')
  }

  const deleteSavedSegment = (id: string): void => {
    const state = readPracticeSegments()
    const next = { version: 1 as const, segments: state.segments.filter((entry) => entry.id !== id) }
    writePracticeSegments(next)
    setSavedSegments(next.segments)
    setSavedMessage('片段已删除')
  }

  const handleStart = (): void => {
    sessionStartedAtRef.current = new Date().toISOString()
    sessionRecordIdRef.current = `score-session-${Date.now()}`
    savedRecordIdRef.current = ''
    practice.start()
  }

  const handleReset = (): void => {
    sessionStartedAtRef.current = ''
    practice.reset()
  }

  const weakestMeasures = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of practice.facts) {
      if (entry.outcome === 'correct' || entry.outcome === 'skip') continue
      const measure = entry.measure ?? '?'
      counts.set(String(measure), (counts.get(String(measure)) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
  }, [practice.facts])

  return (
    <section className="score-practice-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="Score Practice"
        title="自由乐谱练习"
        summary={scoreTitle ? `${scoreTitle} · ${effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'} 模式` : '导入 MusicXML / MXL / MIDI 或使用内置示例'}
      />

      <div className="practice-single-column">
        <section className="midi-panel score-practice-panel practice-primary-panel">
          <div className="score-practice-command-bar">
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
              <span className={`audio-status-badge status-${practice.sessionActive ? 'ready' : 'suspended'}`}>
                {practice.phase === 'running' ? '练习中' : practice.phase === 'paused' ? '已暂停' : practice.phase === 'count-in' ? '预备拍' : practice.phase === 'finished' ? '已完成' : '未开始'}
              </span>
            </div>

            <div className="score-practice-toolbar">
              <div className="segmented-control score-practice-mode">
                {(['wait', 'realtime', ...(followVisible ? ['follow'] : [])] as ScorePracticeMode[]).map((option) => (
                  <button
                    key={option}
                    className={effectiveMode === option ? 'is-active' : ''}
                    disabled={practice.sessionActive}
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
              <input
                ref={midiInputRef}
                className="score-practice-file"
                type="file"
                accept=".mid,.midi"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleReferenceMidi(file)
                  if (midiInputRef.current) midiInputRef.current.value = ''
                }}
              />
              <AppButton variant="ghost" onClick={() => midiInputRef.current?.click()} disabled={!score}>添加参考 MIDI（Tier B）</AppButton>
              <AppButton variant="ghost" onClick={() => {
                const demo = loadMusicXmlDocument(DEMO_SCORE_XML)
                importedXmlRef.current = DEMO_SCORE_XML
                importedSourceTypeRef.current = 'musicxml'
                persistScoreImport(demo.title, DEMO_SCORE_XML, 'musicxml', 'A')
                setScore(demo)
                setScoreTitle(demo.title)
                setImportTier('A')
                setStartMeasure(1)
                setEndMeasure(demo.parts[0]?.measures.length ?? 2)
                setValidationReport(null)
                setReferenceMidiName('')
                setLoadError('')
              }}>加载示例</AppButton>
            </div>
          </div>
          {importTier ? <p className="score-practice-tier">{TIER_LABELS[importTier]}</p> : null}
          {loadError ? <p className="practice-save-error">{loadError}</p> : null}
          {mode === 'follow' && !followVisible ? (
            <p className="practice-save-error">Experimental feature disabled（Follow 暂未开放）</p>
          ) : null}

          {score ? (
            <div className="score-sheet-wrap">
              <div className="score-sheet-heading">
                <strong>第 {startMeasure}–{endMeasure} 小节 · {handMode === 'both' ? '双手' : handMode === 'right' ? '右手' : '左手'}</strong>
                {practice.currentMeasure && (practice.phase === 'running' || practice.phase === 'paused' || practice.phase === 'count-in') ? (
                  <span>当前小节：第 {practice.currentMeasure} 小节</span>
                ) : null}
              </div>
              <ScoreSheetRenderer
                score={score}
                startMeasure={startMeasure}
                endMeasure={endMeasure}
                currentMeasure={
                  practice.phase === 'running' || practice.phase === 'paused' || practice.phase === 'count-in'
                    ? practice.currentMeasure
                    : null
                }
                currentSourceEventIds={practice.currentSourceEventIds}
                ariaLabel={`${scoreTitle} 第 ${startMeasure}–${endMeasure} 小节谱面`}
              />
              {validationReport ? (
                <div className={`reference-validation-report ${validationReport.consistent ? 'is-ok' : 'is-diff'}`}>
                  <strong>{validationReport.consistent ? 'Tier B：谱面与参考 MIDI 一致' : '谱面与参考 MIDI 存在差异'}</strong>
                  <span>匹配 {validationReport.matched} · 仅谱面 {validationReport.onlyScore.length} · 仅 MIDI {validationReport.onlyMidi.length} · 匹配率 {Math.round(validationReport.matchRatio * 100)}%{referenceMidiName ? ` · 参考文件：${referenceMidiName}` : ''}</span>
                </div>
              ) : referenceMidiName ? (
                <div className="reference-validation-report"><span>已选择参考 MIDI：{referenceMidiName}</span></div>
              ) : null}
            </div>
          ) : null}

          <div className="score-practice-control-bar">
            <div className="score-practice-selection">
              <label className="midi-field"><span>起始小节</span>
                <input className="midi-select" type="number" min="1" value={startMeasure} disabled={practice.sessionActive} onChange={(event) => setStartMeasure(Math.max(1, Number(event.target.value) || 1))} />
              </label>
              <label className="midi-field"><span>结束小节</span>
                <input className="midi-select" type="number" min={startMeasure} value={endMeasure} disabled={practice.sessionActive} onChange={(event) => setEndMeasure(Math.max(startMeasure, Number(event.target.value) || startMeasure))} />
              </label>
              <div className="tolerance-control"><span>手别</span><div className="segmented-control">
                {(['both', 'right', 'left'] as const).map((hand) => (
                  <button key={hand} className={handMode === hand ? 'is-active' : ''} disabled={practice.sessionActive} type="button" onClick={() => setHandMode(hand)}>
                    {hand === 'both' ? '双手' : hand === 'right' ? '右手' : '左手'}
                  </button>
                ))}
              </div></div>
              <div className="tolerance-control"><span>速度</span><div className="segmented-control">
                {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((ratio) => (
                  <button key={ratio} className={tempoRatio === ratio ? 'is-active' : ''} disabled={practice.sessionActive} type="button" onClick={() => setTempoRatio(ratio)}>
                    {Math.round(ratio * 100)}%
                  </button>
                ))}
              </div></div>
              <div className="tolerance-control"><span>选项</span><div className="segmented-control">
                <button className={loop ? 'is-active' : ''} disabled={practice.sessionActive} type="button" onClick={() => setLoop((value) => !value)}>循环</button>
                <button className={countIn ? 'is-active' : ''} disabled={practice.sessionActive} type="button" onClick={() => setCountIn((value) => !value)}>预备拍</button>
              </div></div>
            </div>

            <div className="practice-primary-actions">
              {practice.phase === 'idle' ? (
                <AppButton onClick={handleStart} disabled={!score}>开始练习</AppButton>
              ) : practice.phase === 'count-in' ? (
                <span role="status">预备拍倒数中…</span>
              ) : practice.phase === 'running' ? (
                <AppButton variant="secondary" onClick={practice.pause}>暂停</AppButton>
              ) : practice.phase === 'paused' ? (
                <AppButton onClick={practice.resume}>继续</AppButton>
              ) : practice.phase === 'finished' ? (
                <AppButton onClick={handleStart}>再练一次</AppButton>
              ) : null}
              {practice.sessionActive ? (
                <AppButton variant="ghost" onClick={practice.stop}>停止</AppButton>
              ) : null}
            </div>
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
                <strong>{practice.phase === 'finished' ? '曲谱完成' : practice.expectedMidi.length === 0 && practice.isRunning ? '当前为休止或延音，自动推进' : `开始后按 ${effectiveMode === 'wait' ? 'Wait' : effectiveMode === 'realtime' ? 'Realtime' : 'Follow'} 模式弹奏`}</strong>
              </div>
            )}
          </div>

          {practice.feedback ? (
            <p className={`practice-feedback-message ${practice.feedback === 'correct' ? 'result-correct' : 'result-wrong_note'}`}>
              {practice.feedback === 'correct' ? '正确' : '错误：请弹奏目标音'}
            </p>
          ) : null}

          <div className="score-practice-segment">
            <input
              aria-label="片段名称"
              value={segmentName}
              placeholder="保存为练习片段（可选）"
              onChange={(event) => setSegmentName(event.target.value)}
            />
            <AppButton variant="ghost" onClick={saveSegment} disabled={!score}>保存片段</AppButton>
          </div>
          {savedMessage ? <p className="practice-save-success" role="status">{savedMessage}</p> : null}
          {savedSegments.length > 0 && score ? (
            <div className="score-segment-list">
              <span className="score-segment-list__title">我的片段</span>
              {savedSegments
                .filter((segment) => segment.scoreId === score.title)
                .map((segment) => (
                  <div key={segment.id} className="score-segment-item">
                    <button type="button" onClick={() => applySavedSegment(segment)}>
                      <strong>{segment.title}</strong>
                      <span>第 {segment.startMeasure}–{segment.endMeasure} 小节 · {segment.handMode === 'both' ? '双手' : segment.handMode === 'right' ? '右手' : '左手'} · {segment.practiceMode} · {Math.round((segment.tempoRatio ?? 1) * 100)}%{segment.loop ? ' · 循环' : ''}</span>
                    </button>
                    <AppButton variant="ghost" onClick={() => deleteSavedSegment(segment.id)}>删除</AppButton>
                  </div>
                ))}
            </div>
          ) : null}
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
              <div><h3>AI 钢琴助理</h3><p>读取当前谱面、选区与本次练习事实，回答引用真实证据。当前：{coachProviderStatus}</p></div>
            </div>
            <p className="coach-summary">{coachResponse.summary}</p>
            {coachResponse.diagnoses.map((diagnosis) => (
              <p key={diagnosis.text} className="coach-diagnosis">{diagnosis.text}</p>
            ))}
            {coachResponse.recommendations.map((recommendation) => (
              <p key={recommendation.text} className="coach-recommendation">{recommendation.text}</p>
            ))}
            {coachResponse.uncertainty.length > 0 ? (
              <ul className="coach-uncertainty">
                {coachResponse.uncertainty.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            {coachResponse.demoRequests.length > 0 && demoPlan ? (
              <div className="score-demo-controls">
                <span>示范：第 {demoPlan.startMeasure}–{demoPlan.endMeasure} 小节，{demoPlan.handMode === 'both' ? '双手' : demoPlan.handMode === 'right' ? '右手' : '左手'}，{Math.round(demoPlan.tempoRatio * 100)}%</span>
                <AppButton variant="secondary" onClick={demo.isPlaying ? demo.stop : demo.play}>
                  {demo.isPlaying ? '停止示范' : '▶ 正确示范'}
                </AppButton>
                <AppButton variant="ghost" onClick={demo.panic}>Panic</AppButton>
                {activeDemo ? (
                  <AppButton variant="ghost" onClick={() => setActiveDemo(null)}>改用当前练习设置</AppButton>
                ) : null}
              </div>
            ) : null}
            <div className="coach-question-box">
              <input
                aria-label="向 AI 钢琴助理提问"
                value={coachQuestion}
                placeholder="问 AI 钢琴助理……"
                onChange={(event) => setCoachQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void refreshCoach(coachQuestion)
                    setCoachQuestion('')
                  }
                }}
              />
              <AppButton
                onClick={() => {
                  void refreshCoach(coachQuestion)
                  setCoachQuestion('')
                }}
              >
                发送
              </AppButton>
            </div>
            <div className="coach-quick-questions">
              {['为什么这里总弹错？', '节奏怎么数？', '先练哪只手？', '帮我安排这几小节的练法'].map((question) => (
                <button key={question} type="button" onClick={() => void refreshCoach(question)}>{question}</button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {practice.phase === 'finished' ? (
        <PracticeReportModal title="曲谱练习完成" onBack={handleReset} onRepeat={handleStart}>
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
