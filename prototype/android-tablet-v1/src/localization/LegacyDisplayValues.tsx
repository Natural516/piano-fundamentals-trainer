import { useTranslation } from 'react-i18next'
import type { IntervalTypeId } from '../musicTheory/intervals/types'
import { getIntervalDisplayName, getSightNoteDisplayValue } from './legacyPresentation'

export function IntervalDisplayName({ intervalId }: { intervalId: IntervalTypeId }): JSX.Element {
  const { t } = useTranslation('music')
  return <>{getIntervalDisplayName(intervalId, (key) => t(key))}</>
}

export function SightNoteValue({ value }: { value: string | null }): JSX.Element {
  const { t } = useTranslation('common')
  return <>{getSightNoteDisplayValue(value, (key) => t(key))}</>
}
