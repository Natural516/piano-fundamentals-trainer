import { getInversionCount } from './catalog'
import { nextChordPracticeUnit } from './generator'
import { getDiatonicSeventhIdentities, getDiatonicTriadIdentities } from './majorKeys'
import type { ChordSequentialMajorKeyId } from './majorKeys'
import type { ChordPracticeRng } from './generator'
import type { ChordPracticeQuestionIdentity } from './types'
import type { ChordQuestionCount } from './productContract'

function cloneIdentity(identity: ChordPracticeQuestionIdentity, inversionIndex = identity.inversionIndex): ChordPracticeQuestionIdentity {
  return Object.freeze({
    root: Object.freeze({ ...identity.root }),
    qualityId: identity.qualityId,
    inversionIndex
  })
}

export function getSequentialQuestionPool(
  keyId: ChordSequentialMajorKeyId,
  questionCount: ChordQuestionCount
): readonly ChordPracticeQuestionIdentity[] {
  const triads = getDiatonicTriadIdentities(keyId)
  const sevenths = getDiatonicSeventhIdentities(keyId)
  if (questionCount === 10 || questionCount === 20) return Object.freeze(triads.map((item) => cloneIdentity(item)))
  if (questionCount === 50) return Object.freeze([...triads, ...sevenths].map((item) => cloneIdentity(item)))
  const triadShapes = triads.flatMap((item) => Array.from(
    { length: getInversionCount(item.qualityId) },
    (_, inversionIndex) => cloneIdentity(item, inversionIndex)
  ))
  if (questionCount === 100) return Object.freeze([
    ...triadShapes,
    ...sevenths.map((item) => cloneIdentity(item))
  ])
  const seventhShapes = sevenths.flatMap((item) => Array.from(
    { length: getInversionCount(item.qualityId) },
    (_, inversionIndex) => cloneIdentity(item, inversionIndex)
  ))
  return Object.freeze([...triadShapes, ...seventhShapes])
}

export function chordQuestionIdentityKey(identity: ChordPracticeQuestionIdentity): string {
  return `${identity.root.letter}:${identity.root.accidental}:${identity.qualityId}:${identity.inversionIndex}`
}

function shuffle<T>(source: readonly T[], rng: ChordPracticeRng): T[] {
  const result = [...source]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextChordPracticeUnit(rng) * (index + 1))
    const value = result[index]
    result[index] = result[target]
    result[target] = value
  }
  return result
}

export class ChordSequentialShuffleBag {
  private bag: ChordPracticeQuestionIdentity[] = []
  private previousIdentityKey: string | null = null

  constructor(
    readonly keyId: ChordSequentialMajorKeyId,
    readonly questionCount: ChordQuestionCount,
    private readonly rng: ChordPracticeRng
  ) {}

  next(): ChordPracticeQuestionIdentity {
    if (this.bag.length === 0) this.refill()
    const next = this.bag.shift()!
    this.previousIdentityKey = chordQuestionIdentityKey(next)
    return next
  }

  private refill(): void {
    this.bag = shuffle(getSequentialQuestionPool(this.keyId, this.questionCount), this.rng)
    if (this.previousIdentityKey !== null
      && chordQuestionIdentityKey(this.bag[0]) === this.previousIdentityKey
      && this.bag.length > 1) {
      const replacementIndex = this.bag.findIndex((item, index) => index > 0 && chordQuestionIdentityKey(item) !== this.previousIdentityKey)
      if (replacementIndex > 0) {
        const first = this.bag[0]
        this.bag[0] = this.bag[replacementIndex]
        this.bag[replacementIndex] = first
      }
    }
  }
}
