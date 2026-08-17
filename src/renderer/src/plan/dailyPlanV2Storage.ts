import type { DailyTrainingPlan, PlanItem } from './planner'
import type { PracticeRecordV2 } from '../records/practiceRecordV2'
import type { ScoreMasteryState } from '../ability/scoreMastery'

export interface DailyPlanV2State {
  version: 1
  planId: string
  date: string
  generatedAt: string
  sourceEvidenceSnapshot: {
    recordCount: number
    masteryScoreCount: number
    planItemCount: number
  }
  items: PlanItem[]
  progress: Record<string, 'pending' | 'done'>
}

export const DAILY_PLAN_V2_STORAGE_KEY = 'training-plan.v2.daily.v1'
export const PLANNER_PREFERENCES_STORAGE_KEY = 'training-plan.v2.preferences.v1'

export interface PlannerPreferences {
  availableMinutes: number
  goal: string
}

export function sanitizePlannerPreferences(value: unknown): PlannerPreferences {
  if (!value || typeof value !== 'object') return { availableMinutes: 30, goal: '' }
  const candidate = value as Partial<PlannerPreferences>
  return {
    availableMinutes: typeof candidate.availableMinutes === 'number'
      ? Math.min(120, Math.max(10, Math.round(candidate.availableMinutes)))
      : 30,
    goal: typeof candidate.goal === 'string' ? candidate.goal.slice(0, 200) : ''
  }
}

export function readPlannerPreferences(storage: Pick<Storage, 'getItem'> = window.localStorage): PlannerPreferences {
  try {
    const raw = storage.getItem(PLANNER_PREFERENCES_STORAGE_KEY)
    return raw ? sanitizePlannerPreferences(JSON.parse(raw)) : sanitizePlannerPreferences(null)
  } catch {
    return sanitizePlannerPreferences(null)
  }
}

export function writePlannerPreferences(
  preferences: PlannerPreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(PLANNER_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitizePlannerPreferences(preferences)))
    return true
  } catch {
    return false
  }
}

export function updateDailyPlanFromRecords(
  current: DailyPlanV2State,
  records: PracticeRecordV2[],
  mastery: ScoreMasteryState
): { state: DailyPlanV2State; changed: boolean } {
  const progress = { ...current.progress }
  let changed = false
  for (const item of current.items) {
    const scoreMatch = /^score:(.+):(\d+)$/.exec(item.exerciseId)
    let achieved = false
    if (scoreMatch) {
      const measure = mastery.scores[scoreMatch[1]]?.[Number(scoreMatch[2])]
      achieved = Boolean(measure && measure.pitchAccuracy !== null && measure.pitchAccuracy >= 90)
    } else {
      achieved = records.some((record) => {
        const accuracy = record.metrics.find((metric) => metric.key === 'accuracy')?.value ?? 0
        return item.targetSkillIds.includes(record.practiceType as PlanItem['targetSkillIds'][number]) && accuracy >= 90
      })
    }
    if (achieved && progress[item.exerciseId] !== 'done') {
      progress[item.exerciseId] = 'done'
      changed = true
    }
  }
  const state: DailyPlanV2State = {
    ...current,
    sourceEvidenceSnapshot: {
      ...current.sourceEvidenceSnapshot,
      recordCount: records.length,
      masteryScoreCount: Object.keys(mastery.scores).length
    },
    progress
  }
  return { state, changed }
}

function sanitizePlanItem(value: unknown): PlanItem | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PlanItem>
  if (typeof candidate.exerciseId !== 'string' || typeof candidate.successCriteria !== 'string' || typeof candidate.whyThis !== 'string') {
    return null
  }
  return {
    exerciseId: candidate.exerciseId,
    targetSkillIds: Array.isArray(candidate.targetSkillIds) ? candidate.targetSkillIds.filter((id): id is PlanItem['targetSkillIds'][number] => typeof id === 'string') : [],
    minutes: typeof candidate.minutes === 'number' ? Math.max(1, Math.round(candidate.minutes)) : 10,
    targetTempo: typeof candidate.targetTempo === 'number' ? candidate.targetTempo : null,
    mode: typeof candidate.mode === 'string' ? candidate.mode : null,
    handMode: typeof candidate.handMode === 'string' ? candidate.handMode : null,
    successCriteria: candidate.successCriteria,
    whyThis: candidate.whyThis,
    evidenceRefs: Array.isArray(candidate.evidenceRefs)
      ? candidate.evidenceRefs.filter((ref): ref is PlanItem['evidenceRefs'][number] => Boolean(ref && typeof ref === 'object' && typeof (ref as { practiceRecordId?: unknown }).practiceRecordId === 'string'))
      : [],
    fallback: typeof candidate.fallback === 'string' ? candidate.fallback : null,
    harderVariant: typeof candidate.harderVariant === 'string' ? candidate.harderVariant : null
  }
}

export function createDailyPlanV2(plan: DailyTrainingPlan): DailyPlanV2State {
  return {
    version: 1,
    planId: `${plan.date}-${Date.now()}`,
    date: plan.date,
    generatedAt: new Date().toISOString(),
    sourceEvidenceSnapshot: {
      recordCount: plan.items.reduce((sum, item) => sum + item.evidenceRefs.length, 0),
      masteryScoreCount: plan.items.filter((item) => item.exerciseId.startsWith('score:')).length,
      planItemCount: plan.items.length
    },
    items: plan.items,
    progress: {}
  }
}

export function sanitizeDailyPlanV2(value: unknown): DailyPlanV2State | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DailyPlanV2State>
  if (candidate.version !== 1 || !Array.isArray(candidate.items) || typeof candidate.date !== 'string') return null
  const items = candidate.items.map(sanitizePlanItem).filter((item): item is PlanItem => item !== null)
  if (items.length === 0) return null
  const progress: Record<string, 'pending' | 'done'> = {}
  if (candidate.progress && typeof candidate.progress === 'object') {
    for (const [key, value] of Object.entries(candidate.progress)) {
      if (value === 'done' || value === 'pending') progress[key] = value
    }
  }
  return {
    version: 1,
    planId: typeof candidate.planId === 'string' ? candidate.planId : `${candidate.date}-stored`,
    date: candidate.date,
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : new Date().toISOString(),
    sourceEvidenceSnapshot: {
      recordCount: typeof candidate.sourceEvidenceSnapshot?.recordCount === 'number' ? candidate.sourceEvidenceSnapshot.recordCount : 0,
      masteryScoreCount: typeof candidate.sourceEvidenceSnapshot?.masteryScoreCount === 'number' ? candidate.sourceEvidenceSnapshot.masteryScoreCount : 0,
      planItemCount: items.length
    },
    items,
    progress
  }
}

export function readDailyPlanV2(storage: Pick<Storage, 'getItem'> = window.localStorage): DailyPlanV2State | null {
  try {
    const raw = storage.getItem(DAILY_PLAN_V2_STORAGE_KEY)
    if (!raw) return null
    return sanitizeDailyPlanV2(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeDailyPlanV2(
  state: DailyPlanV2State,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(DAILY_PLAN_V2_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
