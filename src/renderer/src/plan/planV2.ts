export interface PlanV2Profile {
  stage: string
  goal: string
  dailyMinutes: number
  focusAreas: string[]
  repertoire: string[]
  curriculum: string[]
}

export interface PlanV2Goal {
  id: string
  title: string
  category: 'curriculum' | 'repertoire' | 'technique' | 'assessment'
  target: string
  progress: number
  createdAt: string
}

export interface PlanV2State {
  version: 2
  profile: PlanV2Profile
  goals: PlanV2Goal[]
  legacy: Record<string, unknown>
  migratedFromV1: boolean
}

export const PLAN_V2_STORAGE_KEY = 'training-plan.v2'

export function createDefaultPlanV2(): PlanV2State {
  return {
    version: 2,
    profile: {
      stage: 'stage-1',
      goal: '',
      dailyMinutes: 60,
      focusAreas: [],
      repertoire: [],
      curriculum: []
    },
    goals: [],
    legacy: {},
    migratedFromV1: false
  }
}

export function migratePlanV1ToV2(v1: unknown): PlanV2State {
  const base = createDefaultPlanV2()
  if (!v1 || typeof v1 !== 'object') return base

  const candidate = v1 as Record<string, unknown>
  const legacy: Record<string, unknown> = {}

  for (const key of [
    'currentStageId',
    'stageStartDates',
    'stageProjects',
    'dailyRecords',
    'weeklyRecords',
    'levelSixProgress'
  ]) {
    if (key in candidate) {
      legacy[key] = candidate[key]
    }
  }

  return {
    version: 2,
    profile: {
      ...base.profile,
      stage: typeof candidate.currentStageId === 'string' ? candidate.currentStageId : base.profile.stage
    },
    goals: [],
    legacy,
    migratedFromV1: Object.keys(legacy).length > 0
  }
}

export function sanitizePlanV2(value: unknown): PlanV2State {
  const base = createDefaultPlanV2()
  if (!value || typeof value !== 'object') return base
  const candidate = value as Partial<PlanV2State>
  const profile = candidate.profile && typeof candidate.profile === 'object'
    ? { ...base.profile, ...candidate.profile }
    : base.profile
  const goals = Array.isArray(candidate.goals)
    ? candidate.goals
        .filter((goal): goal is PlanV2Goal => Boolean(goal && typeof goal === 'object' && typeof goal.id === 'string'))
        .map((goal) => ({ ...goal }))
    : []

  return {
    version: 2,
    profile,
    goals,
    legacy: candidate.legacy && typeof candidate.legacy === 'object' ? candidate.legacy : {},
    migratedFromV1: Boolean(candidate.migratedFromV1)
  }
}

export function readPlanV2(storage: Pick<Storage, 'getItem'> = window.localStorage): PlanV2State {
  try {
    const raw = storage.getItem(PLAN_V2_STORAGE_KEY)
    if (!raw) return createDefaultPlanV2()
    return sanitizePlanV2(JSON.parse(raw))
  } catch {
    return createDefaultPlanV2()
  }
}

export function writePlanV2(state: PlanV2State, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem(PLAN_V2_STORAGE_KEY, JSON.stringify(sanitizePlanV2(state)))
    return true
  } catch {
    return false
  }
}
