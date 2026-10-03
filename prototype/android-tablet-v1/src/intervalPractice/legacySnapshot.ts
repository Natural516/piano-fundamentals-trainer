import { getIntervalType } from '../musicTheory/intervals/catalog'
import type { IntervalTypeId } from '../musicTheory/intervals/types'

/** V1 storage compatibility only. Never a display authority, never dependent on current locale. */
export function getCanonicalIntervalSnapshotName(intervalId: IntervalTypeId): string {
  return getIntervalType(intervalId).chineseName
}
