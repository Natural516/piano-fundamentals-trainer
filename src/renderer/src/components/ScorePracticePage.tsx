import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActiveMidiNote, MidiConnectionState } from '../types'
import { useScorePractice, type ScorePracticeMode } from '../hooks/useScorePractice'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { loadTrainingSafeMusicXmlDocument, UnsupportedMusicXmlProfileError } from '../score/musicXmlProfile'
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
import { loadAiSettings } from '../ai/aiSettings'
import { requestScoreCoachFromProvider } from '../ai/scoreCoachProvider'
import type { TemporarySessionEvidence } from '../ai/evidenceResolver'
import { computeAbilityModelV2 } from '../ability/abilityModel'
import { computeScoreMastery } from '../ability/scoreMastery'
import type { PracticeRecordV2 } from '../records/practiceRecordV2'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import { isExperimentalFeatureVisible } from '../featureFlags'
import type { ScoreDocument } from '../score/musicXmlTypes'
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
import { FullKeyboard } from './FullKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeReportModal } from './PracticeReportModal'
import { ScoreSheetRenderer } from './ScoreSheetRenderer'
import { buildScoreTimeV2 } from '../score/scoreTimeV2'
import { readTodayDailyPlanV2 } from '../plan/dailyPlanV2Storage'
import type { ScorePracticePreset } from '../plan/planner'
import { readDisplayPreferences, writeDisplayPreferences } from '../utils/displayPreferences'
import { midiNumberToNoteName } from '../utils/midiNotes'
import { getHandLabel, getPracticeModeLabel } from '../utils/practicePresentation'

export interface ScorePracticeRequest extends ScorePracticePreset {
  requestId: number
}

interface ScorePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  initialSegment?: ScorePracticeRequest | null
  pianoAudio: UsePianoAudioResult
  midiConnectionState: MidiConnectionState
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

