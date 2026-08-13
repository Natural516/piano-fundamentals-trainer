import type { PeriodStats } from '../analytics/periodStats'
import type { PlanV2State } from '../plan/planV2'
import type { AiCoachLayers, AiChatMessage, AiRequestKind } from './aiTypes'

export interface CoachSnapshot {
  period: PeriodStats
  plan: PlanV2State
  curriculumStatuses: Array<{ exerciseId: string; status: string; currentTempo: number | null }>
}

const SYSTEM_PROMPT = [
  '你是钢琴基本功训练器的 AI 教练。',
  '只能基于用户提供的事实数据给出解释与建议。',
  '不得声称修改练习记录、不得伪造记录、不得自动晋级、不得修改长期计划。',
  '输出必须分为三层：facts（复述事实）、interpretation（解释）、recommendation（建议）。',
  '使用中文，建议要具体、可执行、可测量。'
].join('\n')

export function buildCoachSnapshot(
  period: PeriodStats,
  plan: PlanV2State,
  curriculumStatuses: CoachSnapshot['curriculumStatuses']
): CoachSnapshot {
  return { period, plan, curriculumStatuses }
}

export function buildCoachMessages(snapshot: CoachSnapshot, kind: AiRequestKind): AiChatMessage[] {
  const userContent = [
    `请求类型：${kind}`,
    `周期：${snapshot.period.period}；练习次数：${snapshot.period.sessions}；时长：${Math.round(snapshot.period.durationMs / 60000)} 分钟；样本置信度：${snapshot.period.confidence}`,
    snapshot.period.sightReadingAverageReactionMs !== null
      ? `识谱平均反应：${snapshot.period.sightReadingAverageReactionMs} ms`
      : '',
    snapshot.period.rhythmAverageOffsetMs !== null
      ? `节奏平均偏移：${snapshot.period.rhythmAverageOffsetMs} ms`
      : '',
    snapshot.period.chordWeakness !== '暂无' ? `和弦薄弱点：${snapshot.period.chordWeakness}` : '',
    `计划阶段：${snapshot.plan.profile.stage}；每日目标分钟：${snapshot.plan.profile.dailyMinutes}`,
    snapshot.curriculumStatuses.length > 0
      ? `教材进度：${snapshot.curriculumStatuses.map((entry) => `${entry.exerciseId}:${entry.status}`).join('；')}`
      : '教材进度：暂无数据',
    '请严格只输出 JSON：{"facts":[],"interpretation":[],"recommendation":[]}'
  ].filter(Boolean).join('\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ]
}

export function parseCoachResponse(text: string): AiCoachLayers {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    return { facts: [], interpretation: [], recommendation: [text.trim()] }
  }

  try {
    const parsed = JSON.parse(match[0]) as Partial<AiCoachLayers>
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
      interpretation: Array.isArray(parsed.interpretation) ? parsed.interpretation.map(String) : [],
      recommendation: Array.isArray(parsed.recommendation) ? parsed.recommendation.map(String) : []
    }
  } catch {
    return { facts: [], interpretation: [], recommendation: [text.trim()] }
  }
}

export function validateCoachOutput(layers: AiCoachLayers): boolean {
  const all = [...layers.facts, ...layers.interpretation, ...layers.recommendation].join('\n')
  if (all.length === 0) return false
  const forbidden = /已修改|已保存|自动晋级|标记为已掌握|已删除/
  return !forbidden.test(all)
}

export function getFallbackCoachLayers(snapshot: CoachSnapshot): AiCoachLayers {
  const facts = [
    `周期内共 ${snapshot.period.sessions} 次练习，累计 ${Math.round(snapshot.period.durationMs / 60000)} 分钟。`
  ]
  const recommendations: string[] = []
  if (snapshot.period.sessions === 0) {
    recommendations.push('暂无数据：建议先完成一次 10–20 分钟的练习后再请求建议。')
  } else {
    recommendations.push('数据样本不足或 AI 未配置：可先在设置中配置 AI，或继续积累练习数据。')
  }
  return { facts, interpretation: [], recommendation: recommendations }
}
