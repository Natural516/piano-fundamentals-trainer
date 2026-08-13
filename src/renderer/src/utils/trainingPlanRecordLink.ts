import type { PracticeModule, PracticeSessionRecord } from './practiceRecordTypes'
import type { DailyTrainingTask, LinkedPracticeModule } from './trainingPlanTypes'
import { formatLocalDate } from './trainingPlanStorage'

export type TodayCompletedModules = Record<LinkedPracticeModule, boolean>
export type TodayLatestModuleResults = Partial<Record<LinkedPracticeModule, PracticeSessionRecord>>

const emptyCompletedModules = (): TodayCompletedModules => ({
  'sight-reading': false,
  rhythm: false,
  scale: false,
  chord: false,
  coordination: false
})

const LINKED_MODULE_SET = new Set<LinkedPracticeModule>([
  'sight-reading',
  'rhythm',
  'scale',
  'chord',
  'coordination'
])

function isRecordOnDate(record: PracticeSessionRecord, date: string): boolean {
  const endedAt = new Date(record.endedAt)
  return Number.isFinite(endedAt.getTime()) && formatLocalDate(endedAt) === date
}

export function getTodayCompletedModules(
  records: PracticeSessionRecord[],
  date = formatLocalDate(new Date())
): TodayCompletedModules {
  return records.reduce((result, record) => {
    if (
      record.status === 'completed' &&
      isRecordOnDate(record, date) &&
      LINKED_MODULE_SET.has(record.module as LinkedPracticeModule)
    ) {
      result[record.module as LinkedPracticeModule] = true
    }
    return result
  }, emptyCompletedModules())
}

export function getTodayLatestModuleResults(
  records: PracticeSessionRecord[],
  date = formatLocalDate(new Date())
): TodayLatestModuleResults {
  const result: TodayLatestModuleResults = {}

  for (const record of records) {
    if (!isRecordOnDate(record, date)) continue
    if (!LINKED_MODULE_SET.has(record.module as LinkedPracticeModule)) continue
    const module = record.module as LinkedPracticeModule
    const existing = result[module]
    if (!existing || Date.parse(record.endedAt) > Date.parse(existing.endedAt)) result[module] = record
  }

  return result
}

export function isDailyTaskAutoCompleted(
  task: DailyTrainingTask,
  completedModules: TodayCompletedModules
): boolean {
  if (task.taskType !== 'software' || !task.linkedModules?.length) return false
  return task.linkedModules.some((module) => completedModules[module])
}

export function toPracticeModule(module: LinkedPracticeModule): PracticeModule {
  return module
}
