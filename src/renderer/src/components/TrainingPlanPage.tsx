import { useEffect, useMemo, useState } from 'react'
import { DAILY_TRAINING_PLAN, DAILY_TRAINING_TOTAL_MINUTES } from '../utils/dailyTrainingPlan'
import { LEVEL_SIX_CHECKLIST } from '../utils/levelSixChecklist'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import { TECHNIQUE_MAPPINGS } from '../utils/techniqueMappings'
import {
  getTodayCompletedModules,
  getTodayLatestModuleResults,
  isDailyTaskAutoCompleted
} from '../utils/trainingPlanRecordLink'
import { getTrainingPlanStage, TRAINING_PLAN_STAGES } from '../utils/trainingPlanStages'
import {
  changeCurrentStage,
  createDefaultLevelSixProgress,
  createDefaultStageProjectProgress,
  ensureWeeklyTrainingRecord,
  formatLocalDate,
  getLocalWeekStart,
  readTrainingPlanState,
  resetDailyTrainingRecord,
  saveTrainingPlanState,
  setDailyTaskOverride
} from '../utils/trainingPlanStorage'
import {
  LEVEL_SIX_STATUS_LABELS,
  STAGE_PROJECT_STATUS_LABELS,
  TRAINING_TASK_TYPE_LABELS,
  WEEKLY_GOAL_STATUS_LABELS,
  type LevelSixStatus,
  type LinkedPracticeModule,
  type StageProjectStatus,
  type TrainingPlanStageId,
  type TrainingPlanState,
  type WeeklyCustomGoal,
  type WeeklyGoalStatus
} from '../utils/trainingPlanTypes'
import { createDefaultWeeklyGoals, WEEKLY_TRAINING_PLAN } from '../utils/weeklyTrainingPlan'
import { computeAbilityModelV2 } from '../ability/abilityModel'
import { computeScoreMastery } from '../ability/scoreMastery'
import { buildDailyPlan } from '../plan/planner'
import { EXERCISE_LIBRARY } from '../prescription/exerciseLibrary'
import { practiceRecordRepository } from '../records/practiceRecordRepository'
import {
  createDailyPlanV2,
  readPlannerPreferences,
  readDailyPlanV2,
  updateDailyPlanFromRecords,
  writePlannerPreferences,
  writeDailyPlanV2,
  type DailyPlanV2State
} from '../plan/dailyPlanV2Storage'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { StatusBadge } from './StatusBadge'

interface TrainingPlanPageProps {
  practiceRecords: PracticeSessionRecord[]
  onBackHome: () => void
  onNavigateModule: (module: LinkedPracticeModule) => void
  onOpenScoreSegment: (scoreId: string, startMeasure: number, endMeasure: number) => void
}

type TrainingPlanTab = 'stage' | 'daily' | 'weekly' | 'mapping' | 'checklist'
type ConfirmAction =
  | { type: 'stage'; stageId: TrainingPlanStageId }
  | { type: 'daily-reset' }
  | { type: 'weekly-clear'; goalId: string }

const tabs: Array<{ id: TrainingPlanTab; label: string }> = [
  { id: 'stage', label: '当前阶段' },
  { id: 'daily', label: '今日训练' },
  { id: 'weekly', label: '每周计划' },
  { id: 'mapping', label: '技术对应' },
  { id: 'checklist', label: '六级验收' }
]

const moduleLabels: Record<LinkedPracticeModule, string> = {
  'sight-reading': '识谱练习',
  rhythm: '节奏与切分',
  scale: '音阶练习',
  chord: '和弦练习',
  coordination: '左右手协调'
}

function calculatePercentage(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0
}

