import type { PageId } from '../types'

export const PAGE_HASHES: Record<PageId, `#/${string}`> = {
  home: '#/home',
  records: '#/records',
  analytics: '#/analytics',
  badges: '#/badges',
  settings: '#/settings',
  'training-plan': '#/training-plan',
  'sight-reading': '#/sight-reading',
  rhythm: '#/rhythm',
  scales: '#/scales',
  chords: '#/chords',
  coordination: '#/coordination',
  'free-practice': '#/free-practice',
  'score-practice': '#/score-practice',
  'midi-test': '#/midi-test',
  metronome: '#/metronome',
  help: '#/help'
}

export const TOP_LEVEL_PAGE_IDS = Object.keys(PAGE_HASHES) as PageId[]

export interface PageHistoryState {
  pianoTrainerPage: true
  version: 1
  page: PageId
  index: number
}

const pageIds = new Set<string>(TOP_LEVEL_PAGE_IDS)

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && pageIds.has(value)
}

export function getPageHash(page: PageId): string {
  return PAGE_HASHES[page]
}

export function getPageFromHash(hash: string): PageId {
  const candidate = hash.startsWith('#/') ? hash.slice(2) : ''
  return isPageId(candidate) ? candidate : 'home'
}

export function getPageUrl(page: PageId, location: Pick<Location, 'pathname' | 'search'> = window.location): string {
  return `${location.pathname}${location.search}${getPageHash(page)}`
}

export function createPageHistoryState(page: PageId, index: number): PageHistoryState {
  return { pianoTrainerPage: true, version: 1, page, index }
}

export function readPageHistoryState(value: unknown): PageHistoryState | null {
  if (typeof value !== 'object' || value === null) return null
  const state = value as Partial<PageHistoryState>
  if (state.pianoTrainerPage !== true || state.version !== 1 || !isPageId(state.page)) return null
  if (typeof state.index !== 'number' || !Number.isInteger(state.index)) return null
  return state as PageHistoryState
}
