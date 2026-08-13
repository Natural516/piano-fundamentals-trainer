import { useEffect, useRef, useState } from 'react'
import type { ActiveMidiNote } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useFreePractice } from '../hooks/useFreePractice'
import type { UsePianoAudioResult } from '../hooks/usePianoAudio'
import { createFreePracticeRecord } from '../utils/practiceRecordAdapters'
import { savePracticeRecord } from '../utils/practiceRecordStorage'
import { AppButton } from './AppButton'
import { FullKeyboard } from './FullKeyboard'
import { PracticePageHeader } from './PracticePageHeader'
import { PracticeStatBar } from './PracticeStatBar'

interface FreePracticePageProps {
  activeNotes: ActiveMidiNote[]
  exitPromptOpen: boolean
  pianoAudio: UsePianoAudioResult
  onPracticeRunningChange: (running: boolean) => void
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function FreePracticePage({
  activeNotes,
  exitPromptOpen,
  pianoAudio,
  onPracticeRunningChange
}: FreePracticePageProps): JSX.Element {
  const { showVirtualKeyboard, setShowVirtualKeyboard } = useDisplayPreferences('free-practice')
  const practice = useFreePractice({
    playNote: pianoAudio.playNote,
    stopNote: pianoAudio.stopNote,
    setSustain: pianoAudio.setSustain
  })
  const savedSessionIdRef = useRef('')
  const isRunning = practice.isRecording || practice.isPaused

  useEffect(() => {
    onPracticeRunningChange(isRunning)
  }, [isRunning, onPracticeRunningChange])

  useEffect(() => () => onPracticeRunningChange(false), [onPracticeRunningChange])

  useEffect(() => {
    if (!isRunning) return
    if (exitPromptOpen) practice.pause()
    else if (practice.isPaused) practice.resume()
  }, [exitPromptOpen, isRunning, practice.isPaused, practice.pause, practice.resume])

  useEffect(() => {
    const session = practice.session
    if (practice.status !== 'finished' || !practice.stats || !session) return
    if (savedSessionIdRef.current === session.id) return

    savedSessionIdRef.current = session.id
    const endedAtMs = Date.now()
    const record = createFreePracticeRecord({
      timing: {
        id: session.id,
        startedAt: new Date(session.startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: Math.max(0, endedAtMs - session.startedAtMs)
      },
      stats: practice.stats,
      notes: practice.notes
    })
    savePracticeRecord(record)
  }, [practice.notes, practice.session, practice.stats, practice.status])

  const stats = practice.stats
  const statusLabel = practice.status === 'recording'
    ? '录制中'
    : practice.status === 'paused'
      ? '已暂停'
      : practice.status === 'finished'
        ? '已结束'
        : '未开始'

  return (
    <section className="free-practice-page practice-workspace-page">
      <PracticePageHeader
        eyebrow="Free Practice"
        title="自由练习"
        summary={stats
          ? `时长 ${formatDuration(stats.durationMs)} · ${stats.noteOnCount} 个音 · 音域 ${stats.lowestMidi ?? '-'}–${stats.highestMidi ?? '-'}`
          : '记录事实，不评判正确率'}
      />

      <div className="practice-single-column">
        <section className="midi-panel free-practice-panel practice-primary-panel">
          <div className="panel-title-row">
            <div>
              <h3>自由弹奏</h3>
              <p>开始后记录 MIDI 输入与踏板事实，可回放；不伪造正确率或错音率。</p>
            </div>
            <span className={`audio-status-badge status-${practice.isRecording ? 'ready' : 'suspended'}`}>
              {statusLabel}
            </span>
          </div>

          <div className="free-practice__meta">
            <div><span>音频状态</span><strong>{pianoAudio.samplerStatus.message}</strong></div>
            <div><span>发声模式</span><strong>{pianoAudio.mode === 'builtin' ? '内置钢琴' : pianoAudio.mode === 'silent' ? '静音' : '外部软音源'}</strong></div>
          </div>

          <div className="practice-primary-actions">
            {practice.status === 'idle' || practice.status === 'finished' ? (
              <AppButton onClick={practice.start}>开始练习</AppButton>
            ) : null}
            {practice.status === 'recording' ? <AppButton variant="secondary" onClick={practice.pause}>暂停</AppButton> : null}
            {practice.status === 'paused' ? <AppButton onClick={practice.resume}>继续</AppButton> : null}
            {practice.isRecording || practice.isPaused ? <AppButton variant="secondary" onClick={practice.finish}>结束</AppButton> : null}
            {practice.status === 'finished' ? <AppButton variant="ghost" onClick={practice.reset}>返回空闲</AppButton> : null}
          </div>

          <label className="free-practice__notes">
            <span>备注</span>
            <textarea
              value={practice.notes}
              placeholder="记录本次练习目标、重点或问题（可选）"
              onChange={(event) => practice.setNotes(event.target.value)}
            />
          </label>
        </section>

        <PracticeStatBar items={[
          { label: '状态', value: statusLabel },
          { label: '录制时长', value: formatDuration(stats?.durationMs ?? 0) },
          { label: '音符数', value: stats?.noteOnCount ?? 0 },
          { label: '实际音域', value: stats?.lowestMidi != null ? `${stats.lowestMidi}–${stats.highestMidi}` : '—' },
          { label: '平均力度', value: stats?.averageVelocity ?? '—' },
          { label: '踏板次数', value: stats?.pedalDownCount ?? 0 }
        ]} />

        {stats ? (
          <section className="midi-panel free-practice-report">
            <div className="panel-title-row">
              <div><h3>练习事实报告</h3><p>仅记录可测量事实，不生成未知曲目的正确率。</p></div>
            </div>
            <div className="report-grid free-practice-report__grid">
              <div><span>时长</span><strong>{formatDuration(stats.durationMs)}</strong></div>
              <div><span>noteOn 数量</span><strong>{stats.noteOnCount}</strong></div>
              <div><span>最低音</span><strong>{stats.lowestMidi ?? '-'}</strong></div>
              <div><span>最高音</span><strong>{stats.highestMidi ?? '-'}</strong></div>
              <div><span>实际音域</span><strong>{stats.actualRange ?? '-'} 半音</strong></div>
              <div><span>平均 velocity</span><strong>{stats.averageVelocity ?? '-'}</strong></div>
              <div><span>velocity 范围</span><strong>{stats.velocityRange ?? '-'}</strong></div>
              <div><span>踏板使用</span><strong>{stats.pedalDownCount} 次 / {formatDuration(stats.pedalDownDurationMs)}</strong></div>
              <div><span>演奏密度</span><strong>{stats.densityPerSecond ?? '-'} 音/秒</strong></div>
              <div><span>左区活动（&lt;60）</span><strong>{stats.leftRegionNoteOnCount}</strong></div>
              <div><span>右区活动（≥60）</span><strong>{stats.rightRegionNoteOnCount}</strong></div>
            </div>
          </section>
        ) : null}

        {practice.status === 'finished' && practice.playback.durationMs > 0 ? (
          <section className="midi-panel free-practice-playback">
            <div className="panel-title-row">
              <div><h3>录制回放</h3><p>支持播放 / 暂停 / 重播 / 跳转 / 速度。</p></div>
            </div>
            <div className="free-practice-playback__controls">
              {practice.playback.isPlaying ? (
                <AppButton variant="secondary" onClick={practice.playback.pause}>暂停回放</AppButton>
              ) : (
                <AppButton onClick={practice.playback.play}>播放</AppButton>
              )}
              <AppButton variant="ghost" onClick={practice.playback.replay}>重播</AppButton>
              <label className="free-practice-playback__speed">
                <span>速度</span>
                <select
                  value={practice.playback.speed}
                  onChange={(event) => practice.playback.setSpeed(Number(event.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
            </div>
            <div className="free-practice-playback__seek">
              <input
                aria-label="回放进度"
                type="range"
                min="0"
                max={Math.max(1, practice.playback.durationMs)}
                value={Math.min(practice.playback.positionMs, practice.playback.durationMs)}
                onChange={(event) => practice.playback.seek(Number(event.target.value))}
              />
              <span>{formatDuration(practice.playback.positionMs)} / {formatDuration(practice.playback.durationMs)}</span>
            </div>
          </section>
        ) : null}

        {showVirtualKeyboard ? (
          <section className="midi-panel free-practice-keyboard practice-keyboard-panel">
            <div className="panel-title-row">
              <div><h3>虚拟钢琴键盘</h3><p>MIDI 输入实时高亮。</p></div>
              <button className="practice-settings-trigger" type="button" aria-label="隐藏虚拟键盘" title="隐藏虚拟键盘" onClick={() => setShowVirtualKeyboard(false)}>
                ×
              </button>
            </div>
            <FullKeyboard activeNotes={activeNotes} />
          </section>
        ) : (
          <div className="practice-primary-actions free-practice__keyboard-toggle">
            <AppButton variant="secondary" onClick={() => setShowVirtualKeyboard(true)}>显示虚拟键盘</AppButton>
          </div>
        )}
      </div>
    </section>
  )
}
