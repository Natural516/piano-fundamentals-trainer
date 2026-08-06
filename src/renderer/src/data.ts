import type { NavigationItem, PageId, PracticeModule } from './types'

export const navigationItems: NavigationItem[] = [
  { id: 'home', label: '首页', glyph: '⌂' },
  { id: 'training-plan', label: '训练计划', glyph: '▦' },
  { id: 'records', label: '练习记录', glyph: '□' },
  { id: 'analytics', label: '统计分析', glyph: '▥' },
  { id: 'settings', label: '设置', glyph: '⚙' }
]

export const practiceModules: PracticeModule[] = [
  {
    id: 'sight-reading',
    number: '01',
    title: '识谱练习',
    description: '单音、双音、三音快速识别',
    visual: 'staff',
    accent: 'violet'
  },
  {
    id: 'rhythm',
    number: '02',
    title: '节奏与切分',
    description: '拍点、休止、弱拍、切分训练',
    visual: 'metronome',
    accent: 'blue'
  },
  {
    id: 'scales',
    number: '03',
    title: '音阶练习',
    description: '12 个大调音阶训练',
    visual: 'stairs',
    accent: 'cyan'
  },
  {
    id: 'chords',
    number: '04',
    title: '和弦练习',
    description: '三和弦、转位、柱式、分解和弦',
    visual: 'rings',
    accent: 'amber'
  },
  {
    id: 'coordination',
    number: '05',
    title: '左右手协调',
    description: '合手、错位、分解伴奏',
    visual: 'hands',
    accent: 'rose'
  },
  {
    id: 'free-practice',
    number: '06',
    title: '自由练习',
    description: '自由 MIDI 输入与键盘显示',
    visual: 'pen',
    accent: 'indigo'
  }
]

export const pageTitles: Record<PageId, string> = {
  home: '首页',
  'training-plan': '稳定六级综合训练计划',
  records: '练习记录',
  analytics: '统计分析',
  badges: '成就徽章',
  settings: '设置',
  'sight-reading': '识谱练习',
  rhythm: '节奏与切分',
  scales: '音阶练习',
  chords: '和弦练习',
  coordination: '左右手协调',
  'free-practice': '自由练习',
  'midi-test': 'MIDI 输入测试',
  metronome: '节拍器与判定测试',
  help: '帮助中心'
}
