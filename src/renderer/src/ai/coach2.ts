import type { AbilityModelState } from '../ability/abilityModel'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import type { DailyTrainingPlan } from '../plan/planner'
import type { EvidenceRef } from '../records/practiceRecordV2'
import { isUnobservableFromMidi } from '../records/practiceRecordV2'

export interface CoachObservation {
  text: string
  evidenceRefs: EvidenceRef[]
}

export interface CoachDiagnosis {
  text: string
  evidenceRefs: EvidenceRef[]
  confidence: 'high' | 'medium' | 'low'
}

export interface CoachRecommendation {
  text: string
  exerciseId?: string
  evidenceRefs: EvidenceRef[]
}

export interface DemoRequest {
  measureStart: number
  measureEnd: number
  handMode: 'left' | 'right' | 'both'
  tempoRatio: number
  loop: boolean
}

export interface CoachResponse {
  summary: string
  observations: CoachObservation[]
  diagnoses: CoachDiagnosis[]
  recommendations: CoachRecommendation[]
  demoRequests: DemoRequest[]
  nextSteps: string[]
  evidenceRefs: EvidenceRef[]
  uncertainty: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface CoachContext {
  selectedMeasures?: { start: number; end: number } | null
  recentRecords: PracticeSessionRecord[]
  ability: AbilityModelState
  plan: DailyTrainingPlan | null
  userQuestion: string
}

function recordRef(record: PracticeSessionRecord, measure?: number): EvidenceRef {
  return { practiceRecordId: record.id, measure: measure ?? null }
}

export function buildCoachContext(input: CoachContext): CoachContext {
  return input
}

/**
 * Deterministic (no-LLM) coach summary built strictly from facts. Guarantees
 * the training loop works without any API configuration.
 */
export function buildDeterministicCoachResponse(context: CoachContext): CoachResponse {
  const observations: CoachObservation[] = []
  const diagnoses: CoachDiagnosis[] = []
  const recommendations: CoachRecommendation[] = []
  const uncertainty: string[] = []
  const evidenceRefs: EvidenceRef[] = []

  if (context.recentRecords.length === 0) {
    uncertainty.push('尚无近期练习记录，无法给出基于证据的诊断。')
    return {
      summary: '暂无足够数据。请先完成至少一次练习，再请求 AI 分析。',
      observations,
      diagnoses,
      recommendations: [{
        text: '建议先完成 10–20 分钟的基础训练（识谱/节奏/音阶任选）。',
        evidenceRefs: []
      }],
      demoRequests: [],
      nextSteps: ['完成一次基础训练', '回到 AI 教练再次提问'],
      evidenceRefs,
      uncertainty,
      confidence: 'low'
    }
  }

  const latest = context.recentRecords[0]
  const latestRef = recordRef(latest)
  evidenceRefs.push(latestRef)
  observations.push({
    text: `最近一次练习：${latest.moduleName}，正确率 ${latest.accuracy}%，时长 ${Math.round(latest.durationMs / 60000)} 分钟。`,
    evidenceRefs: [latestRef]
  })

  const scaleSkill = context.ability.skills.scale
  if (scaleSkill && scaleSkill.sampleCount >= 3 && scaleSkill.score !== null && scaleSkill.score < 70) {
    diagnoses.push({
      text: `音阶能力分数偏低（${scaleSkill.score}，样本 ${scaleSkill.sampleCount}），需要专项巩固。`,
      evidenceRefs: scaleSkill.evidenceRefs.slice(0, 3),
      confidence: 'medium'
    })
    recommendations.push({
      text: '建议今日加入音阶练习：目标音阶慢速连续 3 遍无错。',
      exerciseId: 'scale-C-right-ascending',
      evidenceRefs: scaleSkill.evidenceRefs.slice(0, 3)
    })
  }

  if (context.selectedMeasures) {
    const demo: DemoRequest = {
      measureStart: context.selectedMeasures.start,
      measureEnd: context.selectedMeasures.end,
      handMode: 'both',
      tempoRatio: 0.6,
      loop: true
    }
    recommendations.push({
      text: `先以 60% 速度循环第 ${context.selectedMeasures.start}–${context.selectedMeasures.end} 小节。`,
      evidenceRefs: [latestRef]
    })
    return {
      summary: `针对选区第 ${context.selectedMeasures.start}–${context.selectedMeasures.end} 小节的分析与练习建议。`,
      observations,
      diagnoses,
      recommendations,
      demoRequests: [demo],
      nextSteps: ['播放 60% 速度示范', '先分手慢练', '再双手合练'],
      evidenceRefs,
      uncertainty,
      confidence: 'medium'
    }
  }

  return {
    summary: '基于近期练习事实的确定性总结。',
    observations,
    diagnoses,
    recommendations,
    demoRequests: [],
    nextSteps: context.plan?.items.map((item) => `${item.exerciseId}（${item.minutes} 分钟）`) ?? [],
    evidenceRefs,
    uncertainty,
    confidence: 'medium'
  }
}

export function validateDiagnosisGrounding(response: CoachResponse): boolean {
  return response.diagnoses.every((diagnosis) => diagnosis.evidenceRefs.length > 0)
}

export function filterUnobservableClaims(response: CoachResponse): CoachResponse {
  const flagged: string[] = []
  const clean = (text: string): string => {
    if (isUnobservableFromMidi(text)) {
      flagged.push(text)
      return `${text}（注：此判断需要额外 Ground Truth，仅 MIDI 无法确认）`
    }
    return text
  }

  return {
    ...response,
    diagnoses: response.diagnoses.map((diagnosis) => ({ ...diagnosis, text: clean(diagnosis.text) })),
    observations: response.observations.map((observation) => ({ ...observation, text: clean(observation.text) })),
    uncertainty: [...response.uncertainty, ...flagged.map((text) => `已标注不可观测声称：${text}`)]
  }
}
