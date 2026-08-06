import type { DailyTrainingTask } from './trainingPlanTypes'

export const DAILY_TRAINING_PLAN: DailyTrainingTask[] = [
  {
    id: 'daily-scales',
    order: 1,
    minutes: 10,
    title: '当天大调及关系小调音阶',
    content: '使用软件完成当天大调音阶，关系小调在真实钢琴上按可靠指法谱补充。',
    objective: '指法正确、均匀连续。',
    taskType: 'software',
    linkedModules: ['scale'],
    notes: '当前软件只自动识别大调音阶记录，不假定已支持小调音阶。'
  },
  {
    id: 'daily-chords-arpeggios',
    order: 2,
    minutes: 10,
    title: '琶音、三和弦及转位',
    content: '先用软件练三和弦与转位，再在真实钢琴上补充完整琶音和指法。',
    objective: '建立手型与和弦迁移。',
    taskType: 'software',
    linkedModules: ['chord'],
    notes: '软件记录只代表和弦训练部分完成，琶音仍需线下确认。'
  },
  {
    id: 'daily-rhythm-coordination',
    order: 3,
    minutes: 10,
    title: '节奏、切分、双手协调',
    content: '按当天薄弱项选择节奏与切分或左右手协调训练。',
    objective: '建立共同时间轴，不一拍一停。',
    taskType: 'software',
    linkedModules: ['rhythm', 'coordination']
  },
  {
    id: 'daily-sight-reading',
    order: 4,
    minutes: 10,
    title: '简单陌生谱视奏',
    content: '先用软件训练音符识别，再在线下连续读完一段陌生短谱。',
    objective: '眼睛向前，错音后继续。',
    taskType: 'software',
    linkedModules: ['sight-reading'],
    notes: '软件不会判定完整曲谱视奏，真实短谱必须在线下完成。'
  },
  {
    id: 'daily-etude',
    order: 5,
    minutes: 15,
    title: '当前练习曲',
    content: '围绕当天最薄弱的单一技术问题做小段落训练。',
    objective: '解决单一技术问题。',
    taskType: 'repertoire'
  },
  {
    id: 'daily-classical',
    order: 6,
    minutes: 15,
    title: '当前古典或复调作品',
    content: '处理段落结构、声部走向和触键层次。',
    objective: '补充结构、声部与触键。',
    taskType: 'repertoire'
  },
  {
    id: 'daily-main-piece',
    order: 7,
    minutes: 20,
    title: '当前喜欢的主练曲',
    content: '把当日基础技术迁移到正在完成的主要曲目。',
    objective: '应用并检验技术迁移。',
    taskType: 'repertoire'
  }
]

export const DAILY_TRAINING_TOTAL_MINUTES = DAILY_TRAINING_PLAN.reduce(
  (total, task) => total + task.minutes,
  0
)

