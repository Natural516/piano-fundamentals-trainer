import type { CSSProperties } from 'react'
import {
  formatPracticeDuration,
  formatRelativePracticeTime
} from '../utils/practiceRecordStorage'
import type { PracticeModule, PracticeSessionRecord, TodayPracticeStats } from '../utils/practiceRecordTypes'
import { AppCard } from './AppCard'

interface RightInfoPanelProps {
  recentRecords: PracticeSessionRecord[]
  todayStats: TodayPracticeStats
}

const moduleTones: Record<PracticeModule, string> = {
  'sight-reading': 'violet',
  rhythm: 'violet',
  scale: 'cyan',
  chord: 'amber',
  coordination: 'rose',
  'free-practice': 'cyan'
}

export function RightInfoPanel({ recentRecords, todayStats }: RightInfoPanelProps): JSX.Element {
  const hasTodayData = todayStats.completedSessions > 0
  const ringStyle = { '--progress': `${hasTodayData ? todayStats.accuracy : 0}%` } as CSSProperties

  return (
    <aside className="right-panel" aria-label="练习信息">
      <AppCard as="section" className="info-card today-card">
        <h3>今日练习统计</h3>
        <div className="today-stat-layout">
          <div className={`progress-ring ${hasTodayData ? '' : 'is-empty'}`} aria-label={hasTodayData ? `今日正确率 ${todayStats.accuracy}%` : '今日暂无练习数据'} style={ringStyle}>
            <div className="progress-ring-center">
              <strong>{hasTodayData ? `${todayStats.accuracy}%` : '—'}</strong>
              <span>{hasTodayData ? '正确率' : '暂无数据'}</span>
            </div>
          </div>
          <dl className="stat-list">
            <div>
              <dt>练习时长</dt>
              <dd>{todayStats.durationMs === 0 ? '0 分钟' : formatPracticeDuration(todayStats.durationMs)}</dd>
            </div>
            <div>
              <dt>完成练习</dt>
              <dd>{todayStats.completedSessions} 次</dd>
            </div>
            <div>
              <dt>正确率</dt>
              <dd>{hasTodayData ? `${todayStats.accuracy}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      </AppCard>

      <AppCard as="section" className="info-card records-card">
        <h3>最近练习记录</h3>
        <div className="record-list">
          {recentRecords.length > 0 ? recentRecords.slice(0, 3).map((record) => (
            <article key={record.id} className="record-item">
              <span className={`record-icon tone-${moduleTones[record.module]}`} aria-hidden="true">
                ♪
              </span>
              <div>
                <strong>{record.title}</strong>
                <p>{record.moduleName} · 正确率 {record.accuracy}%</p>
              </div>
              <time>{formatRelativePracticeTime(record.endedAt)}</time>
            </article>
          )) : <div className="home-record-empty">完成练习后，记录会显示在这里。</div>}
        </div>
      </AppCard>
    </aside>
  )
}
