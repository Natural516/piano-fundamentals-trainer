import { DAILY_TRAINING_PLAN } from './dailyTrainingPlan'
import { LEVEL_SIX_CHECKLIST } from './levelSixChecklist'
import { TRAINING_PLAN_STAGES } from './trainingPlanStages'
import type {
  DailyTaskManualStatus,
  LevelSixProgress,
  LevelSixStatus,
  StageProjectProgress,
  StageProjectStatus,
  TrainingPlanStageId,
  TrainingPlanState,
  TrainingPlanStateV1,
  WeeklyCustomGoal,
  WeeklyGoalStatus,
  WeeklyTrainingRecord
} from './trainingPlanTypes'
import { createDefaultWeeklyGoals } from './weeklyTrainingPlan'
import { formatCalendarDate } from './localCalendarDate'

export const TRAINING_PLAN_STORAGE_KEY = 'piano-trainer.training-plan.v1'
export const TRAINING_PLAN_CHANGED_EVENT = 'piano-trainer:training-plan-changed'

export interface TrainingPlanStorageResult {
  success: boolean
  state: TrainingPlanState
  message?: string
}

const stageIds = new Set(TRAINING_PLAN_STAGES.map((stage) => stage.id))
const projectIds = new Set(TRAINING_PLAN_STAGES.flatMap((stage) => stage.projects.map((project) => project.id)))
const dailyTaskIds = new Set(DAILY_TRAINING_PLAN.map((task) => task.id))
const checklistIds = new Set(LEVEL_SIX_CHECKLIST.map((item) => item.id))
const stageStatuses = new Set<StageProjectStatus>(['not-started', 'training', 'completed'])
const dailyStatuses = new Set<DailyTaskManualStatus>(['pending', 'completed'])
const weeklyStatuses = new Set<WeeklyGoalStatus>(['not-started', 'in-progress', 'completed'])
const levelSixStatuses = new Set<LevelSixStatus>(['not-started', 'training', 'achieved'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, 2000) : fallback
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null
}

export function formatLocalDate(date: Date): string {
  return formatCalendarDate(date)
}

export function getLocalWeekStart(date: Date): string {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const mondayOffset = (localDate.getDay() + 6) % 7
  localDate.setDate(localDate.getDate() - mondayOffset)
  return formatLocalDate(localDate)
}

export function createDefaultTrainingPlanState(today = new Date()): TrainingPlanStateV1 {
  return {
    version: 1,
    currentStageId: 'stage-1',
    stageStartDates: { 'stage-1': formatLocalDate(today) },
    stageProjects: {},
    dailyRecords: {},
    weeklyRecords: {},
    levelSixProgress: {}
  }
}

export function createDefaultStageProjectProgress(): StageProjectProgress {
  return { status: 'not-started', note: '' }
}

export function createDefaultLevelSixProgress(): LevelSixProgress {
  return { status: 'not-started', note: '', evidence: '', lastAssessmentDate: '' }
}

function normalizeStageStartDates(value: unknown): TrainingPlanStateV1['stageStartDates'] {
  if (!isObject(value)) return {}
  const result: TrainingPlanStateV1['stageStartDates'] = {}
  for (const [stageId, date] of Object.entries(value)) {
    if (stageIds.has(stageId as TrainingPlanStageId) && typeof date === 'string' && parseLocalDate(date)) {
      result[stageId as TrainingPlanStageId] = date
    }
  }
  return result
}

function normalizeStageProjects(value: unknown): TrainingPlanStateV1['stageProjects'] {
  if (!isObject(value)) return {}
  const result: TrainingPlanStateV1['stageProjects'] = {}
  for (const [projectId, progress] of Object.entries(value)) {
    if (!projectIds.has(projectId) || !isObject(progress)) continue
    result[projectId] = {
      status: stageStatuses.has(progress.status as StageProjectStatus)
        ? progress.status as StageProjectStatus
        : 'not-started',
      note: safeString(progress.note)
    }
  }
  return result
}

function normalizeDailyRecords(value: unknown): TrainingPlanStateV1['dailyRecords'] {
  if (!isObject(value)) return {}
  const result: TrainingPlanStateV1['dailyRecords'] = {}
  for (const [date, record] of Object.entries(value)) {
    if (!parseLocalDate(date) || !isObject(record)) continue
    const taskOverrides: Record<string, DailyTaskManualStatus> = {}
    if (isObject(record.taskOverrides)) {
      for (const [taskId, status] of Object.entries(record.taskOverrides)) {
        if (dailyTaskIds.has(taskId) && dailyStatuses.has(status as DailyTaskManualStatus)) {
          taskOverrides[taskId] = status as DailyTaskManualStatus
        }
      }
    }
    result[date] = { date, taskOverrides }
  }
  return result
}

function normalizeWeeklyGoal(goal: unknown, fallback: WeeklyCustomGoal): WeeklyCustomGoal {
  if (!isObject(goal)) return fallback
  return {
    id: fallback.id,
    content: safeString(goal.content),
    acceptance: safeString(goal.acceptance),
    status: weeklyStatuses.has(goal.status as WeeklyGoalStatus)
      ? goal.status as WeeklyGoalStatus
      : 'not-started',
    note: safeString(goal.note)
  }
}

