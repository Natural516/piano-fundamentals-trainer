import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { computeAbilityModelV2 } from '../ability/abilityModel'
import { computeScoreMastery } from '../ability/scoreMastery'
import { practiceModules } from '../data'
import {
  createDailyPlanV2,
  readPlannerPreferences,
  readTodayDailyPlanV2,
  updateDailyPlanFromRecords,
  writeDailyPlanV2Result,
  type DailyPlanV2State
} from '../plan/dailyPlanV2Storage'
import { buildDailyPlan, planItemToScorePracticePreset, type PlanItem, type ScorePracticePreset } from '../plan/planner'
import { EXERCISE_LIBRARY } from '../prescription/exerciseLibrary'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import type { PageId } from '../types'
import type { PracticeSessionRecord, TodayPracticeStats } from '../utils/practiceRecordTypes'
import {
  getPlanItemPage,
  getPlanItemReasonCopy,
  getPlanItemSkillLabel,
  getPlanItemTitle
} from '../utils/practicePresentation'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'

interface HomePageProps {
  onNavigate: (page: PageId) => void
  onOpenScoreSegment: (preset: ScorePracticePreset) => void
  recentRecords: PracticeSessionRecord[]
  records: PracticeSessionRecord[]
  todayStats: TodayPracticeStats
}

const recordPages: Record<PracticeSessionRecord['module'], PageId> = {
  'sight-reading': 'sight-reading',
  rhythm: 'rhythm',
  scale: 'scales',
  chord: 'chords',
  coordination: 'coordination',
  score: 'score-practice',
  'free-practice': 'free-practice'
}

// AI 钢琴助理 remains reachable through the secondary recent-progress flow, not the home primary view.

function buildAndStoreTodayPlan(): DailyPlanV2State {
  const sourceRecords = practiceRecordRepository.list()
  const mastery = computeScoreMastery(sourceRecords)
  const preferences = readPlannerPreferences()
  const plan = buildDailyPlan({
    ability: computeAbilityModelV2(sourceRecords, mastery),
    records: sourceRecords,
    goal: preferences.goal,
    availableMinutes: preferences.availableMinutes,
    library: EXERCISE_LIBRARY,
    mastery
  })
  const state = createDailyPlanV2(plan)
  writeDailyPlanV2Result(state)
  return state
}

export function HomePage({
  onNavigate,
  onOpenScoreSegment,
  recentRecords,
  records,
  todayStats
}: HomePageProps): JSX.Element {
  const [todayPlan, setTodayPlan] = useState<DailyPlanV2State | null>(() => readTodayDailyPlanV2())

  useEffect(() => {
    const stored = readTodayDailyPlanV2()
    if (!stored) {
      setTodayPlan(buildAndStoreTodayPlan())
      return
    }

    const sourceRecords = practiceRecordRepository.list()
    const updated = updateDailyPlanFromRecords(stored, sourceRecords, computeScoreMastery(sourceRecords))
    if (updated.changed) writeDailyPlanV2Result(updated.state)
    setTodayPlan(updated.state)
  }, [records])

  const planSummary = useMemo(() => {
    const items = todayPlan?.items ?? []
    const doneItems = items.filter((item) => todayPlan?.progress[item.exerciseId] === 'done')
    const nextItem = items.find((item) => todayPlan?.progress[item.exerciseId] !== 'done') ?? null
    return {
      doneCount: doneItems.length,
      nextItem,
      totalMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
      totalCount: items.length
    }
  }, [todayPlan])

  const lastRecord = recentRecords[0]

  const openPlanItem = (item: PlanItem): void => {
    const scorePreset = planItemToScorePracticePreset(item)
    if (scorePreset) {
      onOpenScoreSegment(scorePreset)
      return
    }
    const page = getPlanItemPage(item)
    if (page) onNavigate(page)
  }

  return (
    <div className="f2-home-page">
      <header className="f2-page-intro f2-home-intro">
        <div>
          <span className="eyebrow">今天，专注一件事</span>
          <h2>准备好开始练琴了吗？</h2>
          <p>计划会根据已有练习记录安排；样本不足时保持均衡，不猜测你的弱项。</p>
        </div>
      </header>

      <AppCard as="section" className="f2-today-hero">
        <div className="f2-today-hero__copy">
          <span className="f2-section-kicker">今日训练</span>
          {planSummary.nextItem ? (
            <>
              <h3>{getPlanItemTitle(planSummary.nextItem)}</h3>
              <p>{getPlanItemReasonCopy(planSummary.nextItem)}</p>
              <div className="f2-task-meta">
                <span>{getPlanItemSkillLabel(planSummary.nextItem)}</span>
                <span>{planSummary.nextItem.minutes} 分钟</span>
                <span>{planSummary.doneCount} / {planSummary.totalCount} 已完成</span>
              </div>
              <AppButton className="f2-primary-action" onClick={() => openPlanItem(planSummary.nextItem!)}>
                开始今日训练
              </AppButton>
            </>
          ) : (
            <>
              <h3>{planSummary.totalCount > 0 ? '今天的计划已完成' : '正在准备今天的计划'}</h3>
              <p>{planSummary.totalCount > 0 ? '做得好。可以查看今天的记录，或选择一项自由巩固。' : '计划会从真实练习记录中生成。'}</p>
              <AppButton className="f2-primary-action" onClick={() => onNavigate('training-plan')}>查看今日训练</AppButton>
            </>
          )}
        </div>
        <div className="f2-today-hero__duration" aria-label={`预计 ${planSummary.totalMinutes} 分钟`}>
          <strong>{planSummary.totalMinutes || '—'}</strong>
          <span>预计分钟</span>
          <i style={{ '--f2-progress': `${planSummary.totalCount ? (planSummary.doneCount / planSummary.totalCount) * 100 : 0}%` } as CSSProperties} />
        </div>
      </AppCard>

      <div className="f2-home-support-grid">
        <AppCard as="section" className="f2-support-card">
          <span className="f2-section-kicker">上次练到</span>
          {lastRecord ? (
            <>
              <h3>{lastRecord.title || lastRecord.moduleName}</h3>
              <p>{lastRecord.moduleName} · {Math.max(1, Math.round(lastRecord.durationMs / 60000))} 分钟</p>
              <AppButton variant="secondary" onClick={() => onNavigate(recordPages[lastRecord.module])}>继续这项练习</AppButton>
            </>
          ) : (
            <><h3>还没有练习记录</h3><p>完成第一轮后，这里会帮你接着上次继续。</p></>
          )}
        </AppCard>

        <AppCard as="section" className="f2-support-card">
          <span className="f2-section-kicker">近期状态</span>
          <h3>{todayStats.completedSessions > 0 ? `今天已练 ${Math.round(todayStats.durationMs / 60000)} 分钟` : '从第一轮练习开始'}</h3>
          <p>{todayStats.completedSessions > 0 ? `完成 ${todayStats.completedSessions} 轮；详细变化可在近期进步中查看。` : '数据足够后，我们才会展示趋势与优先建议。'}</p>
          <AppButton variant="secondary" onClick={() => onNavigate('analytics')}>查看近期进步</AppButton>
        </AppCard>
      </div>

      <details className="f2-practice-library">
        <summary>全部练习</summary>
        <div className="f2-practice-library__grid">
          {practiceModules.map((module) => (
            <button key={module.id} type="button" onClick={() => onNavigate(module.id)}>
              <span>{module.number}</span>
              <strong>{module.title}</strong>
              <small>{module.description.replace('MusicXML / MXL 曲谱的 Wait 模式练习', '导入曲谱并按自己的节奏练习')}</small>
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}