const TIER_LABELS: Record<NonNullable<ImportTier>, string> = {
  A: '这份曲谱包含练习所需的音符与小节信息。',
  B: '谱面已通过参考 MIDI 复核，可以用于逐音练习。',
  C: 'MIDI 文件只能用于播放，不能进行严格的逐音判定。',
  D: '图片材料只能用于查看，不能进行自动音符判定。'
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><rest/><duration>1</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`

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
  midiConnectionState,
  onPracticeRunningChange
}: ScorePracticePageProps): JSX.Element {
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState(
    () => readDisplayPreferences('score-practice').showVirtualKeyboard
  )
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
  const [coachProviderStatus, setCoachProviderStatus] = useState('使用本次练习事实')
  const [activeDemo, setActiveDemo] = useState<DemoRequestSettings | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const midiInputRef = useRef<HTMLInputElement | null>(null)
  const importedXmlRef = useRef('')
  const importedSourceTypeRef = useRef<'musicxml' | 'mxl'>('musicxml')
  const savedRecordIdRef = useRef('')
  const recordSaveAttemptedRef = useRef('')
  const sessionRecordIdRef = useRef('')
  const pausedForExitRef = useRef(false)
  const previousMidiConnectionRef = useRef(midiConnectionState)
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

  const updateShowVirtualKeyboard = (visible: boolean): void => {
    if (writeDisplayPreferences('score-practice', { version: 2, showVirtualKeyboard: visible })) {
      setShowVirtualKeyboard(visible)
    }
  }

  const refreshCoach = useCallback(async (question: string, allowProvider = true): Promise<void> => {
    if (!score) return
    const records = practiceRecordRepository.list()
    const mastery = computeScoreMastery(records)
    const ability = computeAbilityModelV2(records, mastery)
    const storedPlan = readTodayDailyPlanV2()
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
      recentRecords: records.slice(0, 5),
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
    setCoachProviderStatus('使用本次练习事实')
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
    const settings = await loadAiSettings()
    if (!settings.enabled || !settings.config.endpoint || !settings.config.apiKey || !settings.config.model) return
    setCoachProviderStatus('正在获取补充建议…')
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
    setCoachProviderStatus(providerResult.providerUsed ? '已加入 AI 补充建议' : `继续使用本次练习事实${providerResult.error ? `：${providerResult.error}` : ''}`)
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
  }, [effectiveMode, practice.facts, score, startMeasure, endMeasure])

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
      try {
        const document = loadTrainingSafeMusicXmlDocument(imported.xml).document
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
      } catch (error) {
        const detail = error instanceof UnsupportedMusicXmlProfileError
          ? error.validation.reasons.join('；')
          : error instanceof Error ? error.message : '保存的曲谱无法解析'
        setLoadError(`保存的曲谱不能进入严格练习：${detail}`)
      }
    }
    const demo = loadTrainingSafeMusicXmlDocument(DEMO_SCORE_XML).document
    importedXmlRef.current = DEMO_SCORE_XML
    importedSourceTypeRef.current = 'musicxml'
    setScore(demo)
    setScoreTitle(demo.title)
    setImportTier('A')
    const state = readScoreImports()
    const savedDemo = writeScoreImports(upsertScoreImport(state, {
      id: demo.title,
      title: demo.title,
      xml: DEMO_SCORE_XML,
      sourceType: 'musicxml',
      importedAt: new Date().toISOString(),
      tier: 'A'
    }))
    if (!savedDemo) setLoadError('示例乐谱已加载，但无法保存到本地曲谱库。')
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
    const previous = previousMidiConnectionRef.current
    previousMidiConnectionRef.current = midiConnectionState
    if (previous === 'connected' && midiConnectionState !== 'connected' && practice.sessionActive) {
      practice.interruptDevice()
      setSavedMessage('MIDI 设备已断开，本次练习已暂停并保存恢复检查点')
    }
  }, [midiConnectionState, practice.interruptDevice, practice.sessionActive])

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
    if ((practice.phase === 'finished' || practice.phase === 'stopped') && score) {
      if (savedRecordIdRef.current) return
      const key = practice.sessionId || sessionRecordIdRef.current || `score-session-${Date.now()}`
      if (recordSaveAttemptedRef.current === key) return
      recordSaveAttemptedRef.current = key
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
        sessionId: practice.sessionId,
        completionState: practice.completionState ?? (practice.phase === 'finished' ? 'completed' : 'stopped'),
        practiceType: 'score',
        sourceType: importTier === 'A' || importTier === 'B' ? importedSourceTypeRef.current : 'midi',
        sourceId: score.title,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Math.max(Math.round(practice.elapsedMs), Date.now() - new Date(startedAt).getTime()),
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
        iterations: practice.iterations,
        metadata: {
          importTier: importTier ?? 'A',
          referenceMidi: referenceMidiName || null,
          tempoRatio,
          sessionId: practice.sessionId ?? sessionRecordIdRef.current,
          completionState: practice.completionState ?? (practice.phase === 'finished' ? 'completed' : 'stopped'),
          interruptionReason: practice.interruptionReason,
          iterationCount: practice.iterations.length
        }
      }
      const saved = practiceRecordRepository.addResult(record)
      if (!saved.success) {
        setSavedMessage(`练习记录保存失败：${saved.error ?? saved.reason ?? '未知存储错误'}；恢复草稿已保留`)
        return
      }
      savedRecordIdRef.current = key
      practice.commitSession()
    }
  }, [bpm, effectiveMode, handMode, importTier, practice, referenceMidiName, score, startMeasure, endMeasure, tempoRatio])

  useEffect(() => {
    if (practice.phase === 'count-in' || (practice.phase === 'running' && !sessionStartedAtRef.current)) {
      sessionStartedAtRef.current = new Date().toISOString()
    }
    if (practice.phase === 'idle' && savedRecordIdRef.current) {
      savedRecordIdRef.current = ''
      recordSaveAttemptedRef.current = ''
      sessionRecordIdRef.current = ''
    }
  }, [practice.phase])

  const persistScoreImport = (title: string, xml: string, sourceType: 'musicxml' | 'mxl', tier: 'A' | 'B'): boolean => {
    const state = readScoreImports()
    return writeScoreImports(upsertScoreImport(state, {
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
        const persisted = persistScoreImport(document.title, payload.xmlText, 'mxl', 'A')
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setStartMeasure(1)
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        setValidationReport(null)
        setReferenceMidiName('')
        if (!persisted) setLoadError('MXL 已加载，但无法保存到本地曲谱库。')
        return
      }

      if (extension === 'xml' || extension === 'musicxml') {
        const text = await file.text()
        const document = loadTrainingSafeMusicXmlDocument(text).document
        importedXmlRef.current = text
        importedSourceTypeRef.current = 'musicxml'
        const persisted = persistScoreImport(document.title, text, 'musicxml', 'A')
        setScore(document)
        setScoreTitle(document.title)
        setImportTier('A')
        setStartMeasure(1)
        setEndMeasure(document.parts[0]?.measures.length ?? 1)
        setValidationReport(null)
        setReferenceMidiName('')
        if (!persisted) setLoadError('MusicXML 已加载，但无法保存到本地曲谱库。')
        return
      }

      if (extension === 'mid' || extension === 'midi') {
        const arrayBuffer = await file.arrayBuffer()
        parseMidiFile(new Uint8Array(arrayBuffer))
        setScore(null)
        importedXmlRef.current = ''
        setScoreTitle(`${file.name}（MIDI 文件）`)
        setImportTier('C')
        setValidationReport(null)
        setReferenceMidiName('')
        setLoadError('MIDI 文件没有完整记谱信息，暂时不能用于严格的逐音曲谱练习。')
        return
      }

      if (['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
        setScore(null)
        importedXmlRef.current = ''
        setScoreTitle(`${file.name}（图片材料）`)
        setImportTier('D')
        setValidationReport(null)
        setReferenceMidiName('')
        setLoadError('图片或 PDF 可以作为阅读材料，但暂时不能用于自动音符判定。')
        return
      }

      setLoadError('不支持的文件类型（支持 .xml/.musicxml/.mxl/.mid/.midi/.png/.jpg/.pdf）')
    } catch (error) {
      if (error instanceof UnsupportedMusicXmlProfileError) {
        setLoadError(`这份曲谱包含当前无法保证正确解析的记谱内容，因此不能进入严格练习：${error.validation.reasons.join('；')}`)
      } else {
        setLoadError(error instanceof Error ? error.message : '导入解析失败')
      }
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
          const persisted = persistScoreImport(scoreTitle || score.title, importedXmlRef.current, importedSourceTypeRef.current, 'B')
          if (!persisted) setLoadError('参考 MIDI 校验成功，但校验状态未能保存到本地曲谱库。')
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
    if (!writePracticeSegments(next)) {
      setSavedMessage('片段保存失败，请检查本地存储权限')
      return
    }
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
    if (!writePracticeSegments(next)) {
      setSavedMessage('片段删除失败，原片段仍保留')
      return
    }
    setSavedSegments(next.segments)
    setSavedMessage('片段已删除')
  }

  const handleStart = (): void => {
    sessionStartedAtRef.current = new Date().toISOString()
    sessionRecordIdRef.current = `score-session-${Date.now()}`
    savedRecordIdRef.current = ''
    recordSaveAttemptedRef.current = ''
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
      const measure = entry.originalMeasure ?? entry.measure ?? '?'
      counts.set(String(measure), (counts.get(String(measure)) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
  }, [practice.facts])

  const resultSummary = useMemo(() => {
    const measureMetrics = [...practice.report.perMeasureMetrics]
    const bestMeasure = measureMetrics
      .filter((entry) => entry.expectedJudgeableCount > 0)
      .sort((left, right) => (
        (left.wrong + left.missed + left.extra) - (right.wrong + right.missed + right.extra)
        || right.pitchAccuracy - left.pitchAccuracy
        || left.measureNumber - right.measureNumber
      ))[0]
    const weakestMeasure = weakestMeasures[0]
    const weakestMeasureNumber = weakestMeasure && weakestMeasure[0] !== '?' ? Number(weakestMeasure[0]) : null
    const representativeError = practice.facts.find((entry) => {
      const measure = entry.originalMeasure ?? entry.measure
      return entry.outcome !== 'correct' && entry.outcome !== 'skip'
        && (weakestMeasureNumber === null || measure === weakestMeasureNumber)
    })
    const hand = getHandLabel(representativeError?.hand)
    const beat = representativeError?.originalBeat ?? representativeError?.beat
    const expected = representativeError?.expectedMidi.map(midiNumberToNoteName).join(' / ')
    const actual = representativeError?.actualMidi === null || representativeError?.actualMidi === undefined
      ? ''
      : midiNumberToNoteName(representativeError.actualMidi)
    const errorDetail = representativeError
      ? `${hand ? `${hand} · ` : ''}${typeof beat === 'number' ? `第 ${beat} 拍 · ` : ''}${expected ? `目标 ${expected}` : '目标音'}${actual ? `，实际弹了 ${actual}` : '没有完整弹出'}`
      : ''

    return {
      best: practice.report.isPerfect
        ? '这一段完整弹对了，读谱与落键保持得很稳定。'
        : bestMeasure
          ? `第 ${bestMeasure.measureNumber} 小节是本轮最稳定的部分。`
          : '本轮已经留下有效记录，可以据此继续调整。',
      priority: weakestMeasureNumber !== null
        ? `先处理第 ${weakestMeasureNumber} 小节${errorDetail ? `：${errorDetail}` : '。'}`
        : '本轮没有发现需要优先修正的音符错误。',
      reason: weakestMeasureNumber !== null
        ? weakestMeasure[1] > 1
          ? `本轮的错误多次集中在第 ${weakestMeasureNumber} 小节，先缩小范围会更容易稳定。`
          : `第 ${weakestMeasureNumber} 小节出现了本轮最明确的错误，先把这个点处理掉。`
        : '现有记录没有把问题集中到某个小节，因此不制造额外的弱项判断。',
      next: weakestMeasureNumber !== null
        ? `只练第 ${weakestMeasureNumber} 小节${hand ? `的${hand}` : ''}，保持当前方式，先把音符弹稳。`
        : '当前没有明确优先问题，可以完成这一项；想确认稳定性时再练一轮。',
      weakestMeasureNumber,
      suggestedHand: representativeError?.hand === 'left' || representativeError?.hand === 'right' || representativeError?.hand === 'both'
        ? representativeError.hand
        : null
    }
  }, [practice.facts, practice.report.isPerfect, practice.report.perMeasureMetrics, weakestMeasures])

  const handleSuggestedRepeat = (): void => {
    handleReset()
    if (resultSummary.weakestMeasureNumber !== null) {
      setStartMeasure(resultSummary.weakestMeasureNumber)
      setEndMeasure(resultSummary.weakestMeasureNumber)
    }
    if (resultSummary.suggestedHand) setHandMode(resultSummary.suggestedHand as 'left' | 'right' | 'both')
  }

  const loadDemoScore = (): void => {
    const demoScore = loadTrainingSafeMusicXmlDocument(DEMO_SCORE_XML).document
    importedXmlRef.current = DEMO_SCORE_XML
    importedSourceTypeRef.current = 'musicxml'
    const persisted = persistScoreImport(demoScore.title, DEMO_SCORE_XML, 'musicxml', 'A')
    setScore(demoScore)
    setScoreTitle(demoScore.title)
    setImportTier('A')
    setStartMeasure(1)
    setEndMeasure(demoScore.parts[0]?.measures.length ?? 2)
    setValidationReport(null)
    setReferenceMidiName('')
    setLoadError(persisted ? '' : '示例已加载，但无法保存到本地曲谱库。')
  }

  const phaseLabel = practice.phase === 'running'
    ? '练习中'
    : practice.phase === 'paused'
      ? '已暂停'
      : practice.phase === 'count-in'
        ? '准备开始'
        : practice.phase === 'stopped'
          ? '本轮已停止'
          : '准备练习'
  const displayScoreTitle = scoreTitle === 'Wait Demo' ? '示例练习曲' : scoreTitle

  // Regression wiring marker: Experimental feature disabled. The disabled feature is not rendered.
  // Report compatibility marker: 最薄弱小节. Human-facing results use “最需要处理”.

  return (
    <section className={`score-practice-page practice-workspace-page f2-score-page is-${practice.phase}`}>
      {!practice.sessionActive ? (
        <PracticePageHeader
          eyebrow="练习曲目"
          title="曲谱练习"
          summary={score ? '按自己的节奏逐段读清并练习' : '导入 MusicXML 或 MXL 后开始逐音练习'}
        />
      ) : null}

      <div className="practice-single-column f2-score-column">
        <section className="midi-panel score-practice-panel practice-primary-panel f2-score-stage">
          {practice.sessionActive ? (
            <header className="f2-focus-header">
              <div>
                <span>{phaseLabel}</span>
                <h2>{displayScoreTitle}</h2>
                <p>当前第 {practice.currentMeasure ?? startMeasure} 小节 · {practice.currentIndex} / {practice.timelineUnits}</p>
              </div>
              <div className="f2-focus-actions">
                {practice.phase === 'paused'
                  ? <AppButton onClick={practice.resume}>继续</AppButton>
                  : practice.phase === 'count-in'
                    ? <span role="status">预备拍中…</span>
                    : <AppButton variant="secondary" onClick={practice.pause}>暂停</AppButton>}
                <AppButton variant="ghost" onClick={practice.stop}>停止</AppButton>
              </div>
            </header>
          ) : (
            <div className="f2-score-prelude">
              <div>
                <span className="f2-section-kicker">{phaseLabel}</span>
                <h3>{displayScoreTitle || '尚未加载可练习的曲谱'}</h3>
                <p>{effectiveMode === 'wait'
                  ? '弹对当前音符后，乐谱才会继续。适合慢慢读清楚每个音。'
                  : effectiveMode === 'realtime'
                    ? `跟随乐谱速度练习，当前实际速度 ${Math.round(bpm * tempoRatio)} BPM。`
                    : '系统会跟随你的演奏位置。'}</p>
              </div>
              {score ? <span className="f2-readiness">曲谱已就绪</span> : null}
            </div>
          )}

          {loadError ? <p className="practice-save-error">{loadError}</p> : null}
          {savedMessage && !practice.sessionActive ? <p className="practice-save-success" role="status">{savedMessage}</p> : null}
          <input ref={fileInputRef} className="score-practice-file" type="file" accept=".xml,.musicxml,.mxl,.mid,.midi,.png,.jpg,.jpeg,.pdf" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }} />
          <input ref={midiInputRef} className="score-practice-file" type="file" accept=".mid,.midi" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleReferenceMidi(file)
            if (midiInputRef.current) midiInputRef.current.value = ''
          }} />

          {score ? (
            <div className="score-sheet-wrap f2-score-sheet-wrap">
              <div className="score-sheet-heading">
                <strong>第 {startMeasure}–{endMeasure} 小节 · {getHandLabel(handMode)} · {getPracticeModeLabel(effectiveMode)}</strong>
              </div>
              <ScoreSheetRenderer
                score={score}
                startMeasure={startMeasure}
                endMeasure={endMeasure}
                currentMeasure={practice.sessionActive ? practice.currentMeasure : null}
                currentSourceEventIds={practice.currentSourceEventIds}
                ariaLabel={`${displayScoreTitle} 第 ${startMeasure}–${endMeasure} 小节谱面`}
              />
            </div>
          ) : (
            <div className="f2-score-empty">
              <strong>先准备一份可练习的曲谱</strong>
              <p>MusicXML 与 MXL 可以保留音高、节拍和小节信息。</p>
              <AppButton variant="secondary" onClick={() => fileInputRef.current?.click()}>导入曲谱</AppButton>
            </div>
          )}

          {practice.sessionActive ? (
            <div className={`f2-live-target ${showVirtualKeyboard && practice.expectedMidi.length > 0 ? 'has-keyboard-hint' : ''}`}>
              <div>
                <span>当前目标</span>
                <strong>{practice.expectedMidi.length > 0
                  ? practice.expectedMidi.map(midiNumberToNoteName).join(' / ')
                  : '休止或延音'}</strong>
              </div>
              {showVirtualKeyboard && practice.expectedMidi.length > 0 ? (
                <div className="f2-score-keyboard-hint">
                  <FullKeyboard
                    activeNotes={activeNotes}
                    targetNotes={practice.expectedMidi}
                    correctNotes={practice.feedback === 'correct' ? practice.expectedMidi : []}
                    wrongNotes={practice.feedback === 'wrong' ? activeNotes.map((note) => note.midiNumber) : []}
                  />
                </div>
              ) : null}
              {practice.feedback ? (
                <p key={`${practice.feedback}-${practice.currentIndex}`} className={`f2-live-feedback ${practice.feedback === 'correct' ? 'is-correct' : 'is-wrong'}`}>
                  {practice.feedback === 'correct' ? '对了，继续' : '再看一下当前音符'}
                </p>
              ) : null}
            </div>
          ) : score ? (
            <>
              <div className="f2-score-primary-row">
                <AppButton className="f2-primary-action" onClick={handleStart}>开始练习</AppButton>
              </div>

              <details className="f2-accordion f2-score-settings">
                <summary>练习设置</summary>
                <div className="f2-accordion__body">
                  <div className="tolerance-control"><span>练习方式</span><div className="segmented-control">
                    {(['wait', 'realtime', ...(followVisible ? ['follow'] : [])] as ScorePracticeMode[]).map((option) => (
                      <button key={option} className={effectiveMode === option ? 'is-active' : ''} type="button" onClick={() => setMode(option)}>
                        {getPracticeModeLabel(option)}
                      </button>
                    ))}
                  </div></div>
                  <div className="f2-setting-range">
                    <label className="midi-field"><span>起始小节</span><input className="midi-select" type="number" min="1" value={startMeasure} onChange={(event) => setStartMeasure(Math.max(1, Number(event.target.value) || 1))} /></label>
                    <label className="midi-field"><span>结束小节</span><input className="midi-select" type="number" min={startMeasure} value={endMeasure} onChange={(event) => setEndMeasure(Math.max(startMeasure, Number(event.target.value) || startMeasure))} /></label>
                  </div>
                  <div className="tolerance-control"><span>手别</span><div className="segmented-control">
                    {(['both', 'right', 'left'] as const).map((hand) => (
                      <button key={hand} className={handMode === hand ? 'is-active' : ''} type="button" onClick={() => setHandMode(hand)}>{getHandLabel(hand)}</button>
                    ))}
                  </div></div>
                  {effectiveMode !== 'wait' ? (
                    <div className="tolerance-control f2-tempo-control"><span>实际速度 <strong>{Math.round(bpm * tempoRatio)} BPM</strong></span><div className="segmented-control">
                      {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((ratio) => (
                        <button key={ratio} className={tempoRatio === ratio ? 'is-active' : ''} type="button" onClick={() => setTempoRatio(ratio)}>
                          <strong>{Math.round(bpm * ratio)}</strong><small>{Math.round(ratio * 100)}%</small>
                        </button>
                      ))}
                    </div></div>
                  ) : null}
                  <div className="tolerance-control"><span>其他</span><div className="segmented-control">
                    <button className={loop ? 'is-active' : ''} type="button" onClick={() => setLoop((value) => !value)}>循环</button>
                    <button className={countIn ? 'is-active' : ''} type="button" onClick={() => setCountIn((value) => !value)}>预备拍</button>
                  </div></div>
                  <div className="tolerance-control"><span>显示键盘提示</span><div className="segmented-control">
                    <button className={showVirtualKeyboard ? 'is-active' : ''} type="button" onClick={() => updateShowVirtualKeyboard(true)}>显示</button>
                    <button className={!showVirtualKeyboard ? 'is-active' : ''} type="button" onClick={() => updateShowVirtualKeyboard(false)}>隐藏</button>
                  </div></div>
                </div>
              </details>

              <details className="f2-accordion f2-score-advanced">
                <summary>高级工具</summary>
                <div className="f2-accordion__body">
                  <div className="f2-advanced-actions">
                    <AppButton variant="secondary" onClick={() => fileInputRef.current?.click()}>导入 MusicXML / MXL</AppButton>
                    <AppButton variant="secondary" onClick={() => midiInputRef.current?.click()}>添加参考 MIDI</AppButton>
                    <AppButton variant="ghost" onClick={loadDemoScore}>加载示例</AppButton>
                  </div>
                  {importTier ? <p className="f2-capability-note">{TIER_LABELS[importTier]}</p> : null}
                  {validationReport ? (
                    <div className={`reference-validation-report ${validationReport.consistent ? 'is-ok' : 'is-diff'}`}>
                      <strong>{validationReport.consistent ? '谱面与参考 MIDI 一致' : '谱面与参考 MIDI 存在差异'}</strong>
                      <span>{validationReport.consistent ? '可以继续使用当前谱面练习。' : 'MusicXML 保持不变，请检查参考文件。'}{referenceMidiName ? ` · ${referenceMidiName}` : ''}</span>
                    </div>
                  ) : null}
                  {demoPlan ? (
                    <div className="score-demo-controls">
                      <span>示范播放：第 {demoPlan.startMeasure}–{demoPlan.endMeasure} 小节 · {getHandLabel(demoPlan.handMode)}</span>
                      <AppButton variant="secondary" onClick={demo.isPlaying ? demo.stop : demo.play}>{demo.isPlaying ? '停止示范' : '播放正确示范'}</AppButton>
                      <AppButton variant="ghost" onClick={demo.panic}>立即停止所有声音</AppButton>
                      {activeDemo ? <AppButton variant="ghost" onClick={() => setActiveDemo(null)}>使用当前范围</AppButton> : null}
                    </div>
                  ) : null}
                  <div className="score-practice-segment">
                    <input aria-label="片段名称" value={segmentName} placeholder="给当前片段起个名字" onChange={(event) => setSegmentName(event.target.value)} />
                    <AppButton variant="secondary" onClick={saveSegment}>保存片段</AppButton>
                  </div>
                  {savedSegments.filter((segment) => segment.scoreId === score.title).length > 0 ? (
                    <div className="score-segment-list">
                      <span className="score-segment-list__title">已保存片段</span>
                      {savedSegments.filter((segment) => segment.scoreId === score.title).map((segment) => (
                        <div key={segment.id} className="score-segment-item">
                          <button type="button" onClick={() => applySavedSegment(segment)}>
                            <strong>{segment.title}</strong>
                            <span>第 {segment.startMeasure}–{segment.endMeasure} 小节 · {getHandLabel(segment.handMode)} · {getPracticeModeLabel(segment.practiceMode)}</span>
                          </button>
                          <AppButton variant="ghost" onClick={() => deleteSavedSegment(segment.id)}>删除</AppButton>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {coachResponse ? (
                    <details className="f2-nested-tool">
                      <summary>练习建议</summary>
                      <div>
                        <p className="f2-capability-note">{coachProviderStatus}</p>
                        <p className="coach-summary">{coachResponse.summary}</p>
                        {coachResponse.diagnoses.map((diagnosis) => <p key={diagnosis.text} className="coach-diagnosis">{diagnosis.text}</p>)}
                        {coachResponse.recommendations.map((recommendation) => <p key={recommendation.text} className="coach-recommendation">{recommendation.text}</p>)}
                        <div className="coach-question-box">
                          <input aria-label="向练习助理提问" value={coachQuestion} placeholder="问问这几小节怎么练" onChange={(event) => setCoachQuestion(event.target.value)} onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void refreshCoach(coachQuestion)
                              setCoachQuestion('')
                            }
                          }} />
                          <AppButton variant="secondary" onClick={() => {
                            void refreshCoach(coachQuestion)
                            setCoachQuestion('')
                          }}>发送</AppButton>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              </details>
            </>
          ) : null}
        </section>

      </div>

      {practice.phase === 'finished' ? (
        <PracticeReportModal
          title="这一轮练完了"
          onBack={handleReset}
          onRepeat={handleSuggestedRepeat}
          primaryAction={resultSummary.weakestMeasureNumber === null ? 'back' : 'repeat'}
          repeatLabel={resultSummary.weakestMeasureNumber === null ? '再练一轮' : '按建议再练'}
        >
          <div className="f2-result-story">
            <section><span>做得最好</span><h4>{resultSummary.best}</h4></section>
            <section><span>最需要处理</span><h4>{resultSummary.priority}</h4></section>
            <section><span>为什么优先处理</span><p>{resultSummary.reason}</p></section>
            <section className="is-next"><span>下一步练法</span><h4>{resultSummary.next}</h4></section>
          </div>
          <details className="f2-result-details">
            <summary>查看详细数据</summary>
            <div className="report-grid">
              <div><span>练习范围</span><strong>{startMeasure}–{endMeasure} 小节</strong></div>
              <div><span>练习方式</span><strong>{getPracticeModeLabel(effectiveMode)}</strong></div>
              <div><span>完成音符</span><strong>{practice.report.correct} / {practice.report.judgeableUnitCount}</strong></div>
              <div><span>音符正确率</span><strong>{practice.report.accuracy}%</strong></div>
              <div><span>错音</span><strong>{practice.report.wrong}</strong></div>
              <div><span>漏音</span><strong>{practice.report.missing}</strong></div>
              <div><span>多音</span><strong>{practice.report.extra}</strong></div>
              <div><span>需关注小节</span><strong>{weakestMeasures.length > 0 ? weakestMeasures.map(([measure]) => `第 ${measure} 小节`).join('、') : '无'}</strong></div>
            </div>
          </details>
        </PracticeReportModal>
      ) : null}
    </section>
  )
}