function formatWeekLabel(weekStart: string): string {
  const [year, month, day] = weekStart.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${weekStart} 至 ${formatLocalDate(end)}`
}

function getConfirmCopy(action: ConfirmAction | null): { title: string; message: string; confirm: string } {
  if (action?.type === 'stage') {
    return { title: '切换当前阶段', message: '只会切换当前显示阶段，原阶段项目状态和历史不会删除。', confirm: '确认切换' }
  }
  if (action?.type === 'daily-reset') {
    return { title: '重置当日状态', message: '将清除所选日期的全部手动覆盖状态，软件记录本身不会改变。', confirm: '确认重置' }
  }
  return { title: '清空本周目标', message: '将清空该目标的内容、验收标准、状态和备注。', confirm: '确认清空' }
}

export function TrainingPlanPage({
  onBackHome,
  onNavigateModule,
  onOpenScoreSegment,
  practiceRecords
}: TrainingPlanPageProps): JSX.Element {
  const today = useMemo(() => new Date(), [])
  const todayDate = formatLocalDate(today)
  const currentWeekStart = getLocalWeekStart(today)
  const [activeTab, setActiveTab] = useState<TrainingPlanTab>('stage')
  const [planState, setPlanState] = useState<TrainingPlanState>(() => readTrainingPlanState(today))
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [message, setMessage] = useState('')
  const [plannerPlan, setPlannerPlan] = useState<DailyPlanV2State | null>(() => readDailyPlanV2())
  const [plannerMessage, setPlannerMessage] = useState('')
  const [plannerPreferences, setPlannerPreferences] = useState(() => readPlannerPreferences())

  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(() => setMessage(''), 2200)
    return () => window.clearTimeout(timer)
  }, [message])

  const regeneratePlannerPlan = (): void => {
    const records = practiceRecordRepository.list()
    const mastery = computeScoreMastery(records)
    const ability = computeAbilityModelV2(records, mastery)
    const plan = buildDailyPlan({
      ability,
      records: practiceRecords,
      goal: plannerPreferences.goal,
      availableMinutes: plannerPreferences.availableMinutes,
      library: EXERCISE_LIBRARY,
      mastery
    })
    const stored = createDailyPlanV2(plan)
    writeDailyPlanV2(stored)
    setPlannerPlan(stored)
    setPlannerMessage(`已按 ${records.length} 条 PracticeRecordV2 记录生成今日计划（${stored.items.length} 项）`)
  }

  useEffect(() => {
    if (!readDailyPlanV2()) regeneratePlannerPlan()
  }, [])

  useEffect(() => practiceRecordRepository.subscribe(() => {
    const current = readDailyPlanV2()
    if (!current) {
      regeneratePlannerPlan()
      return
    }
    const records = practiceRecordRepository.list()
    const mastery = computeScoreMastery(records)
    const updated = updateDailyPlanFromRecords(current, records, mastery)
    writeDailyPlanV2(updated.state)
    setPlannerPlan(updated.state)
    setPlannerMessage(updated.changed ? '新练习已达到成功标准，今日任务已自动完成' : '新练习已计入能力与小节掌握度；今日任务顺序保持稳定')
  }), [plannerPreferences.availableMinutes, plannerPreferences.goal, practiceRecords])

  const updatePlannerPreferences = (next: typeof plannerPreferences): void => {
    const sanitized = {
      availableMinutes: Math.min(120, Math.max(10, Math.round(next.availableMinutes))),
      goal: next.goal.slice(0, 200)
    }
    setPlannerPreferences(sanitized)
    writePlannerPreferences(sanitized)
  }

  const togglePlanItem = (exerciseId: string): void => {
    if (!plannerPlan) return
    const next: DailyPlanV2State = {
      ...plannerPlan,
      progress: {
        ...plannerPlan.progress,
        [exerciseId]: plannerPlan.progress[exerciseId] === 'done' ? 'pending' : 'done'
      }
    }
    writeDailyPlanV2(next)
    setPlannerPlan(next)
    setPlannerMessage(next.progress[exerciseId] === 'done' ? '已标记完成' : '已恢复未完成')
  }

  const persist = (nextState: TrainingPlanState, successMessage = '已保存'): void => {
    const result = saveTrainingPlanState(nextState)
    setPlanState(result.state)
    setMessage(result.success ? successMessage : (result.message ?? '保存失败'))
  }

  useEffect(() => {
    setPlanState((current) => {
      if (current.weeklyRecords[currentWeekStart]) return current
      const ensured = ensureWeeklyTrainingRecord(current, currentWeekStart)
      return saveTrainingPlanState(ensured.state).state
    })
  }, [currentWeekStart])

  const currentStage = getTrainingPlanStage(planState.currentStageId)
  const completedStageProjects = currentStage.projects.filter(
    (project) => planState.stageProjects[project.id]?.status === 'completed'
  ).length
  const stageProgress = calculatePercentage(completedStageProjects, currentStage.projects.length)

  const completedModules = useMemo(
    () => getTodayCompletedModules(practiceRecords, selectedDate),
    [practiceRecords, selectedDate]
  )
  const latestModuleResults = useMemo(
    () => getTodayLatestModuleResults(practiceRecords, selectedDate),
    [practiceRecords, selectedDate]
  )
  const dailyRecord = planState.dailyRecords[selectedDate]
  const dailyCompletion = DAILY_TRAINING_PLAN.map((task) => {
    const manualStatus = dailyRecord?.taskOverrides[task.id]
    const autoCompleted = isDailyTaskAutoCompleted(task, completedModules)
    return {
      task,
      autoCompleted,
      manualStatus,
      completed: manualStatus ? manualStatus === 'completed' : autoCompleted
    }
  })
  const completedMinutes = dailyCompletion.reduce(
    (total, item) => total + (item.completed ? item.task.minutes : 0),
    0
  )

  const weeklyRecord = planState.weeklyRecords[selectedWeekStart] ?? {
    weekStart: selectedWeekStart,
    goals: createDefaultWeeklyGoals(selectedWeekStart)
  }
  const availableWeeks = Array.from(new Set([
    currentWeekStart,
    ...Object.keys(planState.weeklyRecords)
  ])).sort().reverse()

  const achievedChecklist = LEVEL_SIX_CHECKLIST.filter(
    (item) => planState.levelSixProgress[item.id]?.status === 'achieved'
  ).length
  const trainingChecklist = LEVEL_SIX_CHECKLIST.filter(
    (item) => planState.levelSixProgress[item.id]?.status === 'training'
  ).length

  const updateStageProject = (
    projectId: string,
    patch: Partial<{ status: StageProjectStatus; note: string }>,
    announce = true
  ): void => {
    const current = planState.stageProjects[projectId] ?? createDefaultStageProjectProgress()
    persist({
      ...planState,
      stageProjects: {
        ...planState.stageProjects,
        [projectId]: { ...current, ...patch }
      }
    }, announce ? '项目进度已保存' : '备注已保存')
  }

  const updateWeeklyGoal = (goalId: string, patch: Partial<WeeklyCustomGoal>, announce = false): void => {
    const ensured = ensureWeeklyTrainingRecord(planState, selectedWeekStart)
    const goals = ensured.record.goals.map((goal) => goal.id === goalId ? { ...goal, ...patch } : goal)
    persist({
      ...ensured.state,
      weeklyRecords: {
        ...ensured.state.weeklyRecords,
        [selectedWeekStart]: { weekStart: selectedWeekStart, goals }
      }
    }, announce ? '本周目标已保存' : '已保存')
  }

  const updateChecklist = (
    itemId: string,
    patch: Partial<{ status: LevelSixStatus; note: string; evidence: string; lastAssessmentDate: string }>,
    successMessage = '验收状态已保存'
  ): void => {
    const current = planState.levelSixProgress[itemId] ?? createDefaultLevelSixProgress()
    persist({
      ...planState,
      levelSixProgress: {
        ...planState.levelSixProgress,
        [itemId]: { ...current, ...patch }
      }
    }, successMessage)
  }

  const handleConfirm = (): void => {
    if (!confirmAction) return
    if (confirmAction.type === 'stage') {
      persist(changeCurrentStage(planState, confirmAction.stageId, todayDate), '当前阶段已切换')
    } else if (confirmAction.type === 'daily-reset') {
      persist(resetDailyTrainingRecord(planState, selectedDate), '当日手动状态已重置')
    } else {
      const emptyGoal = createDefaultWeeklyGoals(selectedWeekStart).find((goal) => goal.id === confirmAction.goalId)
      if (emptyGoal) updateWeeklyGoal(confirmAction.goalId, emptyGoal, true)
    }
    setConfirmAction(null)
  }

  const confirmCopy = getConfirmCopy(confirmAction)

  return (
    <section className="training-plan-page">
      <header className="training-plan-header">
        <div>
          <span className="eyebrow">Structured Practice Plan</span>
          <h2>稳定六级综合训练计划</h2>
          <p>通过基础技术、节奏读谱、练习曲、古典作品和喜欢的曲目，逐步建立稳定的六级综合能力。</p>
        </div>
        <AppButton variant="secondary" onClick={onBackHome}>返回首页</AppButton>
      </header>

      <nav className="training-plan-tabs" aria-label="训练计划页面">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message ? <div className="training-plan-toast" role="status">{message}</div> : null}

      {activeTab === 'stage' ? (
        <div className="training-plan-content">
          <AppCard className="training-plan-summary">
            <div className="training-plan-summary__top">
              <div>
                <span className="eyebrow">当前训练阶段</span>
                <h3>{currentStage.title}</h3>
                <p>{currentStage.period} · {currentStage.goal}</p>
              </div>
              <div className="training-plan-fields">
                <label>
                  <span>选择阶段</span>
                  <select
                    value={planState.currentStageId}
                    onChange={(event) => setConfirmAction({ type: 'stage', stageId: event.target.value as TrainingPlanStageId })}
                  >
                    {TRAINING_PLAN_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
                  </select>
                </label>
                <label>
                  <span>阶段开始日期</span>
                  <input
                    type="date"
                    value={planState.stageStartDates[currentStage.id] ?? todayDate}
                    onChange={(event) => persist({
                      ...planState,
                      stageStartDates: { ...planState.stageStartDates, [currentStage.id]: event.target.value }
                    }, '开始日期已保存')}
                  />
                </label>
              </div>
            </div>
            <div className="training-plan-progress-row">
              <div><span>阶段进度</span><strong>{completedStageProjects} / {currentStage.projects.length}</strong></div>
              <div className="training-plan-progress"><i style={{ width: `${stageProgress}%` }} /></div>
              <b>{stageProgress}%</b>
            </div>
          </AppCard>

          <div className="training-plan-stage-info">
            <AppCard><h4>训练重点</h4><ul>{currentStage.focuses.map((item) => <li key={item}>{item}</li>)}</ul></AppCard>
            <AppCard><h4>核心材料与应用曲目</h4><ul>{[...currentStage.coreMaterials, ...currentStage.applicationPieces].map((item) => <li key={item}>{item}</li>)}</ul></AppCard>
          </div>

          <div className="training-plan-section-heading">
            <div><h3>阶段项目</h3><p>项目进度由你手动确认，软件练习记录不会自动把阶段项目判为完成。</p></div>
          </div>
          <div className="training-project-list">
            {currentStage.projects.map((project) => {
              const progress = planState.stageProjects[project.id] ?? createDefaultStageProjectProgress()
              return (
                <AppCard key={project.id} as="article" className="training-project-card">
                  <div className="training-project-card__header">
                    <div>
                      <div className="training-plan-badges">
                        <StatusBadge tone="info">{project.category}</StatusBadge>
                        <StatusBadge tone={project.taskType === 'software' ? 'success' : 'warning'}>{TRAINING_TASK_TYPE_LABELS[project.taskType]}</StatusBadge>
                      </div>
                      <h4>{project.title}</h4>
                    </div>
                    <select
                      aria-label={`${project.title}状态`}
                      value={progress.status}
                      onChange={(event) => updateStageProject(project.id, { status: event.target.value as StageProjectStatus })}
                    >
                      {Object.entries(STAGE_PROJECT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className="training-project-details">
                    <p><strong>内容</strong>{project.content}</p>
                    <p><strong>目标</strong>{project.objective}</p>
                    <p><strong>验收</strong>{project.acceptance}</p>
                    {project.notes ? <p className="training-plan-note"><strong>注意</strong>{project.notes}</p> : null}
                  </div>
                  {project.recommendedSettings?.length ? (
                    <p className="training-recommendation">推荐设置：{project.recommendedSettings.join(' · ')}</p>
                  ) : null}
                  <div className="training-project-actions">
                    {project.taskType === 'software' && project.linkedModule ? (
                      <AppButton onClick={() => onNavigateModule(project.linkedModule!)}>开始练习</AppButton>
                    ) : (
                      <>
                        <AppButton variant="secondary" onClick={() => updateStageProject(project.id, { status: 'training' })}>标记训练中</AppButton>
                        <AppButton onClick={() => updateStageProject(project.id, { status: 'completed' })}>标记完成</AppButton>
                      </>
                    )}
                    <label className="training-project-note-input">
                      <span>简短备注</span>
                      <input
                        key={`${project.id}-${progress.note}`}
                        defaultValue={progress.note}
                        maxLength={240}
                        placeholder="记录难点或下一步"
                        onBlur={(event) => updateStageProject(project.id, { note: event.target.value }, false)}
                      />
                    </label>
                  </div>
                </AppCard>
              )
            })}
          </div>

          <div className="training-plan-stage-info">
            <AppCard><h4>阶段验收</h4><ul>{currentStage.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul></AppCard>
            <AppCard className="training-plan-risk-card"><h4>主要风险</h4><ul>{currentStage.risks.map((item) => <li key={item}>{item}</li>)}</ul></AppCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'daily' ? (
        <div className="training-plan-content">
          {plannerMessage ? <div className="training-plan-toast" role="status">{plannerMessage}</div> : null}
          <AppCard className="training-plan-summary training-plan-daily-summary">
            <div>
              <span className="eyebrow">Daily Practice · Planner 2.0</span>
              <h3>{plannerPlan ? `今日计划（${plannerPlan.date}）` : '固定 90 分钟训练模板'}</h3>
              <p>
                {plannerPlan
                  ? '由 PracticeRecordV2 → Ability / Score Mastery → Planner 真实生成；每项包含 whyThis 与证据引用，完成后点击勾选更新进度。'
                  : '软件任务可读取所选日期的完成记录；任何手动切换都会优先于自动状态。'}
              </p>
            </div>
            <label className="training-plan-date-field"><span>训练日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
            <div className="training-plan-daily-progress">
              <strong>{plannerPlan ? plannerPlan.items.reduce((sum, item) => sum + (plannerPlan.progress[item.exerciseId] === 'done' ? item.minutes : 0), 0) : completedMinutes}<small> / {plannerPlan ? plannerPlan.items.reduce((sum, item) => sum + item.minutes, 0) : DAILY_TRAINING_TOTAL_MINUTES} 分钟</small></strong>
              <div className="training-plan-progress"><i style={{ width: `${calculatePercentage(
                plannerPlan ? plannerPlan.items.reduce((sum, item) => sum + (plannerPlan.progress[item.exerciseId] === 'done' ? item.minutes : 0), 0) : completedMinutes,
                plannerPlan ? plannerPlan.items.reduce((sum, item) => sum + item.minutes, 0) : DAILY_TRAINING_TOTAL_MINUTES
              )}%` }} /></div>
            </div>
            <div className="training-plan-daily-actions">
              {plannerPlan ? <AppButton variant="secondary" onClick={regeneratePlannerPlan}>重新生成</AppButton> : null}
              <AppButton variant="ghost" onClick={() => setConfirmAction({ type: 'daily-reset' })}>重置当日状态</AppButton>
            </div>
          </AppCard>

          <AppCard className="training-plan-planner-settings">
            <label>
              <span>可用时间</span>
              <select
                value={[15, 20, 30, 45, 60].includes(plannerPreferences.availableMinutes) ? plannerPreferences.availableMinutes : 'custom'}
                onChange={(event) => {
                  if (event.target.value !== 'custom') {
                    updatePlannerPreferences({ ...plannerPreferences, availableMinutes: Number(event.target.value) })
                  }
                }}
              >
                {[15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
                <option value="custom">自定义</option>
              </select>
            </label>
            <label>
              <span>自定义分钟</span>
              <input
                type="number"
                min="10"
                max="120"
                value={plannerPreferences.availableMinutes}
                onChange={(event) => updatePlannerPreferences({ ...plannerPreferences, availableMinutes: Number(event.target.value) || 10 })}
              />
            </label>
            <label className="training-plan-planner-goal">
              <span>近期目标</span>
              <input
                value={plannerPreferences.goal}
                placeholder="例如：加强识谱 / 提升某首曲"
                onChange={(event) => updatePlannerPreferences({ ...plannerPreferences, goal: event.target.value })}
              />
            </label>
            <AppButton variant="secondary" onClick={regeneratePlannerPlan}>按设置更新计划</AppButton>
          </AppCard>

          {plannerPlan ? (
            <div className="daily-task-list">
              {plannerPlan.items.map((item) => {
                const done = plannerPlan.progress[item.exerciseId] === 'done'
                const scoreMatch = /^score:(.+):(\d+)$/.exec(item.exerciseId)
                const skillLabel = item.targetSkillIds.join(' · ') || 'score-performance'
                const handLabel = item.handMode === 'right' ? '右手' : item.handMode === 'left' ? '左手' : item.handMode === 'both' ? '双手' : ''
                return (
                  <AppCard key={item.exerciseId} as="article" className={`daily-task-card ${done ? 'is-completed' : ''}`}>
                    <button
                      className="daily-task-check"
                      type="button"
                      aria-label={done ? `将${item.exerciseId}标记为未完成` : `将${item.exerciseId}标记为完成`}
                      onClick={() => togglePlanItem(item.exerciseId)}
                    >{done ? '✓' : ''}</button>
                    <div className="daily-task-time"><strong>{item.minutes}</strong><span>分钟</span></div>
                    <div className="daily-task-copy">
                      <div className="training-plan-badges">
                        <StatusBadge tone="success">{skillLabel}</StatusBadge>
                        {item.mode ? <StatusBadge tone="info">{item.mode}{handLabel ? ` · ${handLabel}` : ''}</StatusBadge> : null}
                        {done ? <StatusBadge tone="success">已完成</StatusBadge> : null}
                      </div>
                      <h4>{scoreMatch ? `《${scoreMatch[1]}》第 ${scoreMatch[2]} 小节` : item.exerciseId}</h4>
                      <p><strong>成功标准：</strong>{item.successCriteria}</p>
                      <p><strong>为什么安排：</strong>{item.whyThis}</p>
                      <small>证据引用 {item.evidenceRefs.length} 条 · 降级：{item.fallback ?? '—'} · 进阶：{item.harderVariant ?? '—'}</small>
                    </div>
                    <div className="daily-task-actions">
                      {scoreMatch ? (
                        <AppButton variant="secondary" onClick={() => onOpenScoreSegment(scoreMatch[1], Number(scoreMatch[2]), Number(scoreMatch[2]))}>
                          打开乐谱片段
                        </AppButton>
                      ) : null}
                    </div>
                  </AppCard>
                )
              })}
            </div>
          ) : (
            <div className="daily-task-list">
              {dailyCompletion.map(({ autoCompleted, completed, manualStatus, task }) => (
                <AppCard key={task.id} as="article" className={`daily-task-card ${completed ? 'is-completed' : ''}`}>
                  <button
                    className="daily-task-check"
                    type="button"
                    aria-label={completed ? `将${task.title}标记为未完成` : `将${task.title}标记为完成`}
                    onClick={() => persist(
                      setDailyTaskOverride(planState, selectedDate, task.id, completed ? 'pending' : 'completed'),
                      '当日状态已保存'
                    )}
                  >{completed ? '✓' : ''}</button>
                  <div className="daily-task-time"><strong>{task.minutes}</strong><span>分钟</span></div>
                  <div className="daily-task-copy">
                    <div className="training-plan-badges">
                      <StatusBadge tone={task.taskType === 'software' ? 'success' : 'warning'}>{TRAINING_TASK_TYPE_LABELS[task.taskType]}</StatusBadge>
                      {manualStatus ? <StatusBadge tone="info">手动覆盖</StatusBadge> : null}
                      {!manualStatus && autoCompleted ? <StatusBadge tone="success">今日记录已完成</StatusBadge> : null}
                    </div>
                    <h4>{task.title}</h4>
                    <p>{task.content}</p>
                    <p><strong>目标：</strong>{task.objective}</p>
                    {task.notes ? <small>{task.notes}</small> : null}
                    {task.linkedModules?.map((module) => latestModuleResults[module] ? (
                      <small key={module}>{moduleLabels[module]}最近结果：正确率 {latestModuleResults[module]!.accuracy}%</small>
                    ) : null)}
                  </div>
                  {task.linkedModules?.length ? (
                    <div className="daily-task-actions">
                      {task.linkedModules.map((module) => <AppButton key={module} variant="secondary" onClick={() => onNavigateModule(module)}>{moduleLabels[module]}</AppButton>)}
                    </div>
                  ) : null}
                </AppCard>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === 'weekly' ? (
        <div className="training-plan-content">
          <AppCard className="training-plan-summary training-plan-week-summary">
            <div><span className="eyebrow">Weekly Focus</span><h3>每周训练安排</h3><p>每周一使用新的周起始日期保存，历史目标不会被覆盖。</p></div>
            <label><span>查看周记录</span><select value={selectedWeekStart} onChange={(event) => setSelectedWeekStart(event.target.value)}>{availableWeeks.map((week) => <option key={week} value={week}>{formatWeekLabel(week)}{week === currentWeekStart ? '（本周）' : ''}</option>)}</select></label>
          </AppCard>

          <div className="weekly-schedule-grid">
            {WEEKLY_TRAINING_PLAN.map((day) => {
              const todayDay = today.getDay() === 0 ? 7 : today.getDay()
              const isToday = selectedWeekStart === currentWeekStart && day.day === todayDay
              return (
                <AppCard key={day.day} as="article" className={`weekly-day-card ${isToday ? 'is-today' : ''}`}>
                  <div><span>{day.label}</span>{isToday ? <StatusBadge tone="success">今天</StatusBadge> : null}</div>
                  <h4>{day.focus}</h4><p>{day.content}</p><small>验收：{day.acceptance}</small>
                </AppCard>
              )
            })}
          </div>

          <div className="training-plan-section-heading"><div><h3>本周三个自定义目标</h3><p>目标按周保存，切换历史周可查看和继续编辑。</p></div></div>
          <div className="weekly-goal-grid">
            {weeklyRecord.goals.map((goal, index) => (
              <AppCard key={goal.id} as="article" className="weekly-goal-card">
                <div className="weekly-goal-card__header"><h4>目标 {index + 1}</h4><select value={goal.status} onChange={(event) => updateWeeklyGoal(goal.id, { status: event.target.value as WeeklyGoalStatus }, true)}>{Object.entries(WEEKLY_GOAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <label><span>目标内容</span><input key={`${goal.id}-content-${goal.content}`} defaultValue={goal.content} maxLength={240} placeholder="例如：C、G 大调双手连续" onBlur={(event) => updateWeeklyGoal(goal.id, { content: event.target.value }, true)} /></label>
                <label><span>验收标准</span><input key={`${goal.id}-acceptance-${goal.acceptance}`} defaultValue={goal.acceptance} maxLength={240} placeholder="例如：60 BPM 连续三遍" onBlur={(event) => updateWeeklyGoal(goal.id, { acceptance: event.target.value }, true)} /></label>
                <label><span>备注</span><textarea key={`${goal.id}-note-${goal.note}`} defaultValue={goal.note} maxLength={600} rows={3} placeholder="记录本周进展" onBlur={(event) => updateWeeklyGoal(goal.id, { note: event.target.value }, true)} /></label>
                <AppButton variant="ghost" onClick={() => setConfirmAction({ type: 'weekly-clear', goalId: goal.id })}>清空该目标</AppButton>
              </AppCard>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'mapping' ? (
        <div className="training-plan-content">
          <div className="training-plan-section-heading"><div><h3>技术与曲目对应</h3><p>用于选择材料和迁移方向，不进行自动能力评分。</p></div></div>
          <div className="technique-mapping-grid">
            {TECHNIQUE_MAPPINGS.map((mapping, index) => (
              <AppCard key={mapping.id} as="article" className="technique-mapping-card">
                <span className="technique-index">{String(index + 1).padStart(2, '0')}</span><h4>{mapping.title}</h4>
                <div><strong>古典材料</strong><p>{mapping.classicalMaterials.join(' · ')}</p></div>
                <div><strong>应用曲目</strong><p>{mapping.applicationPieces.join(' · ')}</p></div>
                <div><strong>训练点</strong><ul>{mapping.trainingPoints.map((point) => <li key={point}>{point}</li>)}</ul></div>
              </AppCard>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'checklist' ? (
        <div className="training-plan-content">
          <AppCard className="training-plan-summary checklist-summary">
            <div><span className="eyebrow">Level 6 Checklist</span><h3>六级综合能力验收</h3><p>最终达标由你根据真实钢琴表现手动确认，不由一次软件正确率自动决定。</p></div>
            <div className="checklist-summary__stats"><span><strong>{achievedChecklist}</strong>已达标</span><span><strong>{trainingChecklist}</strong>训练中</span><span><strong>{calculatePercentage(achievedChecklist, LEVEL_SIX_CHECKLIST.length)}%</strong>总进度</span></div>
          </AppCard>
          <div className="level-six-list">
            {LEVEL_SIX_CHECKLIST.map((item) => {
              const progress = planState.levelSixProgress[item.id] ?? createDefaultLevelSixProgress()
              return (
                <AppCard key={item.id} as="article" className="level-six-card">
                  <div className="level-six-card__number">{item.order}</div>
                  <div className="level-six-card__content">
                    <div className="level-six-card__header"><div><StatusBadge tone="info">{item.category}</StatusBadge><h4>{item.title}</h4></div><select value={progress.status} onChange={(event) => updateChecklist(item.id, { status: event.target.value as LevelSixStatus })}>{Object.entries(LEVEL_SIX_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div className="level-six-fields">
                      <label><span>备注</span><textarea key={`${item.id}-note-${progress.note}`} defaultValue={progress.note} rows={2} maxLength={800} onBlur={(event) => updateChecklist(item.id, { note: event.target.value }, '备注已保存')} /></label>
                      <label><span>验收证据</span><textarea key={`${item.id}-evidence-${progress.evidence}`} defaultValue={progress.evidence} rows={2} maxLength={800} placeholder="录像、曲目、速度或老师反馈" onBlur={(event) => updateChecklist(item.id, { evidence: event.target.value }, '验收证据已保存')} /></label>
                      <label><span>最近评估日期</span><input type="date" value={progress.lastAssessmentDate} onChange={(event) => updateChecklist(item.id, { lastAssessmentDate: event.target.value }, '评估日期已保存')} /></label>
                    </div>
                  </div>
                </AppCard>
              )
            })}
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="training-plan-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAction(null) }}>
          <div className="training-plan-confirm" role="dialog" aria-modal="true" aria-labelledby="training-plan-confirm-title">
            <h3 id="training-plan-confirm-title">{confirmCopy.title}</h3><p>{confirmCopy.message}</p>
            <div><AppButton variant="secondary" onClick={() => setConfirmAction(null)}>取消</AppButton><AppButton onClick={handleConfirm}>{confirmCopy.confirm}</AppButton></div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
