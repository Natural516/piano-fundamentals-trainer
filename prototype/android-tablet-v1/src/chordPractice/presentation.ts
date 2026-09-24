import type { ChordGroupVisualState } from '../chordPracticeMocks'
import type { ChordRuntimeSnapshot } from './runtime'

export type ChordPracticeFeedbackSemantic = 'neutral' | 'success' | 'danger' | 'warning'

export interface ChordPracticePresentation {
  readonly arpeggio: ChordGroupVisualState
  readonly block: ChordGroupVisualState
  readonly prompt: string
  readonly semantic: ChordPracticeFeedbackSemantic
  readonly stageLabel: '分解' | '过渡' | '柱式' | '完成'
}

/**
 * Maps the existing Chord state machine to presentation-only feedback semantics.
 * This layer deliberately owns no judgement, timing, MIDI, persistence, or
 * per-note answer classification.
 */
export function presentChordPractice(snapshot: ChordRuntimeSnapshot): ChordPracticePresentation {
  const state = snapshot.judgement?.state
  if (snapshot.status === 'SESSION_COMPLETE' || state?.phase === 'QUESTION_COMPLETE') {
    return {
      arpeggio: 'completed',
      block: 'completed',
      prompt: snapshot.status === 'SESSION_COMPLETE' ? '本轮练习完成' : '正确',
      semantic: 'success',
      stageLabel: '完成'
    }
  }
  if (state?.phase === 'ARPEGGIO_WRONG_WAIT_RELEASE') {
    return { arpeggio: 'wrong', block: 'secondary', prompt: '松开琴键后从分解第一个音重新开始', semantic: 'danger', stageLabel: '分解' }
  }
  if (state?.phase === 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK') {
    return { arpeggio: 'completed', block: 'secondary', prompt: '分解完成 · 请松开琴键', semantic: 'warning', stageLabel: '过渡' }
  }
  if (state?.phase === 'BLOCK_WRONG_WAIT_RELEASE') {
    return { arpeggio: 'completed', block: 'wrong', prompt: '柱式错误 · 松开琴键后从分解重新开始', semantic: 'danger', stageLabel: '柱式' }
  }
  if (state?.phase === 'WAIT_ALL_KEYS_UP_AFTER_BLOCK') {
    return { arpeggio: 'completed', block: 'completed', prompt: '柱式完成 · 请松开琴键', semantic: 'warning', stageLabel: '过渡' }
  }
  const resumeTarget = state?.phase === 'SUSPENDED' || state?.phase === 'RESUME_WAIT_ALL_KEYS_UP'
    ? state.resumeTarget
    : null
  if (state?.phase === 'BLOCK_READY' || state?.phase === 'BLOCK_CAPTURE' || resumeTarget === 'BLOCK_READY') {
    return { arpeggio: 'completed', block: 'active', prompt: '请弹奏柱式和弦', semantic: 'neutral', stageLabel: '柱式' }
  }
  if (resumeTarget === 'QUESTION_COMPLETE') {
    return { arpeggio: 'completed', block: 'completed', prompt: '柱式完成 · 请松开琴键', semantic: 'warning', stageLabel: '过渡' }
  }
  return { arpeggio: 'active', block: 'secondary', prompt: '请按谱面顺序弹奏分解和弦', semantic: 'neutral', stageLabel: '分解' }
}
