import type { AbilityModelState } from '../ability/abilityModel'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import type { DailyTrainingPlan } from '../plan/planner'
import type { PlanItem } from '../plan/planner'
import type { PracticeRecordV2 } from '../records/practiceRecordV2'
import type { ScoreMasteryState } from '../ability/scoreMastery'
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
  intent: CoachQuestionIntent
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
  scoreSession?: CoachScoreSession | null
  scoreRecords?: PracticeRecordV2[]
  scoreMastery?: ScoreMasteryState | null
  currentPlanItem?: PlanItem | null
  scoreFacts?: {
    title: string
    timeSignature: string
    onsetPattern: number[]
    harmonyLabels: string[]
  } | null
}

export type CoachQuestionIntent =
  | 'WHY_ERROR'
  | 'HOW_TO_PRACTICE'
  | 'WHICH_HAND_FIRST'
  | 'COUNT_RHYTHM'
  | 'PLAN_SEGMENT'
  | 'PLAY_DEMO'
  | 'GENERAL'

export interface CoachScoreSessionFact {
  measure: number | null
  beat: number | null
  hand?: 'left' | 'right' | 'both' | null
  staff?: number | null
  outcome: string
  expectedMidi: number[]
  actualMidi: number | null
  sourceEventIds: string[]
}

export interface CoachScoreSession {
  scoreId: string
  segment: string
  recordId: string
  sessionId?: string
  mode: string
  facts: CoachScoreSessionFact[]
}

function recordRef(record: PracticeSessionRecord, measure?: number): EvidenceRef {
  return { practiceRecordId: record.id, measure: measure ?? null }
}

export function buildCoachContext(input: CoachContext): CoachContext {
  return input
}

export function classifyCoachQuestion(question: string): CoachQuestionIntent {
  const normalized = question.trim().toLowerCase()
  if (/为什么|原因|总错|总.*错|弹错|怎么会错/.test(normalized)) return 'WHY_ERROR'
  if (/怎么数|数拍|节奏怎么|拍子怎么/.test(normalized)) return 'COUNT_RHYTHM'
  if (/哪只手|先练.*手|左右手先/.test(normalized)) return 'WHICH_HAND_FIRST'
  if (/播放|示范|弹一遍|听一遍/.test(normalized)) return 'PLAY_DEMO'
  if (/安排|计划|分几遍|几小节怎么练/.test(normalized)) return 'PLAN_SEGMENT'
  if (/怎么练|如何练|练法/.test(normalized)) return 'HOW_TO_PRACTICE'
  return 'GENERAL'
}

/**
 * Deterministic (no-LLM) coach summary built strictly from facts. Guarantees
 * the training loop works without any API configuration.
 */