function normalizeWeeklyRecords(value: unknown): TrainingPlanStateV1['weeklyRecords'] {
  if (!isObject(value)) return {}
  const result: TrainingPlanStateV1['weeklyRecords'] = {}
  for (const [weekStart, record] of Object.entries(value)) {
    const date = parseLocalDate(weekStart)
    if (!date || getLocalWeekStart(date) !== weekStart || !isObject(record)) continue
    const defaults = createDefaultWeeklyGoals(weekStart)
    const sourceGoals = Array.isArray(record.goals) ? record.goals : []
    result[weekStart] = {
      weekStart,
      goals: defaults.map((fallback, index) => normalizeWeeklyGoal(sourceGoals[index], fallback))
    }
  }
  return result
}

function normalizeLevelSixProgress(value: unknown): TrainingPlanStateV1['levelSixProgress'] {
  if (!isObject(value)) return {}
  const result: TrainingPlanStateV1['levelSixProgress'] = {}
  for (const [itemId, progress] of Object.entries(value)) {
    if (!checklistIds.has(itemId) || !isObject(progress)) continue
    const assessmentDate = safeString(progress.lastAssessmentDate)
    result[itemId] = {
      status: levelSixStatuses.has(progress.status as LevelSixStatus)
        ? progress.status as LevelSixStatus
        : 'not-started',
      note: safeString(progress.note),
      evidence: safeString(progress.evidence),
      lastAssessmentDate: parseLocalDate(assessmentDate) ? assessmentDate : ''
    }
  }
  return result
}

export function normalizeTrainingPlanState(value: unknown, today = new Date()): TrainingPlanStateV1 {
  const defaults = createDefaultTrainingPlanState(today)
  if (!isObject(value)) return defaults

  const currentStageId = stageIds.has(value.currentStageId as TrainingPlanStageId)
    ? value.currentStageId as TrainingPlanStageId
    : defaults.currentStageId
  const stageStartDates = normalizeStageStartDates(value.stageStartDates)

  return {
    version: 1,
    currentStageId,
    stageStartDates: {
      ...stageStartDates,
      [currentStageId]: stageStartDates[currentStageId] ?? formatLocalDate(today)
    },
    stageProjects: normalizeStageProjects(value.stageProjects),
    dailyRecords: normalizeDailyRecords(value.dailyRecords),
    weeklyRecords: normalizeWeeklyRecords(value.weeklyRecords),
    levelSixProgress: normalizeLevelSixProgress(value.levelSixProgress)
  }
}

export function migrateTrainingPlanState(value: unknown, today = new Date()): TrainingPlanState {
  if (!isObject(value)) return createDefaultTrainingPlanState(today)
  if (value.version === 1) return normalizeTrainingPlanState(value, today)

  // Future versions can add a dedicated migration branch here without changing v1 readers.
  return createDefaultTrainingPlanState(today)
}

export function readTrainingPlanState(today = new Date()): TrainingPlanState {
  if (typeof window === 'undefined') return createDefaultTrainingPlanState(today)
  try {
    const stored = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY)
    return stored ? migrateTrainingPlanState(JSON.parse(stored), today) : createDefaultTrainingPlanState(today)
  } catch (error) {
    console.warn('[training-plan] 读取训练计划失败，已使用默认状态。', error)
    return createDefaultTrainingPlanState(today)
  }
}

export function saveTrainingPlanState(state: TrainingPlanState): TrainingPlanStorageResult {
  const normalized = normalizeTrainingPlanState(state)
  if (typeof window === 'undefined') {
    return { success: false, state: normalized, message: '当前环境无法保存训练计划。' }
  }

  try {
    window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent(TRAINING_PLAN_CHANGED_EVENT))
    return { success: true, state: normalized }
  } catch (error) {
    console.warn('[training-plan] 保存训练计划失败。', error)
    return { success: false, state: normalized, message: '保存失败，请检查本地存储权限。' }
  }
}

export function changeCurrentStage(
  state: TrainingPlanState,
  stageId: TrainingPlanStageId,
  date = formatLocalDate(new Date())
): TrainingPlanState {
  return normalizeTrainingPlanState({
    ...state,
    currentStageId: stageId,
    stageStartDates: {
      ...state.stageStartDates,
      [stageId]: state.stageStartDates[stageId] ?? date
    }
  })
}

export function setDailyTaskOverride(
  state: TrainingPlanState,
  date: string,
  taskId: string,
  status: DailyTaskManualStatus
): TrainingPlanState {
  if (!parseLocalDate(date) || !dailyTaskIds.has(taskId)) return state
  return normalizeTrainingPlanState({
    ...state,
    dailyRecords: {
      ...state.dailyRecords,
      [date]: {
        date,
        taskOverrides: {
          ...state.dailyRecords[date]?.taskOverrides,
          [taskId]: status
        }
      }
    }
  })
}

export function resetDailyTrainingRecord(state: TrainingPlanState, date: string): TrainingPlanState {
  const dailyRecords = { ...state.dailyRecords }
  delete dailyRecords[date]
  return normalizeTrainingPlanState({ ...state, dailyRecords })
}

export function ensureWeeklyTrainingRecord(
  state: TrainingPlanState,
  weekStart: string
): { state: TrainingPlanState; record: WeeklyTrainingRecord } {
  const existing = state.weeklyRecords[weekStart]
  if (existing) return { state, record: existing }
  const record = { weekStart, goals: createDefaultWeeklyGoals(weekStart) }
  const nextState = normalizeTrainingPlanState({
    ...state,
    weeklyRecords: { ...state.weeklyRecords, [weekStart]: record }
  })
  return { state: nextState, record: nextState.weeklyRecords[weekStart] }
}
