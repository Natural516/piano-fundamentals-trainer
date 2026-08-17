import type { AiClient } from './aiProvider'
import type { AiChatMessage } from './aiTypes'
import type { CoachContext, CoachResponse, DemoRequest } from './coach2'
import { filterUnobservableClaims } from './coach2'
import { resolveEvidenceRefs, type EvidenceRepositories } from './evidenceResolver'
import type { EvidenceRef } from '../records/practiceRecordV2'

export interface ScoreCoachProviderResult {
  response: CoachResponse
  providerUsed: boolean
  error?: string
}

export function buildScoreCoachProviderMessages(
  context: CoachContext,
  deterministic: CoachResponse
): AiChatMessage[] {
  const payload = {
    userQuestion: context.userQuestion,
    score: context.scoreFacts,
    selectedMeasures: context.selectedMeasures,
    currentSession: context.scoreSession,
    relevantHistoricalRecords: context.recentRecords.slice(0, 5).map((record) => ({
      id: record.id,
      module: record.module,
      endedAt: record.endedAt,
      accuracy: record.accuracy,
      wrong: record.wrongNoteCount,
      missing: record.missingNoteCount,
      extra: record.extraNoteCount
    })),
    relevantScoreRecords: context.scoreRecords?.slice(0, 5).map((record) => ({
      id: record.id,
      scoreId: record.scoreId,
      segment: record.segment,
      endedAt: record.endedAt,
      perMeasureMetrics: record.perMeasureMetrics
    })) ?? [],
    relevantScoreMastery: context.scoreMastery && context.scoreFacts
      ? context.scoreMastery.scores[context.scoreFacts.title] ?? {}
      : {},
    relevantAbility: Object.fromEntries(Object.entries(context.ability.skills).map(([id, skill]) => [id, {
      score: skill.score,
      confidence: skill.confidence,
      sampleCount: skill.sampleCount
    }])),
    currentPlanItem: context.currentPlanItem ?? null,
    deterministicObservations: deterministic.observations,
    deterministicIntent: deterministic.intent
  }
  return [{
    role: 'system',
    content: [
      '你是钢琴练习应用中的证据约束教练。',
      '输入中的 deterministic facts 不可改写，不得编造未提供的错误。',
      'MIDI 不能证明指法、手腕、姿势、放松或紧张；不确定时必须明确说明。',
      '建议必须具体、可执行、可测量，并尽量引用小节与拍。',
      'DemoRequest 只能使用 selectedMeasures 的真实范围，音符由 ScoreModel 决定。',
      '只输出一个 JSON 对象，字段为 summary, observations, diagnoses, recommendations, demoRequests, nextSteps, evidenceRefs, uncertainty, confidence。'
    ].join('\n')
  }, {
    role: 'user',
    content: JSON.stringify(payload)
  }]
}

function asTextArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 12) : []
}

function asEvidenceRefs(value: unknown): EvidenceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as EvidenceRef
    if (!candidate.practiceRecordId && !candidate.sessionId) return []
    return [{
      practiceRecordId: typeof candidate.practiceRecordId === 'string' ? candidate.practiceRecordId : undefined,
      sessionId: typeof candidate.sessionId === 'string' ? candidate.sessionId : undefined,
      scoreId: typeof candidate.scoreId === 'string' ? candidate.scoreId : null,
      measure: typeof candidate.measure === 'number' ? candidate.measure : null,
      beat: typeof candidate.beat === 'number' ? candidate.beat : null,
      hand: candidate.hand === 'left' || candidate.hand === 'right' || candidate.hand === 'both' ? candidate.hand : null,
      staff: typeof candidate.staff === 'number' ? candidate.staff : null,
      sourceEventId: typeof candidate.sourceEventId === 'string' ? candidate.sourceEventId : null,
      metric: typeof candidate.metric === 'string' ? candidate.metric : null,
      errorEventId: typeof candidate.errorEventId === 'string' ? candidate.errorEventId : null
    }]
  }).slice(0, 20)
}

