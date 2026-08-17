import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import type { EvidenceRef } from '../records/practiceRecordV2'
import type { PracticeRecordV2 } from '../records/practiceRecordV2'
import { isMeasureWeak, type ScoreMasteryState } from './scoreMastery'

export type AbilitySkillId =
  | 'sight-reading'
  | 'rhythm'
  | 'scale'
  | 'chord'
  | 'coordination'
  | 'score-performance'

export type AbilityConfidence = 'low' | 'medium' | 'high'
export type AbilityTrend = 'up' | 'down' | 'flat' | 'unknown'

export interface SkillState {
  skillId: AbilitySkillId
  score: number | null
  confidence: AbilityConfidence
  sampleCount: number
  lastPracticedAt: string | null
  trend: AbilityTrend
  evidenceRefs: EvidenceRef[]
  uncertainty: string[]
}

export interface AbilityModelState {
  version: 1
  skills: Partial<Record<AbilitySkillId, SkillState>>
  updatedAt: string
}

const SKILL_IDS: AbilitySkillId[] = [
  'sight-reading',
  'rhythm',
  'scale',
  'chord',
  'coordination',
  'score-performance'
]

export function getConfidence(sampleCount: number): AbilityConfidence {
  if (sampleCount < 3) return 'low'
  if (sampleCount < 10) return 'medium'
  return 'high'
}

function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

export function computeAbilityModel(records: PracticeSessionRecord[], now = new Date()): AbilityModelState {
  const skills: Partial<Record<AbilitySkillId, SkillState>> = {}

  for (const skillId of SKILL_IDS) {
    const moduleRecords = records
      .filter((record) => record.module === skillId)
      .sort((left, right) => Date.parse(left.endedAt) - Date.parse(right.endedAt))

    if (moduleRecords.length === 0) {
      skills[skillId] = {
        skillId,
        score: null,
        confidence: 'low',
        sampleCount: 0,
        lastPracticedAt: null,
        trend: 'unknown',
        evidenceRefs: [],
        uncertainty: ['样本不足：尚无该技能练习记录']
      }
      continue
    }

    const accuracies = moduleRecords
      .map((record) => record.accuracy)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const midpoint = Math.floor(moduleRecords.length / 2)
    const firstHalf = average(accuracies.slice(0, midpoint))
    const secondHalf = average(accuracies.slice(midpoint))
    let trend: AbilityTrend = 'flat'
    if (firstHalf !== null && secondHalf !== null) {
      if (secondHalf - firstHalf >= 5) trend = 'up'
      else if (firstHalf - secondHalf >= 5) trend = 'down'
    }

    skills[skillId] = {
      skillId,
      score: average(accuracies),
      confidence: getConfidence(moduleRecords.length),
      sampleCount: moduleRecords.length,
      lastPracticedAt: moduleRecords[moduleRecords.length - 1].endedAt,
      trend,
      evidenceRefs: moduleRecords.slice(-10).map((record) => ({
        practiceRecordId: record.id
      })),
      uncertainty: moduleRecords.length < 3 ? ['样本不足：少于 3 次，不能可靠判断趋势'] : []
    }
  }

  return {
    version: 1,
    skills,
    updatedAt: now.toISOString()
  }
}

export function answerAbilityQuestions(model: AbilityModelState): {
  improved: string[]
  regressed: string[]
  insufficient: string[]
} {
  const improved: string[] = []
  const regressed: string[] = []
  const insufficient: string[] = []

  for (const skillId of SKILL_IDS) {
    const skill = model.skills[skillId]
    if (!skill) continue
    if (skill.trend === 'up') improved.push(skillId)
    if (skill.trend === 'down') regressed.push(skillId)
    if (skill.sampleCount === 0 || skill.confidence === 'low') insufficient.push(skillId)
  }

  return { improved, regressed, insufficient }
}

export function getWeakestReliableSkills(model: AbilityModelState, limit = 3): AbilitySkillId[] {
  return SKILL_IDS
    .map((skillId) => model.skills[skillId])
    .filter((skill): skill is SkillState => skill !== undefined && skill.confidence !== 'low' && skill.score !== null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))
    .slice(0, limit)
    .map((skill) => skill.skillId)
}

