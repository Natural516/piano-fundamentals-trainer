import type { AbilityModelState, AbilitySkillId } from '../ability/abilityModel'
import { getWeakestReliableSkills } from '../ability/abilityModel'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import { getExercisesForSkill, type ExerciseDefinition } from '../prescription/exerciseLibrary'

export interface PlanItem {
  exerciseId: string
  targetSkillIds: AbilitySkillId[]
  minutes: number
  targetTempo?: number | null
  mode?: string | null
  handMode?: string | null
  successCriteria: string
  whyThis: string
  evidenceRefs: Array<{ practiceRecordId: string }>
  fallback?: string | null
  harderVariant?: string | null
}

export interface DailyTrainingPlan {
  date: string
  totalTargetMinutes: number
  rationale: string[]
  items: PlanItem[]
}

export interface PlannerInput {
  ability: AbilityModelState
  records: PracticeSessionRecord[]
  goal: string
  availableMinutes: number
  library: ExerciseDefinition[]
}

const CATEGORY_LIMIT_RATIO = 0.5
const MAX_ITEM_MINUTES = 30

export function getSuccessCriteriaForExercise(exerciseId: string, tempo?: number | null): string {
  if (exerciseId.startsWith('scale-')) {
    return `连续 3 遍无错（${tempo ?? 60} BPM）`
  }
  if (exerciseId.startsWith('drill-sight-reading')) {
    return '20 题正确率 ≥ 90%'
  }
  if (exerciseId.startsWith('drill-rhythm')) {
    return '20 拍内 miss=0 且 |偏移| 中位数 ≤ 60ms'
  }
  if (exerciseId.startsWith('drill-chord')) {
    return '20 题正确率 ≥ 90%'
  }
  if (exerciseId.startsWith('coordination-')) {
    return '双手同步误差中位数 ≤ 60ms'
  }
  return '连续 3 遍无错'
}

export function buildDailyPlan(input: PlannerInput): DailyTrainingPlan {
  const availableMinutes = Math.min(120, Math.max(10, Math.round(input.availableMinutes)))
  const rationale: string[] = []
  const items: PlanItem[] = []
  const recentRecordIds = input.records
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
    .slice(0, 5)
    .map((record) => record.id)
  const evidenceRefs = recentRecordIds.map((practiceRecordId) => ({ practiceRecordId }))

  const weakest = getWeakestReliableSkills(input.ability, 3)
  if (weakest.length > 0) {
    rationale.push(`优先加强可靠弱项：${weakest.join('、')}`)
  } else {
    rationale.push('当前无可靠弱项（样本不足或分数稳定），按目标分配均衡练习。')
  }

  const categories: string[] = []
  let remainingMinutes = availableMinutes
  const candidates: Array<{ skillId: AbilitySkillId; priority: number }> = []

  const allSkills: AbilitySkillId[] = ['sight-reading', 'rhythm', 'scale', 'chord', 'coordination']
  allSkills.forEach((skillId, index) => {
    const weakIndex = weakest.indexOf(skillId)
    candidates.push({ skillId, priority: weakIndex >= 0 ? weakIndex : weakest.length + index })
  })
  candidates.sort((left, right) => left.priority - right.priority)

  for (const candidate of candidates) {
    if (remainingMinutes <= 0) break
    const exercises = getExercisesForSkill(candidate.skillId)
    const exercise = exercises[0] ?? input.library.find((entry) => entry.targetSkills.includes(candidate.skillId))
    if (!exercise) continue

    const category = exercise.category
    const categoryUsed = categories.filter((entry) => entry === category).length
    if (categoryUsed > 0 && categoryUsed / Math.max(1, items.length) >= CATEGORY_LIMIT_RATIO) {
      continue
    }

    const itemMinutes = Math.min(MAX_ITEM_MINUTES, Math.max(10, Math.round(remainingMinutes / Math.max(1, candidates.length - items.length))))
    if (itemMinutes < 5) break
    categories.push(category)
    remainingMinutes -= itemMinutes

    const skillState = input.ability.skills[candidate.skillId]
    items.push({
      exerciseId: exercise.id,
      targetSkillIds: exercise.targetSkills,
      minutes: itemMinutes,
      targetTempo: exercise.recommendedTempoRange?.[0] ?? null,
      mode: null,
      handMode: exercise.targetSkills.includes('scale') ? 'right' : null,
      successCriteria: getSuccessCriteriaForExercise(exercise.id, exercise.recommendedTempoRange?.[0]),
      whyThis: skillState
        ? `${exercise.title}：该技能当前分数 ${skillState.score ?? '—'}（样本 ${skillState.sampleCount}）`
        : `${exercise.title}：目标技能尚无可靠数据`,
      evidenceRefs,
      fallback: exercise.recommendedTempoRange ? `降速到 ${exercise.recommendedTempoRange[0] - 10} BPM` : null,
      harderVariant: exercise.recommendedTempoRange ? `提速到 ${exercise.recommendedTempoRange[1] + 10} BPM` : null
    })
  }

  if (input.goal.trim()) {
    rationale.push(`用户目标：${input.goal.trim()}`)
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    totalTargetMinutes: availableMinutes - remainingMinutes,
    rationale,
    items
  }
}
