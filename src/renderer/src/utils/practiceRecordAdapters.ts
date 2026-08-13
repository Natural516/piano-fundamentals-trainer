import type { SightReadingReport } from '../hooks/useSightReadingPractice'
import { STAFF_MODE_LABELS } from './sightReadingNotes'
import type {
  ChordContentCategory,
  ChordInputStyle,
  ChordInversionMode,
  ChordPracticeReport,
  ChordQualityFilter,
  SeventhChordQualityFilter
} from './chordTypes'
import type { CoordinationPracticeReport } from './coordinationTypes'
import type { ToleranceLevel } from './practiceTypes'
import type { PracticeSessionRecord, PracticeSessionTiming } from './practiceRecordTypes'
import type { RhythmPracticeReport } from './rhythmTypes'
import type { MajorScaleKey, ScalePracticeMode, ScalePracticeReport } from './scaleTypes'
import type { PracticeDifficulty } from './practiceContentTypes'
import { getMajorKeySignature } from './musicKeySignatures'
import { getRangeDescription } from './sightReadingNotes'

function createBaseRecord(
  timing: PracticeSessionTiming,
  input: Pick<
    PracticeSessionRecord,
    'module' | 'moduleName' | 'title' | 'subtitle' | 'totalEvents' | 'correctEvents' | 'accuracy'
  >
): Omit<PracticeSessionRecord, 'settings' | 'details' | 'mistakes'> {
  return {
    ...timing,
    id: timing.id,
    schemaVersion: 1,
    status: 'completed',
    wrongNoteCount: 0,
    missingNoteCount: 0,
    extraNoteCount: 0,
    earlyCount: 0,
    lateCount: 0,
    restErrorCount: 0,
    syncWarningCount: 0,
    ...input
  }
}

