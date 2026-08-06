import type { WeeklyCustomGoal, WeeklyScheduleItem } from './trainingPlanTypes'

export const WEEKLY_TRAINING_PLAN: WeeklyScheduleItem[] = [
  { day: 1, label: '周一', focus: '音阶与和弦', content: '重点调 2 个，转位与分解和弦。', acceptance: '记录连续速度和错误位置。' },
  { day: 2, label: '周二', focus: '练习曲难点', content: '只攻 2—4 小节。', acceptance: '慢速连续三遍。' },
  { day: 3, label: '周三', focus: '节奏与视奏', content: '切分或四对二，加陌生谱。', acceptance: '错音不停车。' },
  { day: 4, label: '周四', focus: '古典作品', content: '段落连接和跨小节。', acceptance: '不只练段落开头。' },
  { day: 5, label: '周五', focus: '主练曲', content: '难点回放与简化合手。', acceptance: '一只手简化后逐层补全。' },
  { day: 6, label: '周六', focus: '完整测试', content: '慢速完整演奏与录像。', acceptance: '记录停顿、酸痛和节拍崩塌位置。' },
  { day: 7, label: '周日', focus: '休息或轻练', content: '熟曲、听录音和复盘。', acceptance: '不进行高强度重复练习。' }
]

export function createDefaultWeeklyGoals(weekStart: string): WeeklyCustomGoal[] {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `${weekStart}-goal-${index + 1}`,
    content: '',
    acceptance: '',
    status: 'not-started',
    note: ''
  }))
}

