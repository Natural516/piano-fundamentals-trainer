import { useEffect, useState } from 'react'
import { getSightReadingAnswerProgress } from '../utils/sightReadingSession'
import { SIGHT_READING_ANSWER_TIMEOUT_MS } from '../utils/sightReadingSettings'

interface SightReadingTimeBarProps {
  getRemainingTimeMs: () => number
  isFeedback: boolean
  isPaused: boolean
  isRunning: boolean
}

function clampRemainingTime(value: number): number {
  return Math.min(SIGHT_READING_ANSWER_TIMEOUT_MS, Math.max(0, value))
}

export function SightReadingTimeBar({
  getRemainingTimeMs,
  isFeedback,
  isPaused,
  isRunning
}: SightReadingTimeBarProps): JSX.Element {
  const [remainingTimeMs, setRemainingTimeMs] = useState(SIGHT_READING_ANSWER_TIMEOUT_MS)

  useEffect(() => {
    let animationFrameId = 0

    const updateProgress = (): void => {
      const nextRemainingTimeMs = isRunning
        ? clampRemainingTime(getRemainingTimeMs())
        : SIGHT_READING_ANSWER_TIMEOUT_MS
      setRemainingTimeMs((current) => (
        Math.abs(current - nextRemainingTimeMs) < 1 ? current : nextRemainingTimeMs
      ))

      if (isRunning && !isPaused && !isFeedback) {
        animationFrameId = window.requestAnimationFrame(updateProgress)
      }
    }

    updateProgress()
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [getRemainingTimeMs, isFeedback, isPaused, isRunning])

  const answerProgress = getSightReadingAnswerProgress(
    remainingTimeMs,
    SIGHT_READING_ANSWER_TIMEOUT_MS
  )
  const isWarning = isRunning && remainingTimeMs > 0 && remainingTimeMs <= 1000

  return (
    <div
      className={`sight-reading-time-bar${isWarning ? ' is-warning' : ''}${isRunning ? '' : ' is-inactive'}`}
      role="progressbar"
      aria-label="本题剩余时间"
      aria-valuemin={0}
      aria-valuemax={SIGHT_READING_ANSWER_TIMEOUT_MS}
      aria-valuenow={Math.round(remainingTimeMs)}
    >
      <span style={{ transform: `scaleX(${answerProgress})` }} />
    </div>
  )
}
