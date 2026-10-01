import type { IntervalTypeDefinition, IntervalTypeId } from './types'
import { INTERVAL_TYPE_IDS } from './types'

function defineInterval(
  id: IntervalTypeId,
  chineseName: string,
  degree: number,
  semitones: number
): IntervalTypeDefinition {
  return Object.freeze({ id, chineseName, degree, semitones })
}

export const INTERVAL_TYPE_CATALOG: Readonly<Record<IntervalTypeId, IntervalTypeDefinition>> = Object.freeze({
  perfectUnison: defineInterval('perfectUnison', '纯一度', 1, 0),
  augmentedUnison: defineInterval('augmentedUnison', '增一度', 1, 1),
  diminishedSecond: defineInterval('diminishedSecond', '减二度', 2, 0),
  minorSecond: defineInterval('minorSecond', '小二度', 2, 1),
  majorSecond: defineInterval('majorSecond', '大二度', 2, 2),
  augmentedSecond: defineInterval('augmentedSecond', '增二度', 2, 3),
  diminishedThird: defineInterval('diminishedThird', '减三度', 3, 2),
  minorThird: defineInterval('minorThird', '小三度', 3, 3),
  majorThird: defineInterval('majorThird', '大三度', 3, 4),
  augmentedThird: defineInterval('augmentedThird', '增三度', 3, 5),
  diminishedFourth: defineInterval('diminishedFourth', '减四度', 4, 4),
  perfectFourth: defineInterval('perfectFourth', '纯四度', 4, 5),
  augmentedFourth: defineInterval('augmentedFourth', '增四度', 4, 6),
  diminishedFifth: defineInterval('diminishedFifth', '减五度', 5, 6),
  perfectFifth: defineInterval('perfectFifth', '纯五度', 5, 7),
  augmentedFifth: defineInterval('augmentedFifth', '增五度', 5, 8),
  diminishedSixth: defineInterval('diminishedSixth', '减六度', 6, 7),
  minorSixth: defineInterval('minorSixth', '小六度', 6, 8),
  majorSixth: defineInterval('majorSixth', '大六度', 6, 9),
  augmentedSixth: defineInterval('augmentedSixth', '增六度', 6, 10),
  diminishedSeventh: defineInterval('diminishedSeventh', '减七度', 7, 9),
  minorSeventh: defineInterval('minorSeventh', '小七度', 7, 10),
  majorSeventh: defineInterval('majorSeventh', '大七度', 7, 11),
  augmentedSeventh: defineInterval('augmentedSeventh', '增七度', 7, 12),
  diminishedOctave: defineInterval('diminishedOctave', '减八度', 8, 11),
  perfectOctave: defineInterval('perfectOctave', '纯八度', 8, 12)
})

export const INTERVAL_TYPES: readonly IntervalTypeDefinition[] = Object.freeze(
  INTERVAL_TYPE_IDS.map((id) => INTERVAL_TYPE_CATALOG[id])
)

export function getIntervalType(id: IntervalTypeId): IntervalTypeDefinition {
  const interval = INTERVAL_TYPE_CATALOG[id]
  if (!interval) throw new RangeError(`Unknown interval type: ${id}`)
  return interval
}