export function computeAbilityModelV2(
  records: PracticeRecordV2[],
  mastery?: ScoreMasteryState,
  now = new Date()
): AbilityModelState {
  const PRACTICE_TYPE_TO_SKILL: Record<string, AbilitySkillId> = {
    'sight-reading': 'sight-reading',
    rhythm: 'rhythm',
    scale: 'scale',
    chord: 'chord',
    coordination: 'coordination',
    score: 'score-performance',
    'score-performance': 'score-performance'
  }
  const grouped = new Map<string, { accuracies: number[]; timestamps: string[]; ids: string[] }>()

  const chronological = [...records].sort((left, right) =>
    Date.parse(left.startedAt || left.endedAt) - Date.parse(right.startedAt || right.endedAt) ||
    Date.parse(left.endedAt) - Date.parse(right.endedAt)
  )

  for (const record of chronological) {
    const accuracy = record.metrics.find((metric) => metric.key === 'accuracy')?.value
    if (typeof accuracy !== 'number') continue
    const skillId = PRACTICE_TYPE_TO_SKILL[record.practiceType]
    if (!skillId) continue
    const entry = grouped.get(skillId) ?? { accuracies: [], timestamps: [], ids: [] }
    entry.accuracies.push(accuracy)
    entry.timestamps.push(record.endedAt)
    entry.ids.push(record.id)
    grouped.set(skillId, entry)
  }

  const skills: Partial<Record<AbilitySkillId, SkillState>> = {}

  for (const skillId of SKILL_IDS) {
    const group = grouped.get(skillId)
    if (!group) {
      skills[skillId] = {
        skillId,
        score: null,
        confidence: 'low',
        sampleCount: 0,
        lastPracticedAt: null,
        trend: 'unknown',
        evidenceRefs: [],
        uncertainty: ['样本不足：尚无该技能练习记录']
      }
      continue
    }
    const sorted = [...group.timestamps].sort()
    const midpoint = Math.floor(group.accuracies.length / 2)
    const firstHalf = average(group.accuracies.slice(0, midpoint))
    const secondHalf = average(group.accuracies.slice(midpoint))
    let trend: AbilityTrend = 'flat'
    if (firstHalf !== null && secondHalf !== null) {
      if (secondHalf - firstHalf >= 5) trend = 'up'
      else if (firstHalf - secondHalf >= 5) trend = 'down'
    }
    skills[skillId] = {
      skillId,
      score: average(group.accuracies),
      confidence: getConfidence(group.accuracies.length),
      sampleCount: group.accuracies.length,
      lastPracticedAt: sorted[sorted.length - 1] ?? null,
      trend,
      evidenceRefs: group.ids.slice(-10).map((practiceRecordId) => ({ practiceRecordId })),
      uncertainty: group.accuracies.length < 3 ? ['样本不足：少于 3 次，不能可靠判断趋势'] : []
    }
  }

  if (mastery) {
    const scorePerformance = skills['score-performance']
    const weakMeasures = Object.values(mastery.scores).flatMap((byMeasure) => Object.values(byMeasure))
      .filter(isMeasureWeak)
      .sort((left, right) => (left.pitchAccuracy ?? 0) - (right.pitchAccuracy ?? 0))
    if (weakMeasures.length > 0 && scorePerformance) {
      skills['score-performance'] = {
        ...scorePerformance,
        evidenceRefs: [...scorePerformance.evidenceRefs, ...weakMeasures.slice(0, 3).flatMap((measure) => measure.evidenceRefs)],
        uncertainty: [
          ...scorePerformance.uncertainty,
          `曲谱薄弱小节：${weakMeasures.slice(0, 3).map((measure) => `${measure.scoreId}#${measure.measureNumber}`).join('、')}`
        ]
      }
    }
  }

  return {
    version: 1,
    skills,
    updatedAt: now.toISOString()
  }
}
