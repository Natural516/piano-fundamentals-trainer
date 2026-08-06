export type PracticeModule =
  | 'sight-reading'
  | 'rhythm'
  | 'scale'
  | 'chord'
  | 'coordination'

export type PracticeSessionStatus = 'completed' | 'stopped'

export interface PracticeMistakeSummary {
  label: string
  count: number
  type?: string
}

export interface PracticeSessionRecord {
  id: string
  schemaVersion: 1
  module: PracticeModule
  moduleName: string
  title: string
  subtitle?: string
  startedAt: string
  endedAt: string
  durationMs: number
  status: PracticeSessionStatus
  totalEvents: number
  correctEvents: number
  accuracy: number
  wrongNoteCount: number
  missingNoteCount: number
  extraNoteCount: number
  earlyCount: number
  lateCount: number
  restErrorCount: number
  syncWarningCount: number
  averageOffsetMs?: number
  contentId?: string
  contentName?: string
  difficulty?: string
  bpm?: number
  loopCount?: number
  keySignature?: string
  practiceMode?: string
  settings: Record<string, string | number | boolean>
  details: Record<string, string | number | boolean | null>
  mistakes: PracticeMistakeSummary[]
}

export interface PracticeSessionTiming {
  id: string
  startedAt: string
  endedAt: string
  durationMs: number
}

export interface TodayPracticeStats {
  durationMs: number
  completedSessions: number
  totalEvents: number
  correctEvents: number
  accuracy: number
}

export const PRACTICE_MODULE_NAMES: Record<PracticeModule, string> = {
  'sight-reading': '识谱练习',
  rhythm: '节奏与切分',
  scale: '音阶练习',
  chord: '和弦练习',
  coordination: '左右手协调'
}
