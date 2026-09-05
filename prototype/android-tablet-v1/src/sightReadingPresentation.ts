import type { SightReadingRecordedOutcome } from '../../../src/sightReading/sightReadingSession'
import type { SightReadingNoteMode } from '../../../src/sightReading/sightReadingSettings'

export function getSightReadingPrompt(options: {
  intervalLabel: string | null
  noteMode: SightReadingNoteMode
  outcome: SightReadingRecordedOutcome | null
  paused: boolean
  pausedPrompt: string
}): string {
  if (options.paused) return options.pausedPrompt
  if (options.noteMode === 'double') {
    if (options.outcome === 'correct') return `正确 · ${options.intervalLabel}`
    if (options.outcome === 'wrong_note') return `错误 · 目标：${options.intervalLabel}`
    if (options.outcome === 'timeout') return `超时 · 目标：${options.intervalLabel}`
    return '请弹出这两个音'
  }
  if (options.outcome === 'correct') return '回答正确'
  if (options.outcome === 'wrong_note') return '这次弹错了'
  if (options.outcome === 'timeout') return '本题超时'
  return '请弹出这个音'
}

export function shouldShowSightReadingTargetNames(options: {
  noteNameVisible: boolean
  outcome: SightReadingRecordedOutcome | null
  paused: boolean
}): boolean {
  return !options.paused && (options.noteNameVisible || options.outcome !== null)
}
