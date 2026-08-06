import type { PracticeDifficulty } from './practiceContentTypes'

export type TrainingTaskType = 'software' | 'manual' | 'repertoire'
export type LinkedPracticeModule = 'sight-reading' | 'rhythm' | 'scale' | 'chord' | 'coordination'
export type TrainingPlanStageId = 'stage-1' | 'stage-2' | 'stage-3' | 'stage-4'
export type StageProjectStatus = 'not-started' | 'training' | 'completed'
export type DailyTaskManualStatus = 'pending' | 'completed'
export type WeeklyGoalStatus = 'not-started' | 'in-progress' | 'completed'
export type LevelSixStatus = 'not-started' | 'training' | 'achieved'

export interface TrainingPlanProject {
  id: string
  category: string
  title: string
  content: string
  objective: string
  acceptance: string
  notes?: string
  taskType: TrainingTaskType
  linkedModule?: LinkedPracticeModule
  recommendedSettings?: string[]
  difficulty: PracticeDifficulty
}

export interface TrainingPlanStage {
  id: TrainingPlanStageId
  order: number
  title: string
  period: string
  goal: string
  focuses: string[]
  coreMaterials: string[]
  applicationPieces: string[]
  acceptanceCriteria: string[]
  risks: string[]
  projects: TrainingPlanProject[]
}

export interface DailyTrainingTask {
  id: string
  order: number
  minutes: number
  title: string
  content: string
  objective: string
  taskType: TrainingTaskType
  linkedModules?: LinkedPracticeModule[]
  notes?: string
}

export interface WeeklyScheduleItem {
  day: number
  label: string
  focus: string
  content: string
  acceptance: string
}

export interface WeeklyCustomGoal {
  id: string
  content: string
  acceptance: string
  status: WeeklyGoalStatus
  note: string
}

export interface TechniqueMapping {
  id: string
  title: string
  classicalMaterials: string[]
  applicationPieces: string[]
  trainingPoints: string[]
}

export interface LevelSixChecklistItem {
  id: string
  order: number
  category: string
  title: string
}

export interface StageProjectProgress {
  status: StageProjectStatus
  note: string
}

export interface DailyTrainingRecord {
  date: string
  taskOverrides: Record<string, DailyTaskManualStatus>
}

export interface WeeklyTrainingRecord {
  weekStart: string
  goals: WeeklyCustomGoal[]
}

export interface LevelSixProgress {
  status: LevelSixStatus
  note: string
  evidence: string
  lastAssessmentDate: string
}

export interface TrainingPlanStateV1 {
  version: 1
  currentStageId: TrainingPlanStageId
  stageStartDates: Partial<Record<TrainingPlanStageId, string>>
  stageProjects: Record<string, StageProjectProgress>
  dailyRecords: Record<string, DailyTrainingRecord>
  weeklyRecords: Record<string, WeeklyTrainingRecord>
  levelSixProgress: Record<string, LevelSixProgress>
}

export type TrainingPlanState = TrainingPlanStateV1

export const STAGE_PROJECT_STATUS_LABELS: Record<StageProjectStatus, string> = {
  'not-started': '未开始',
  training: '训练中',
  completed: '已完成'
}

export const WEEKLY_GOAL_STATUS_LABELS: Record<WeeklyGoalStatus, string> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  completed: '已完成'
}

export const LEVEL_SIX_STATUS_LABELS: Record<LevelSixStatus, string> = {
  'not-started': '未开始',
  training: '训练中',
  achieved: '已达标'
}

export const TRAINING_TASK_TYPE_LABELS: Record<TrainingTaskType, string> = {
  software: '软件训练',
  manual: '钢琴线下训练',
  repertoire: '曲目训练'
}

