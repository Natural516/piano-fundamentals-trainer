import { midiNumberToNoteName } from '../utils/midiNotes'
import type { ChordFeedback, ChordTarget } from '../utils/chordTypes'

interface ChordTargetViewProps {
  target: ChordTarget | null
  feedback: ChordFeedback | null
  showNoteNames: boolean
}

function formatNotes(notes: number[]): string {
  return notes.length > 0 ? notes.map(midiNumberToNoteName).join('  ') : '-'
}

function getFeedbackTitle(feedback: ChordFeedback | null): string {
  if (!feedback) {
    return '等待输入'
  }

  if (feedback.type === 'correct') return '正确'
  if (feedback.type === 'missing_note') return '漏音'
  if (feedback.type === 'extra_note') return '多音'
  return '错音'
}

export function ChordTargetView({
  feedback,
  showNoteNames,
  target
}: ChordTargetViewProps): JSX.Element {
  return (
    <div className="chord-target-view">
      <div className="chord-target-main">
        <span>当前目标</span>
        <strong>{target ? target.label : '点击开始练习'}</strong>
        <p>{target ? (showNoteNames ? target.noteNames.join('  ') : '目标音名隐藏') : '选择设置后开始柱式和弦练习'}</p>
      </div>

      <div className={`chord-feedback-box ${feedback ? `result-${feedback.type}` : ''}`}>
        <span>判定结果</span>
        <strong>{getFeedbackTitle(feedback)}</strong>
        {feedback ? (
          <div className="chord-feedback-detail">
            <p>实际输入：{formatNotes(feedback.inputNotes)}</p>
            {feedback.type !== 'correct' ? (
              <>
                <p>目标音：{formatNotes(feedback.target.notes)}</p>
                {feedback.missingNotes.length > 0 ? <p>缺少：{formatNotes(feedback.missingNotes)}</p> : null}
                {feedback.extraNotes.length > 0 ? <p>多出：{formatNotes(feedback.extraNotes)}</p> : null}
              </>
            ) : null}
          </div>
        ) : (
          <small>请在 150ms 输入窗口内同时按下目标和弦音。</small>
        )}
      </div>
    </div>
  )
}
