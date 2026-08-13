import { useMemo, useState } from 'react'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { buildWeeklyReport, computePeriodStats, formatNoData, STAT_PERIOD_LABELS, type StatPeriod } from '../analytics/periodStats'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'

interface AnalyticsPageProps {
  onBackHome: () => void
  practiceRecords: PracticeSessionRecord[]
}

export function AnalyticsPage({ onBackHome, practiceRecords }: AnalyticsPageProps): JSX.Element {
  const [period, setPeriod] = useState<StatPeriod>('week')
  const stats = useMemo(() => computePeriodStats(practiceRecords, new Date(), period), [period, practiceRecords])
  const weeklyReport = useMemo(() => buildWeeklyReport(practiceRecords), [practiceRecords])

  return (
    <section className="settings-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">Analytics</span>
          <h2>统计分析</h2>
          <p>基于练习记录的事实统计；样本不足时显示“样本不足”，不凭空断言长期弱项。</p>
        </div>
        <AppButton className="ghost-button" variant="ghost" onClick={onBackHome}>返回首页</AppButton>
      </header>

      <div className="settings-content">
        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div><h3>周期统计</h3><p>选择统计周期。</p></div>
          </div>
          <div className="segmented-control analytics-period">
            {(['today', 'week', 'month', 'all'] as StatPeriod[]).map((option) => (
              <button key={option} className={period === option ? 'is-active' : ''} type="button" onClick={() => setPeriod(option)}>
                {STAT_PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="report-grid analytics-grid">
            <div><span>练习次数</span><strong>{stats.sessions === 0 ? '—' : stats.sessions}</strong></div>
            <div><span>练习时长</span><strong>{stats.sessions === 0 ? '—' : `${Math.round(stats.durationMs / 60000)} 分钟`}</strong></div>
            <div><span>样本置信度</span><strong>{stats.sessions === 0 ? '暂无数据' : stats.confidence === 'low' ? '样本不足' : stats.confidence === 'medium' ? '中等' : '较高'}</strong></div>
            <div><span>识谱平均反应</span><strong>{formatNoData(stats.sightReadingAverageReactionMs)} ms</strong></div>
            <div><span>节奏平均偏移</span><strong>{formatNoData(stats.rhythmAverageOffsetMs)} ms</strong></div>
            <div><span>音阶偏移离散度</span><strong>{formatNoData(stats.scaleEvenness)} ms</strong></div>
            <div><span>和弦薄弱点</span><strong>{stats.sessions === 0 ? '暂无数据' : stats.chordWeakness}</strong></div>
          </div>
          <p className="settings-audio__status">模块明细（样本充足才显示正确率）：</p>
          <div className="analytics-modules">
            {Object.entries(stats.perModule).length === 0 ? (
              <span className="analytics-modules__empty">暂无数据</span>
            ) : (
              Object.entries(stats.perModule).map(([module, moduleStats]) => (
                <span key={module}>
                  {module} · {moduleStats.sessions} 次 · {moduleStats.accuracy === null ? '—' : `${moduleStats.accuracy}%`}
                </span>
              ))
            )}
          </div>
        </AppCard>

        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div><h3>本周报告</h3><p>事实与建议分开呈现。</p></div>
          </div>
          <div className="analytics-report">
            <div>
              <h4>事实</h4>
              {weeklyReport.facts.map((fact) => <p key={fact}>{fact}</p>)}
            </div>
            <div>
              <h4>建议</h4>
              {weeklyReport.suggestions.map((suggestion) => <p key={suggestion}>{suggestion}</p>)}
            </div>
          </div>
        </AppCard>
      </div>
    </section>
  )
}
