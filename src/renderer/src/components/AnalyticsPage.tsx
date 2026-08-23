import { useMemo, useState } from 'react'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { buildWeeklyReport, computePeriodStats, formatNoData, STAT_PERIOD_LABELS, type StatPeriod } from '../analytics/periodStats'
import { buildCoachSnapshot, getFallbackCoachLayers, type CoachSnapshot } from '../ai/aiCoach'
import { readPlanV2 } from '../plan/planV2'
import { readCurriculumProgress } from '../curriculum/curriculumProgress'
import { useAiCoach } from '../hooks/useAiCoach'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'

interface AnalyticsPageProps {
  practiceRecords: PracticeSessionRecord[]
}

const moduleLabels: Record<string, string> = {
  'sight-reading': '识谱',
  rhythm: '节奏',
  scale: '音阶',
  chord: '和弦',
  coordination: '左右手协调',
  score: '曲谱',
  'free-practice': '自由练习'
}

// AI 教练 capability remains available as the optional “补充建议” accordion.

function formatDuration(durationMs: number): string {
  if (durationMs > 0 && durationMs < 60000) return '<1 分钟'
  return `${Math.round(durationMs / 60000)} 分钟`
}

export function AnalyticsPage({ practiceRecords }: AnalyticsPageProps): JSX.Element {
  const [period, setPeriod] = useState<StatPeriod>('week')
  const stats = useMemo(() => computePeriodStats(practiceRecords, new Date(), period), [period, practiceRecords])
  const weeklyReport = useMemo(() => buildWeeklyReport(practiceRecords), [practiceRecords])
  const weeklyStats = useMemo(() => computePeriodStats(practiceRecords, new Date(), 'week'), [practiceRecords])
  const displayedWeeklyFacts = useMemo(() => {
    if (weeklyStats.sessions === 0) return weeklyReport.facts
    return [`本周练习 ${weeklyStats.sessions} 次，累计 ${formatDuration(weeklyStats.durationMs)}。`, ...weeklyReport.facts.slice(1)]
  }, [weeklyReport.facts, weeklyStats.durationMs, weeklyStats.sessions])
  const hasEnoughWeeklyEvidence = weeklyStats.sessions >= 4 && weeklyStats.durationMs >= 5 * 60 * 1000
  const displayedWeeklySuggestions = weeklyStats.confidence === 'low' || !hasEnoughWeeklyEvidence
    ? ['当前记录还少，先保持规律练习；积累更多完整记录后再判断趋势。']
    : weeklyReport.suggestions
  const ai = useAiCoach()
  const [coachLayers, setCoachLayers] = useState<ReturnType<typeof getFallbackCoachLayers> | null>(null)
  const [coachError, setCoachError] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)

  const requestCoach = async (): Promise<void> => {
    setCoachError('')
    setCoachLoading(true)
    const plan = readPlanV2()
    const curriculum = readCurriculumProgress()
    const snapshot: CoachSnapshot = buildCoachSnapshot(
      computePeriodStats(practiceRecords, new Date(), 'week'),
      plan,
      Object.values(curriculum.exercises).map((entry) => ({
        exerciseId: entry.exerciseId,
        status: entry.status,
        currentTempo: entry.currentTempo
      }))
    )

    try {
      const result = await ai.requestCoach('weekly-review', snapshot)
      if (result.ok) {
        setCoachLayers(result.layers)
      } else if (!ai.settings.enabled) {
        setCoachLayers(getFallbackCoachLayers(snapshot))
      } else {
        setCoachError(result.error ?? 'AI 请求失败')
      }
    } finally {
      setCoachLoading(false)
    }
  }

  return (
    <section className="settings-page">
      <header className="midi-page-header">
        <div>
          <span className="eyebrow">只展示记录支持的变化</span>
          <h2>近期进步</h2>
          <p>先看练习是否持续、哪部分值得继续；详细数字需要时再展开。</p>
        </div>
      </header>

      <div className="settings-content">
        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div><h3>这段时间的练习</h3><p>切换时间范围，不会改变练习记录。</p></div>
          </div>
          <div className="segmented-control analytics-period">
            {(['today', 'week', 'month', 'all'] as StatPeriod[]).map((option) => (
              <button key={option} className={period === option ? 'is-active' : ''} type="button" onClick={() => setPeriod(option)}>
                {STAT_PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <div className={`f2-progress-overview confidence-${stats.confidence}`}>
            <div><strong>{stats.sessions === 0 ? '还没有可比较的记录' : formatDuration(stats.durationMs)}</strong><span>{stats.sessions === 0 ? '完成练习后，这里会开始形成事实趋势。' : `${stats.sessions} 轮练习留在这个时间范围内`}</span></div>
            <p>{stats.sessions === 0
              ? '先完成第一轮，不急着判断弱项。'
              : stats.confidence === 'low'
                ? '样本还少，当前结果只适合回顾，不足以判断长期趋势。'
                : stats.confidence === 'medium'
                  ? '已经能看到初步状态，继续保持几次练习会更可靠。'
                  : '记录数量足以支持这段时间内的趋势回顾。'}</p>
          </div>
          <details className="f2-result-details">
            <summary>查看详细数据</summary>
            <div className="report-grid analytics-grid">
              <div><span>练习次数</span><strong>{stats.sessions === 0 ? '—' : stats.sessions}</strong></div>
              <div><span>练习时长</span><strong>{stats.sessions === 0 ? '—' : formatDuration(stats.durationMs)}</strong></div>
              <div><span>数据状态</span><strong>{stats.sessions === 0 ? '暂无数据' : stats.confidence === 'low' ? '样本不足' : stats.confidence === 'medium' ? '初步可用' : '较稳定'}</strong></div>
              <div><span>识谱平均反应</span><strong>{formatNoData(stats.sightReadingAverageReactionMs)} ms</strong></div>
              <div><span>节奏平均偏差</span><strong>{formatNoData(stats.rhythmAverageOffsetMs)} ms</strong></div>
              <div><span>音阶均匀度</span><strong>{formatNoData(stats.scaleEvenness)} ms</strong></div>
            </div>
            <div className="analytics-modules">
              {Object.entries(stats.perModule).length === 0 ? <span className="analytics-modules__empty">暂无分项数据</span> : Object.entries(stats.perModule).map(([module, moduleStats]) => (
                <span key={module}>{moduleLabels[module] ?? '基础练习'} · {moduleStats.sessions} 次 · {moduleStats.accuracy === null ? '样本不足' : `${moduleStats.accuracy}%`}</span>
              ))}
            </div>
          </details>
        </AppCard>

        <AppCard as="section" className="settings-card">
          <div className="panel-title-row">
            <div><h3>本周回顾</h3><p>把发生过的事与下一步分开，避免把建议说成事实。</p></div>
          </div>
          <div className="analytics-report">
            <div>
              <h4>这一周发生了什么</h4>
              {displayedWeeklyFacts.map((fact) => <p key={fact}>{fact}</p>)}
            </div>
            <div>
              <h4>下一步可以怎么练</h4>
              {displayedWeeklySuggestions.map((suggestion) => <p key={suggestion}>{suggestion}</p>)}
            </div>
          </div>
        </AppCard>

        <details className="settings-card f2-settings-accordion">
          <summary>获取补充建议<small>可选；只读取本周事实，不修改记录</small></summary>
          <div className="f2-settings-accordion__body">
          <div className="settings-audio__actions">
            <AppButton variant="secondary" onClick={() => void requestCoach()} disabled={coachLoading}>
              {coachLoading ? '正在整理…' : '获取本周补充建议'}
            </AppButton>
          </div>
          {coachError ? <p className="practice-save-error">{coachError}</p> : null}
          {coachLayers ? (
            <div className="analytics-report coach-report">
              <div>
                <h4>事实</h4>
                {coachLayers.facts.length > 0 ? coachLayers.facts.map((fact) => <p key={fact}>{fact}</p>) : <p>—</p>}
              </div>
              <div>
                <h4>解释</h4>
                {coachLayers.interpretation.length > 0 ? coachLayers.interpretation.map((item) => <p key={item}>{item}</p>) : <p>—</p>}
              </div>
              <div>
                <h4>建议</h4>
                {coachLayers.recommendation.length > 0 ? coachLayers.recommendation.map((item) => <p key={item}>{item}</p>) : <p>—</p>}
              </div>
            </div>
          ) : null}
          </div>
        </details>
      </div>
    </section>
  )
}
