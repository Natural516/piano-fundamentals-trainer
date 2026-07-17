import { useCallback, useEffect, useRef, useState } from 'react'
import { savePracticeRecord } from '../utils/practiceRecordStorage'
import type { PracticeSessionRecord, PracticeSessionTiming } from '../utils/practiceRecordTypes'

interface UsePracticeSessionRecorderResult {
  beginSession: () => string
  saveError: string
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `practice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function usePracticeSessionRecorder(
  completed: boolean,
  createRecord: (timing: PracticeSessionTiming) => PracticeSessionRecord | null
): UsePracticeSessionRecorderResult {
  const sessionRef = useRef<{ id: string; startedAtMs: number } | null>(null)
  const savedSessionIdRef = useRef('')
  const [saveError, setSaveError] = useState('')

  const beginSession = useCallback(() => {
    const id = createSessionId()
    sessionRef.current = { id, startedAtMs: Date.now() }
    savedSessionIdRef.current = ''
    setSaveError('')
    return id
  }, [])

  useEffect(() => {
    const session = sessionRef.current
    if (!completed || !session || savedSessionIdRef.current === session.id) return

    const endedAtMs = Date.now()
    const record = createRecord({
      id: session.id,
      startedAt: new Date(session.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - session.startedAtMs)
    })

    if (!record) return

    savedSessionIdRef.current = session.id
    const result = savePracticeRecord(record)
    setSaveError(result.message ?? '')
  }, [completed, createRecord])

  return { beginSession, saveError }
}