export function createSightReadingRecord(input: {
  timing: PracticeSessionTiming
  report: SightReadingReport
  showNoteName: boolean
}): PracticeSessionRecord {
  const { report } = input
  const noteCountLabel = report.noteCount === 1 ? '单音' : report.noteCount === 2 ? '双音' : '三音'

  return {
    ...createBaseRecord(input.timing, {
      module: 'sight-reading',
      moduleName: '识谱练习',
      title: `${STAFF_MODE_LABELS[report.staffMode]} · ${noteCountLabel}识别`,
      subtitle: `${report.keyName}识谱`,
      totalEvents: report.completedQuestions,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrong,
    missingNoteCount: report.timeout,
    keySignature: report.keySignature,
    settings: {
      staffMode: report.staffMode,
      rangeMode: 'fixed',
      noteCount: report.noteCount,
      keySignature: report.keySignature,
      keyName: report.keyName,
      notePoolMode: report.notePoolMode,
      questionCount: report.totalQuestions,
      answerTimeLimitSeconds: report.answerTimeLimitSeconds,
      noteNameVisible: input.showNoteName
    },
    details: {
      correctCount: report.correct,
      wrongCount: report.wrong,
      timeoutCount: report.timeout,
      averageReactionMs: report.averageReactionMs,
      highestStreak: report.bestStreak,
      hardestNote: report.mostWrongNote,
      mostWrongNote: report.mostWrongNote,
      mostTimedOutNote: report.mostTimedOutNote,
      weakestNote: report.weakestNote,
      fastestReactionMs: report.fastestReactionMs,
      slowestReactionMs: report.slowestReactionMs,
      fixedRange: getRangeDescription(report.staffMode)
    },
    mistakes: [
      ...report.wrongNoteCounts
        .filter((entry) => entry.count > 0)
        .map((entry) => ({ label: entry.noteName, count: entry.count, type: 'wrong_note' })),
      ...report.timeoutNoteCounts
        .filter((entry) => entry.count > 0)
        .map((entry) => ({ label: entry.noteName, count: entry.count, type: 'timeout' }))
    ]
  }
}

export function createRhythmRecord(input: {
  timing: PracticeSessionTiming
  report: RhythmPracticeReport
  patternId: string
  patternName: string
  bpm: number
  tolerance: ToleranceLevel
  difficulty: PracticeDifficulty
}): PracticeSessionRecord {
  const { report } = input
  const extraNoteCount = report.extraNote + report.extraInput

  return {
    ...createBaseRecord(input.timing, {
      module: 'rhythm',
      moduleName: '节奏与切分',
      title: input.patternName,
      subtitle: `4/4 拍 · ${input.bpm} BPM`,
      totalEvents: report.totalTargets + report.extraInput,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrongNote,
    missingNoteCount: report.missingNote,
    extraNoteCount,
    earlyCount: report.early,
    lateCount: report.late,
    restErrorCount: report.restError,
    averageOffsetMs: report.averageOffsetMs,
    contentId: input.patternId,
    contentName: input.patternName,
    difficulty: input.difficulty,
    bpm: input.bpm,
    practiceMode: 'rhythm-pattern',
    settings: {
      pattern: input.patternId,
      bpm: input.bpm,
      tolerance: input.tolerance
    },
    details: {
      patternName: input.patternName,
      averageOffsetMs: report.averageOffsetMs
    },
    mistakes: [
      { label: '错音', count: report.wrongNote, type: 'wrong_note' },
      { label: '漏音', count: report.missingNote, type: 'missing_note' },
      { label: '多音', count: extraNoteCount, type: 'extra_note' },
      { label: '早弹', count: report.early, type: 'early' },
      { label: '晚弹', count: report.late, type: 'late' },
      { label: '休止错误', count: report.restError, type: 'rest_error' }
    ].filter((entry) => entry.count > 0)
  }
}

export function createScaleRecord(input: {
  timing: PracticeSessionTiming
  report: ScalePracticeReport
  key: MajorScaleKey
  mode: ScalePracticeMode
  tolerance: ToleranceLevel
}): PracticeSessionRecord {
  const { report } = input

  return {
    ...createBaseRecord(input.timing, {
      module: 'scale',
      moduleName: '音阶练习',
      title: `${report.keyName} · ${report.modeName}`,
      subtitle: `${report.bpm} BPM`,
      totalEvents: report.totalNotes,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrongNote,
    missingNoteCount: report.missingNote,
    extraNoteCount: report.extraNote,
    earlyCount: report.early,
    lateCount: report.late,
    restErrorCount: report.restError,
    averageOffsetMs: report.averageOffsetMs,
    contentId: `${input.key}-${input.mode}-${report.range}`,
    contentName: `${report.keyName} · ${report.modeName}`,
    difficulty: report.range === 'two-octave' || report.notesPerBeat === 4 ? 'challenge' : report.loopCount > 1 ? 'intermediate' : 'basic',
    bpm: report.targetBpm,
    loopCount: report.loopCount,
    keySignature: input.key,
    practiceMode: input.mode,
    settings: {
      key: input.key,
      mode: input.mode,
      bpm: report.bpm,
      tolerance: input.tolerance,
      range: report.range,
      loopCount: report.loopCount,
      notesPerBeat: report.notesPerBeat
    },
    details: {
      keyName: report.keyName,
      modeName: report.modeName,
      highestStreak: report.bestStreak,
      hardestNote: report.mostMissedNote
    },
    mistakes: [
      { label: report.mostMissedNote, count: report.wrongNote + report.missingNote, type: 'pitch' },
      { label: '早弹', count: report.early, type: 'early' },
      { label: '晚弹', count: report.late, type: 'late' }
    ].filter((entry) => entry.count > 0 && entry.label !== '暂无')
  }
}

export function createChordRecord(input: {
  timing: PracticeSessionTiming
  report: ChordPracticeReport
  chordType: ChordQualityFilter
  seventhChordType: SeventhChordQualityFilter
  inversionMode: ChordInversionMode
  questionCount: number
  contentId: string
  contentName: string
  difficulty: PracticeDifficulty
  category: ChordContentCategory
  inputStyle: ChordInputStyle
  keySignature?: string
  roundCount?: number
}): PracticeSessionRecord {
  const { report } = input
  const isIdentification = input.category === 'triad' || input.category === 'seventh'
  const inputStyleLabel = input.inputStyle === 'arpeggio' ? '分解' : '柱式'
  const keyName = getMajorKeySignature(input.keySignature).displayName
  const subtitle = isIdentification
    ? `${keyName} · ${input.questionCount} 题 · ${inputStyleLabel}和弦`
    : `${keyName} · ${input.roundCount ?? 1}轮 · ${inputStyleLabel}`

  return {
    ...createBaseRecord(input.timing, {
      module: 'chord',
      moduleName: '和弦练习',
      title: input.contentName,
      subtitle,
      totalEvents: report.totalQuestions,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrongNote,
    missingNoteCount: report.missingNote,
    extraNoteCount: report.extraNote,
    contentId: input.contentId,
    contentName: input.contentName,
    difficulty: input.difficulty,
    ...(typeof input.roundCount === 'number' ? { loopCount: input.roundCount } : {}),
    ...(input.keySignature ? { keySignature: input.keySignature } : {}),
    practiceMode: `${input.category}:${input.inputStyle}`,
    settings: {
      contentId: input.contentId,
      category: input.category,
      inputStyle: input.inputStyle,
      ...(input.category === 'triad' ? { chordType: input.chordType } : {}),
      ...(input.category === 'seventh' ? { seventhChordType: input.seventhChordType } : {}),
      ...(isIdentification ? { inversionMode: input.inversionMode, questionCount: input.questionCount } : {}),
      ...(input.keySignature ? { keySignature: input.keySignature } : {}),
      ...(typeof input.roundCount === 'number' ? { roundCount: input.roundCount } : {})
    },
    details: {
      hardestChord: report.mostMissedChord,
      mostMissedNote: report.mostMissedNote,
      averageAttempts: report.averageAttempts,
      highestStreak: report.bestStreak
    },
    mistakes: [
      { label: report.mostMissedChord, count: report.wrong, type: 'chord' },
      { label: report.mostMissedNote, count: report.missingNote, type: 'missing_note' }
    ].filter((entry) => entry.count > 0 && entry.label !== '暂无')
  }
}

export function createCoordinationRecord(input: {
  timing: PracticeSessionTiming
  report: CoordinationPracticeReport
  patternId: string
  difficulty: PracticeDifficulty
}): PracticeSessionRecord {
  const { report } = input

  return {
    ...createBaseRecord(input.timing, {
      module: 'coordination',
      moduleName: '左右手协调',
      title: report.patternName,
      subtitle: `${report.measureCount} 小节 · ${report.bpm} BPM`,
      totalEvents: report.totalCells,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrongNote,
    missingNoteCount: report.missingNote,
    extraNoteCount: report.extraNote,
    earlyCount: report.early,
    lateCount: report.late,
    restErrorCount: report.restError,
    syncWarningCount: report.syncWarning,
    averageOffsetMs: report.averageOffsetMs,
    contentId: input.patternId,
    contentName: report.patternName,
    difficulty: input.difficulty,
    bpm: report.bpm,
    loopCount: report.completedLoops,
    practiceMode: input.patternId,
    settings: {
      pattern: input.patternId,
      bpm: report.bpm,
      measureCount: report.measureCount,
      tolerance: report.toleranceLevel
    },
    details: {
      patternName: report.patternName,
      leftErrorCount: report.leftWrongCount,
      rightErrorCount: report.rightWrongCount,
      hardestPosition: report.hardestPosition,
      playableCells: report.playableCells,
      generalExtraCount: report.generalExtraCount
    },
    mistakes: [
      { label: report.hardestPosition, count: report.wrongNote + report.missingNote + report.extraNote + report.restError, type: 'position' },
      { label: '同步警告', count: report.syncWarning, type: 'sync_warning' }
    ].filter((entry) => entry.count > 0 && entry.label !== '暂无')
  }
}
