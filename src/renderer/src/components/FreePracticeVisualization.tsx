import { useMemo, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useMidiEventSubscription } from '../hooks/useMidiEvents'
import {
  createFreePracticeVisualizationState,
  createFreePracticeNotationColumns,
  reduceFreePracticeVisualizationEvent
} from '../utils/freePracticeVisualization'
import {
  freePracticeVisualizationDiagnostics,
  getVisualizationDiagnosticNow
} from '../utils/freePracticeVisualizationDiagnostics'
import { FreePracticeStaffRenderer } from './FreePracticeStaffRenderer'
import { VirtualPianoKeyboard } from './VirtualPianoKeyboard'

interface FreePracticeVisualizationProps {
  activeNotes: readonly ActiveMidiNote[]
}

export function FreePracticeVisualization({
  activeNotes
}: FreePracticeVisualizationProps): JSX.Element {
  const initialStateRef = useRef(createFreePracticeVisualizationState())
  const visualizationStateRef = useRef(initialStateRef.current)
  const [visualizationState, setVisualizationState] = useState(initialStateRef.current)
  const pressedNotes = useMemo(
    () => activeNotes.map((note) => note.midiNumber),
    [activeNotes]
  )
  const notationColumns = useMemo(
    () => createFreePracticeNotationColumns(visualizationState.history),
    [visualizationState.history]
  )

  useMidiEventSubscription((event) => {
    if (event.type !== 'noteOn' || (event.velocity ?? 0) <= 0) return
    const handlerAt = getVisualizationDiagnosticNow()
    const nextState = reduceFreePracticeVisualizationEvent(visualizationStateRef.current, event)
    if (nextState === visualizationStateRef.current) return

    freePracticeVisualizationDiagnostics.markHandler(event, handlerAt, Date.now())
    visualizationStateRef.current = nextState
    const stateUpdateAt = getVisualizationDiagnosticNow()
    freePracticeVisualizationDiagnostics.markStateUpdate(event.id, stateUpdateAt)
    setVisualizationState(nextState)
  })

  const history = visualizationState.history

  return (
    <div className="free-practice-visualization">
      <section className="free-practice-grand-staff" aria-labelledby="free-practice-recent-title">
        <div className="free-practice-visualization__heading">
          <strong id="free-practice-recent-title">最近弹奏</strong>
          <span>仅显示攻击顺序，不表示节奏或时值</span>
        </div>
        <div className="free-practice-grand-staff__stage">
          <FreePracticeStaffRenderer
            columns={notationColumns}
            latestEventId={visualizationState.lastNoteOnEventId}
            ariaLabel={history.length > 0 ? '最近弹奏的 Grand Staff 音符历史' : '最近弹奏 Grand Staff，当前没有音符'}
            onRenderReady={(eventId, commitAt) => freePracticeVisualizationDiagnostics.markCommit(eventId, commitAt)}
          />
          {history.length === 0 ? (
            <p className="free-practice-grand-staff__empty">弹下琴键后，最近的音符会从左向右显示</p>
          ) : null}
        </div>
      </section>

      <section className="free-practice-piano" aria-label="实时 MIDI 琴键反馈">
        <div className="free-practice-visualization__heading">
          <strong>虚拟钢琴</strong>
          <span>A0–C8 · 物理按键实时反馈</span>
        </div>
        <VirtualPianoKeyboard
          pressedNotes={pressedNotes}
          range={[21, 108]}
          labels="octaves"
          fitToWidth
          ariaLabel="A0 到 C8 的 88 键虚拟钢琴"
        />
      </section>
    </div>
  )
}