function asDemoRequests(value: unknown, context: CoachContext): DemoRequest[] {
  if (!Array.isArray(value) || !context.selectedMeasures) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<DemoRequest>
    if (typeof candidate.measureStart !== 'number' || typeof candidate.measureEnd !== 'number') return []
    if (candidate.measureStart < context.selectedMeasures!.start || candidate.measureEnd > context.selectedMeasures!.end || candidate.measureEnd < candidate.measureStart) return []
    const handMode: DemoRequest['handMode'] = candidate.handMode === 'left' || candidate.handMode === 'right' ? candidate.handMode : 'both'
    return [{
      measureStart: candidate.measureStart,
      measureEnd: candidate.measureEnd,
      handMode,
      tempoRatio: typeof candidate.tempoRatio === 'number' ? Math.min(1.5, Math.max(0.25, candidate.tempoRatio)) : 0.6,
      loop: Boolean(candidate.loop)
    }]
  }).slice(0, 3)
}

function parseStructuredResponse(content: string, context: CoachContext, fallback: CoachResponse): CoachResponse | null {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    if (typeof parsed.summary !== 'string') return null
    const observations = Array.isArray(parsed.observations) ? parsed.observations.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || typeof (entry as { text?: unknown }).text !== 'string') return []
      return [{ text: (entry as { text: string }).text, evidenceRefs: asEvidenceRefs((entry as { evidenceRefs?: unknown }).evidenceRefs) }]
    }) : []
    const diagnoses = Array.isArray(parsed.diagnoses) ? parsed.diagnoses.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || typeof (entry as { text?: unknown }).text !== 'string') return []
      const candidate = entry as { text: string; evidenceRefs?: unknown; confidence?: unknown }
      const confidence: 'high' | 'medium' | 'low' = candidate.confidence === 'high' || candidate.confidence === 'medium' ? candidate.confidence : 'low'
      return [{ text: candidate.text, evidenceRefs: asEvidenceRefs(candidate.evidenceRefs), confidence }]
    }) : []
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || typeof (entry as { text?: unknown }).text !== 'string') return []
      const candidate = entry as { text: string; evidenceRefs?: unknown; exerciseId?: unknown }
      return [{ text: candidate.text, evidenceRefs: asEvidenceRefs(candidate.evidenceRefs), exerciseId: typeof candidate.exerciseId === 'string' ? candidate.exerciseId : undefined }]
    }) : []
    return filterUnobservableClaims({
      intent: fallback.intent,
      summary: parsed.summary,
      observations,
      diagnoses,
      recommendations,
      demoRequests: asDemoRequests(parsed.demoRequests, context),
      nextSteps: asTextArray(parsed.nextSteps),
      evidenceRefs: asEvidenceRefs(parsed.evidenceRefs),
      uncertainty: asTextArray(parsed.uncertainty),
      confidence: parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low'
    })
  } catch {
    return null
  }
}

export async function requestScoreCoachFromProvider(
  context: CoachContext,
  fallback: CoachResponse,
  client: AiClient,
  repositories: EvidenceRepositories
): Promise<ScoreCoachProviderResult> {
  const result = await client.chat(buildScoreCoachProviderMessages(context, fallback))
  if (!result.ok) return { response: fallback, providerUsed: false, error: result.error ?? 'AI provider request failed' }
  const parsed = parseStructuredResponse(result.content, context, fallback)
  if (!parsed) return { response: fallback, providerUsed: false, error: 'AI structured output validation failed' }
  if (parsed.diagnoses.some((diagnosis) => diagnosis.evidenceRefs.length === 0)) {
    return { response: fallback, providerUsed: false, error: 'AI diagnosis is missing evidence' }
  }
  const allRefs = [
    ...parsed.evidenceRefs,
    ...parsed.observations.flatMap((entry) => entry.evidenceRefs),
    ...parsed.diagnoses.flatMap((entry) => entry.evidenceRefs),
    ...parsed.recommendations.flatMap((entry) => entry.evidenceRefs)
  ]
  if (allRefs.some((ref) => !resolveEvidenceRefs([ref], repositories)[0]?.valid)) {
    return { response: fallback, providerUsed: false, error: 'AI evidence validation failed' }
  }
  return { response: parsed, providerUsed: true }
}
