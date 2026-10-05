import type { IntervalTypeId } from '../musicTheory/intervals/types'
import { resolveLegacySightNoteSnapshot } from '../../../../src/sightReading/legacyNoteSnapshot'

export type DisplayTranslator = (key: string) => string

/** Presentation receives a translator explicitly; stored intervalName is intentionally not an input. */
export function getIntervalDisplayName(intervalId: IntervalTypeId, translateMusic: DisplayTranslator): string {
  return translateMusic(`intervals.${intervalId}`)
}

export function getSightNoteDisplayValue(value: string | null, translateCommon: DisplayTranslator): string {
  const note = resolveLegacySightNoteSnapshot(value)
  return note === null ? translateCommon('noData') : note
}
