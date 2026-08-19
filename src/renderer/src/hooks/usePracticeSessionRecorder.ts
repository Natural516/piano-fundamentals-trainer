import { useCallback, useEffect, useRef, useState } from 'react'
import { savePracticeRecord } from '../utils/practiceRecordStorage'
import type { PracticeSessionRecord, PracticeSessionTiming } from '../utils/practiceRecordTypes'
import { fromLegacyRecord } from '../records/practiceRecordV2'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import {
  practiceSessionRepository,
  type PracticeSessionMetadata
} from '../records/practiceSessionRepository'

interface UsePracticeSessionRecorderResult {
  beginSession: () => string | null
  checkpoint: () => void
  resumeSession: () => void
  stopSession: () => boolean
  interruptDevice: () => void
  saveError: string
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `practice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function usePracticeSessionRecorder(
  completed: boolean,
  createRecord: (timing: PracticeSessionTiming) => PracticeSessionRecord | null,
  metadata: PracticeSessionMetadata = { practiceType: 'unknown' }
): UsePracticeSessionRecorderResult {
  const sessionRef = useRef<{ id: string; startedAtMs: number } | null>(null)
  const savedSessionIdRef = useRef('')
  const completionStateRef = useRef<'completed' | 'stopped' | 'interrupted_device' | 'recovered'>('completed')
  const checkpointTimerRef = useRef<number | null>(null)
  const [saveError, setSaveError] = useState('')

  const beginSession = useCallback(() => {
    const id = createSessionId()
    savedSessionIdRef.current = ''
    completionStateRef.current = 'completed'
    setSaveError('')
    const startedAt = new Date().toISOString()
    const result = practiceSessionRepository.start(metadata, id, new Date(startedAt))
    if (!result.success) {
      sessionRef.current = null
      setSaveError(`无法创建练习恢复点：${result.error ?? result.reason ?? '请检查本地存储权限'}`)
      return null
    }
    sessionRef.current = { id, startedAtMs: Date.now() }
    return id
  }, [metadata])

  const createCurrentRecord = useCallback((status: 'completed' | 'stopped'): PracticeSessionRecord | null => {
    const session = sessionRef.current
    if (!session) return null
    const endedAtMs = Date.now()
    const record = createRecord({
      id: session.id,
      startedAt: new Date(session.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - session.startedAtMs)
    })
    return record ? { ...record, status } : null
  }, [createRecord])
  const createCurrentRecordRef = useRef(createCurrentRecord)
  createCurrentRecordRef.current = createCurrentRecord

  const checkpoint = useCallback(() => {
    const record = createCurrentRecord('stopped')
    const sessionId = sessionRef.current?.id
    if (!sessionId) return
    const result = practiceSessionRepository.pause(sessionId, record ? [fromLegacyRecord(record)] : [])
    if (!result.success) setSaveError('练习暂停成功，但恢复点保存失败。')
  }, [createCurrentRecord])

  const resumeSession = useCallback(() => {
    const sessionId = sessionRef.current?.id
    if (!sessionId) return
    const result = practiceSessionRepository.checkpoint(sessionId, { state: 'ACTIVE' })
    if (!result.success) setSaveError('练习已继续，但恢复点状态更新失败。')
  }, [])

  const interruptDevice = useCallback(() => {
    const record = createCurrentRecord('stopped')
    const sessionId = sessionRef.current?.id
    if (!sessionId) return
    completionStateRef.current = 'interrupted_device'
    const result = practiceSessionRepository.interruptDevice(sessionId, record ? [fromLegacyRecord(record)] : [])
    if (!result.success) setSaveError('MIDI 已断开，且练习恢复点保存失败。')
  }, [createCurrentRecord])

  const stopSession = useCallback(() => {
    const record = createCurrentRecord('stopped')
    const session = sessionRef.current
    if (!session || savedSessionIdRef.current === session.id) return false
    if (!record) {
      const endedAt = new Date().toISOString()
      const completionState = completionStateRef.current === 'interrupted_device' ? 'interrupted_device' : 'stopped'
      practiceSessionRepository.finish(session.id, completionState, [])
      const saved = practiceRecordRepository.addResult({
        id: session.id,
        sessionId: session.id,
        schemaVersion: 2,
        completionState,
        practiceType: metadata.practiceType,
        sourceType: 'builtin',
        sourceId: metadata.exerciseId ?? null,
        startedAt: new Date(session.startedAtMs).toISOString(),
        endedAt,
        durationMs: Math.max(0, Date.parse(endedAt) - session.startedAtMs),
        tempo: metadata.tempo ?? null,
        mode: metadata.mode ?? null,
        handMode: metadata.handMode ?? null,
        scoreId: metadata.scoreId ?? null,
        metrics: [],
        errorEvents: [],
        evidenceRefs: [],
        metadata: { completionState, partialEvidence: true }
      })
      if (!saved.success) {
        setSaveError('练习已停止，但统一 V2 记录保存失败。')
        return false
      }
      savedSessionIdRef.current = session.id
      const committed = practiceSessionRepository.commit(session.id)
      if (!committed.success) setSaveError('记录已保存，但恢复草稿提交失败，稍后可安全重试。')
      return true
    }
    const completionState = completionStateRef.current === 'interrupted_device' ? 'interrupted_device' : 'stopped'
    practiceSessionRepository.finish(record.id, completionState, [fromLegacyRecord(record)])
    const result = savePracticeRecord(record, completionState)
    setSaveError(result.message ?? '')
    if (!result.success) return false
    savedSessionIdRef.current = record.id
    const committed = practiceSessionRepository.commit(record.id)
    if (!committed.success) setSaveError('记录已保存，但恢复草稿提交失败，稍后可安全重试。')
    return true
  }, [createCurrentRecord, metadata])

  useEffect(() => {
    const session = sessionRef.current
    if (!completed || !session || savedSessionIdRef.current === session.id) return

    const record = createCurrentRecord('completed')

    if (!record) return

    practiceSessionRepository.finish(record.id, 'completed', [fromLegacyRecord(record)])
    const result = savePracticeRecord(record, 'completed')
    setSaveError(result.message ?? '')
    if (result.success) {
      savedSessionIdRef.current = session.id
      const committed = practiceSessionRepository.commit(record.id)
      if (!committed.success) setSaveError('记录已保存，但恢复草稿提交失败，稍后可安全重试。')
    }
  }, [completed, createCurrentRecord])

  useEffect(() => {
    const sessionId = sessionRef.current?.id
    if (!sessionId || completed || savedSessionIdRef.current === sessionId) return undefined
    if (checkpointTimerRef.current !== null) window.clearTimeout(checkpointTimerRef.current)
    checkpointTimerRef.current = window.setTimeout(() => {
      checkpointTimerRef.current = null
      const record = createCurrentRecordRef.current('stopped')
      const result = practiceSessionRepository.checkpoint(sessionId, {
        facts: record ? [fromLegacyRecord(record)] : [],
        state: 'ACTIVE'
      })
      if (!result.success) setSaveError('练习继续进行，但自动恢复检查点保存失败。')
    }, 750)
    return () => {
      if (checkpointTimerRef.current !== null) {
        window.clearTimeout(checkpointTimerRef.current)
        checkpointTimerRef.current = null
      }
    }
  }, [completed, createRecord])

  useEffect(() => () => {
    if (checkpointTimerRef.current !== null) window.clearTimeout(checkpointTimerRef.current)
    const sessionId = sessionRef.current?.id
    if (!sessionId || savedSessionIdRef.current === sessionId) return
    const record = createCurrentRecordRef.current('stopped')
    practiceSessionRepository.checkpoint(sessionId, {
      facts: record ? [fromLegacyRecord(record)] : [],
      state: completionStateRef.current === 'interrupted_device' ? 'INTERRUPTED' : 'ACTIVE',
      interruptionReason: completionStateRef.current === 'interrupted_device'
        ? 'midi_device_disconnected'
        : 'application_closed_before_commit'
    })
  }, [])

  return { beginSession, checkpoint, resumeSession, stopSession, interruptDevice, saveError }
}
