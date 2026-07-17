import type { SightReadingReport } from '../hooks/useSightReadingPractice'
import type { ChordPracticeReport, ChordInversionMode, ChordQualityFilter } from './chordTypes'
import type { CoordinationPracticeReport } from './coordinationTypes'
import type { ToleranceLevel } from './practiceTypes'
import type { PracticeSessionRecord, PracticeSessionTiming } from './practiceRecordTypes'
import type { RhythmPracticeReport } from './rhythmTypes'
import type { MajorScaleKey, ScalePracticeMode, ScalePracticeReport } from './scaleTypes'

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

  return {
    ...createBaseRecord(input.timing, {
      module: 'sight-reading',
      moduleName: '识谱练习',
      title: `${report.clefMode === 'mixed' ? '双谱号随机' : report.clefMode === 'treble' ? '高音谱号' : '低音谱号'} · 单音识别`,
      subtitle: 'C 大调识谱',
      totalEvents: report.totalQuestions,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrong,
    settings: {
      clef: report.clefMode,
      range: report.range,
      questionCount: report.totalQuestions,
      noteNameVisible: input.showNoteName
    },
    details: {
      trebleAccuracy: report.treble.accuracy,
      bassAccuracy: report.bass.accuracy,
      highestStreak: report.bestStreak,
      hardestNote: report.mostMissedNote
    },
    mistakes: report.errorCounts
      .filter((entry) => entry.count > 0)
      .map((entry) => ({ label: entry.noteName, count: entry.count, type: 'wrong_note' }))
  }
}

export function createRhythmRecord(input: {
  timing: PracticeSessionTiming
  report: RhythmPracticeReport
  patternId: string
  patternName: string
  bpm: number
  tolerance: ToleranceLevel
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
    settings: {
      key: input.key,
      mode: input.mode,
      bpm: report.bpm,
      tolerance: input.tolerance
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
  inversionMode: ChordInversionMode
  questionCount: number
}): PracticeSessionRecord {
  const { report } = input

  return {
    ...createBaseRecord(input.timing, {
      module: 'chord',
      moduleName: '和弦练习',
      title: 'C 大调自然三和弦',
      subtitle: `${input.questionCount} 题柱式和弦`,
      totalEvents: report.totalQuestions,
      correctEvents: report.correct,
      accuracy: report.accuracy
    }),
    wrongNoteCount: report.wrongNote,
    missingNoteCount: report.missingNote,
    extraNoteCount: report.extraNote,
    settings: {
      chordType: input.chordType,
      inversionMode: input.inversionMode,
      questionCount: input.questionCount
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
