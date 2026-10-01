import type { IntervalTypeId } from '../musicTheory/intervals'

/** @deprecated Historical Phase 2 fixture; no longer exported or used by the product. */
type IntervalSequentialStageId = 1 | 2 | 3 | 4 | 5 | 6
interface IntervalSequentialStageDefinition {
  readonly id: IntervalSequentialStageId
  readonly label: string
  readonly introducedIntervalIds: readonly IntervalTypeId[]
  readonly allowedIntervalIds: readonly IntervalTypeId[]
}

interface StageIntroduction {
  readonly id: IntervalSequentialStageId
  readonly label: string
  readonly intervalIds: readonly IntervalTypeId[]
}

function defineStageIntroduction(
  id: IntervalSequentialStageId,
  label: string,
  intervalIds: readonly IntervalTypeId[]
): StageIntroduction {
  return Object.freeze({ id, label, intervalIds: Object.freeze([...intervalIds]) })
}

const STAGE_INTRODUCTIONS: readonly StageIntroduction[] = Object.freeze([
  defineStageIntroduction(1, '基础纯音程', ['perfectUnison', 'perfectFifth', 'perfectOctave']),
  defineStageIntroduction(2, '三度关系', ['majorThird', 'minorThird']),
  defineStageIntroduction(3, '四度与六度', ['perfectFourth', 'majorSixth', 'minorSixth']),
  defineStageIntroduction(4, '二度关系', ['majorSecond', 'minorSecond']),
  defineStageIntroduction(5, '七度关系', ['majorSeventh', 'minorSeventh']),
  defineStageIntroduction(6, '增减音程', ['augmentedFourth', 'diminishedFifth'])
])

let cumulative: IntervalTypeId[] = []
export const INTERVAL_SEQUENTIAL_STAGES: readonly IntervalSequentialStageDefinition[] = Object.freeze(
  STAGE_INTRODUCTIONS.map((stage) => {
    cumulative = [...cumulative, ...stage.intervalIds]
    return Object.freeze({
      id: stage.id,
      label: stage.label,
      introducedIntervalIds: stage.intervalIds,
      allowedIntervalIds: Object.freeze([...cumulative])
    })
  })
)

export function getIntervalSequentialStage(stageId: IntervalSequentialStageId): IntervalSequentialStageDefinition {
  const stage = INTERVAL_SEQUENTIAL_STAGES.find((candidate) => candidate.id === stageId)
  if (!stage) throw new RangeError(`Unknown interval sequential stage: ${stageId}`)
  return stage
}