export function buildDeterministicCoachResponse(context: CoachContext): CoachResponse {
  const intent = classifyCoachQuestion(context.userQuestion)
  const observations: CoachObservation[] = []
  const diagnoses: CoachDiagnosis[] = []
  const recommendations: CoachRecommendation[] = []
  const uncertainty: string[] = []
  const evidenceRefs: EvidenceRef[] = []

  const session = context.scoreSession
  const problemFacts = session?.facts.filter((fact) =>
    ['wrong', 'missing', 'extra', 'early', 'late'].includes(fact.outcome)
  ) ?? []
  const refsFor = (facts: CoachScoreSessionFact[]): EvidenceRef[] => facts.slice(0, 6).flatMap((fact) => {
    const identity: EvidenceRef = session?.recordId
      ? { practiceRecordId: session.recordId }
      : session?.sessionId ? { sessionId: session.sessionId } : {}
    if (!identity.practiceRecordId && !identity.sessionId) return []
    return [{
      ...identity,
      scoreId: session?.scoreId ?? null,
      measure: fact.measure,
      beat: fact.beat,
      hand: fact.hand ?? null
    }]
  })
  const problemRefs = refsFor(problemFacts)
  evidenceRefs.push(...problemRefs)

  if (session) {
    observations.push({
      text: `本次《${session.scoreId}》第 ${session.segment} 小节记录到 ${problemFacts.length} 个错误/时序问题事件。`,
      evidenceRefs: problemRefs
    })
  }

  if (!session && context.recentRecords.length > 0) {
    const latest = context.recentRecords[0]
    const latestRef = recordRef(latest)
    evidenceRefs.push(latestRef)
    observations.push({
      text: `最近一次${latest.moduleName}正确率 ${latest.accuracy}%，错音 ${latest.wrongNoteCount}，漏音 ${latest.missingNoteCount}。`,
      evidenceRefs: [latestRef]
    })
    if (intent === 'WHY_ERROR') {
      diagnoses.push({
        text: '历史记录可确认错误数量，但不能定位当前选区的具体拍点。',
        evidenceRefs: [latestRef],
        confidence: 'low'
      })
    }
  }

  const selected = context.selectedMeasures
  const demo: DemoRequest[] = selected ? [{
    measureStart: selected.start,
    measureEnd: selected.end,
    handMode: 'both',
    tempoRatio: 0.6,
    loop: true
  }] : []
  let summary = selected
    ? `第 ${selected.start}–${selected.end} 小节：基于当前选区与可验证练习事实的建议。`
    : '基于当前选区与可验证练习事实的建议。'

  if (intent === 'COUNT_RHYTHM') {
    const signature = context.scoreFacts?.timeSignature ?? '当前拍号'
    const pattern = context.scoreFacts?.onsetPattern ?? []
    summary = `节奏数拍：${signature}，先稳定主拍，再加入细分。`
    observations.push({ text: `当前选区起音位置：${pattern.length > 0 ? pattern.join('、') : '暂无足够起音数据'}。`, evidenceRefs: problemRefs })
    recommendations.push({ text: '先口数“1 和 2 和 3 和 4 和”，只在谱面起音位置发声；连续三遍稳定后再上琴。', evidenceRefs: problemRefs })
  } else if (intent === 'WHICH_HAND_FIRST') {
    const right = problemFacts.filter((fact) => fact.hand === 'right').length
    const left = problemFacts.filter((fact) => fact.hand === 'left').length
    if (right === left) {
      summary = '现有证据不足以确定应先练哪只手。'
      uncertainty.push(`左右手可归属的问题数相同（右手 ${right}，左手 ${left}）。`)
    } else {
      const hand = right > left ? '右手' : '左手'
      summary = `建议先练${hand}：本次可归属问题更多（右手 ${right}，左手 ${left}）。`
      recommendations.push({ text: `${hand}以 60% 速度连续三遍无错，再加入另一只手。`, evidenceRefs: problemRefs.filter((ref) => ref.hand === (right > left ? 'right' : 'left')) })
    }
  } else if (intent === 'WHY_ERROR') {
    const grouped = new Map<string, number>()
    for (const fact of problemFacts) {
      const key = `${fact.measure ?? '?'}:${fact.beat ?? '?'}:${fact.hand ?? 'unknown'}`
      grouped.set(key, (grouped.get(key) ?? 0) + 1)
    }
    const worst = [...grouped.entries()].sort((left, right) => right[1] - left[1])[0]
    if (worst) {
      const [measure, beat, hand] = worst[0].split(':')
      summary = `最集中的问题在第 ${measure} 小节第 ${beat} 拍${hand === 'right' ? '右手' : hand === 'left' ? '左手' : ''}。`
      diagnoses.push({ text: `第 ${measure} 小节第 ${beat} 拍出现 ${worst[1]} 次可观测的错音、漏音、多音或时序偏差。`, evidenceRefs: problemRefs, confidence: 'medium' })
    } else {
      summary = selected
        ? `第 ${selected.start}–${selected.end} 小节目前没有足够的逐拍错误事实来解释“为什么总错”。`
        : '当前没有足够的错误事实来解释“为什么总错”。'
      uncertainty.push('MIDI 不能证明指法、手腕、姿势或紧张程度。')
    }
  } else if (intent === 'PLAN_SEGMENT') {
    summary = selected ? `第 ${selected.start}–${selected.end} 小节练习计划。` : '当前没有可安排的谱面选区。'
    recommendations.push({ text: '步骤 1：右手 Wait 60%；步骤 2：左手 Wait 60%；步骤 3：双手 Realtime 60%；每步连续三遍无错再进阶。', evidenceRefs: problemRefs })
  } else if (intent === 'PLAY_DEMO') {
    summary = selected ? `已准备第 ${selected.start}–${selected.end} 小节 60% 双手循环示范。` : '请先选择要示范的小节。'
  } else {
    summary = intent === 'HOW_TO_PRACTICE' ? '建议用可测量的分手—合手阶梯练法。' : summary
    recommendations.push({ text: '先以 60% 速度 Wait 分手练习，连续三遍无错后再双手 Realtime。', evidenceRefs: problemRefs })
  }

  if (!session && context.recentRecords.length === 0) uncertainty.push('尚无当前或历史练习事实，建议先完成一次练习。')

  return {
    intent,
    summary,
    observations,
    diagnoses,
    recommendations,
    demoRequests: demo,
    nextSteps: context.plan?.items.map((item) => `${item.exerciseId}（${item.minutes} 分钟）`) ?? ['按建议完成一轮', '再次练习并比较逐小节结果'],
    evidenceRefs,
    uncertainty,
    confidence: problemRefs.length > 0 ? 'medium' : 'low'
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
