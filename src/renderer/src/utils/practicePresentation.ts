import type { AbilitySkillId } from '../ability/abilityModel'
import type { PlanItem } from '../plan/planner'
import { EXERCISE_LIBRARY } from '../prescription/exerciseLibrary'
import type { PageId } from '../types'

const skillLabels: Record<AbilitySkillId, string> = {
  'sight-reading': '识谱',
  rhythm: '节奏',
  scale: '音阶',
  chord: '和弦',
  coordination: '左右手协调',
  'score-performance': '曲谱练习'
}

const skillPages: Partial<Record<AbilitySkillId, PageId>> = {
  'sight-reading': 'sight-reading',
  rhythm: 'rhythm',
  scale: 'scales',
  chord: 'chords',
  coordination: 'coordination',
  'score-performance': 'score-practice'
}

export function getSkillLabel(skillId: AbilitySkillId): string {
  return skillLabels[skillId]
}

export function getPlanItemPage(item: PlanItem): PageId | null {
  const firstSkill = item.targetSkillIds[0]
  return firstSkill ? skillPages[firstSkill] ?? null : null
}

export function getPlanItemTitle(item: PlanItem): string {
  const scoreMatch = /^score:(.+):(\d+)$/.exec(item.exerciseId)
  if (scoreMatch) return `《${scoreMatch[1]}》第 ${scoreMatch[2]} 小节`
  return EXERCISE_LIBRARY.find((exercise) => exercise.id === item.exerciseId)?.title
    ?? (item.targetSkillIds[0] ? `${getSkillLabel(item.targetSkillIds[0])}练习` : '基础练习')
}

export function getPlanItemSkillLabel(item: PlanItem): string {
  return item.targetSkillIds.map(getSkillLabel).join(' · ') || '基础训练'
}

export function getPracticeModeLabel(mode?: string | null): string {
  if (mode === 'wait') return '弹对后继续'
  if (mode === 'realtime') return '跟随节拍'
  if (mode === 'teaching') return '示范播放'
  return mode ? '按当前设置' : ''
}

export function getHandLabel(hand?: string | null): string {
  if (hand === 'right') return '右手'
  if (hand === 'left') return '左手'
  if (hand === 'both') return '双手'
  return ''
}

export function getPlanItemSuccessCopy(item: PlanItem): string {
  if (item.criteria?.type === 'score-segment') {
    const criteria = item.criteria
    const range = criteria.startMeasure === criteria.endMeasure
      ? `第 ${criteria.startMeasure} 小节`
      : `第 ${criteria.startMeasure}–${criteria.endMeasure} 小节`
    const mode = getPracticeModeLabel(criteria.mode)
    const hand = getHandLabel(criteria.handMode)
    const goal = criteria.requireNoErrors ? '完整弹对' : `音符正确率达到 ${criteria.minimumPitchAccuracy}%`
    return `${range} · ${mode} · ${hand} · 连续 ${criteria.requiredConsecutiveSuccesses} 次${goal}`
  }

  return item.successCriteria
    .replace(/miss=0/g, '没有漏拍')
    .replace(/\|偏移\| 中位数/g, '节拍偏差')
    .replace(/Wait/g, '弹对后继续')
    .replace(/Realtime/g, '跟随节拍')
}

export function getPlanItemReasonCopy(item: PlanItem): string {
  if (item.evidenceRefs.length > 0) {
    return item.targetSkillIds.includes('score-performance')
      ? '近期曲谱记录显示，这个片段值得优先巩固。'
      : `近期练习记录显示，${getPlanItemSkillLabel(item)}仍值得优先巩固。`
  }
  return '目前还没有足够样本，先用这项练习保持今天的训练均衡。'
}
