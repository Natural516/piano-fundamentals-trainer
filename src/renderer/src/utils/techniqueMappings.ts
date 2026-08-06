import type { TechniqueMapping } from './trainingPlanTypes'

export const TECHNIQUE_MAPPINGS: TechniqueMapping[] = [
  {
    id: 'broken-chord-continuity',
    title: '分解和弦与持续伴奏',
    classicalMaterials: ['布格缪勒《坦诉》', '布格缪勒《天使的和声》'],
    applicationPieces: ['Una Mattina', 'Kiss the Rain', '我与你'],
    trainingPoints: ['和弦延续', '左手持续运行', '旋律与伴奏并行']
  },
  {
    id: 'fixed-left-accompaniment',
    title: '固定左手伴奏',
    classicalMaterials: ['克列门蒂 Op.36 No.1', '车尔尼 599 相关条目'],
    applicationPieces: ['Comptine', '梦中的婚礼'],
    trainingPoints: ['阿尔贝蒂低音', '固定音型自动化']
  },
  {
    id: 'triple-meter-continuity',
    title: '三拍子与小节连续',
    classicalMaterials: ['《G 大调小步舞曲》'],
    applicationPieces: ['La Valse d’Amélie'],
    trainingPoints: ['三拍子脉搏', '小节线不停顿']
  },
  {
    id: 'fast-five-fingers',
    title: '快速五指与轻巧触键',
    classicalMaterials: ['《阿拉贝斯克》', '车尔尼 599 或 849'],
    applicationPieces: ['Flower Dance 前置技术'],
    trainingPoints: ['快速均匀', '轻巧落键', '避免砸键']
  },
  {
    id: 'chord-alignment-rhythm',
    title: '和弦整齐与强节奏',
    classicalMaterials: ['舒曼《士兵进行曲》', '布格缪勒《叙事曲》'],
    applicationPieces: ['动漫和游戏曲高潮段'],
    trainingPoints: ['同时落键', '断奏', '重拍与音型切换']
  },
  {
    id: 'hand-voice-independence',
    title: '双手声部独立',
    classicalMaterials: ['巴赫初级作品', '小前奏曲', '二部创意曲'],
    applicationPieces: ['复杂配乐和双手同时忙碌的作品'],
    trainingPoints: ['两手独立线路', '主题转移', '合手不放空']
  },
  {
    id: 'long-form-endurance',
    title: '长篇结构与耐力',
    classicalMaterials: ['克列门蒂或库劳小奏鸣曲'],
    applicationPieces: ['4—8 分钟完整独奏'],
    trainingPoints: ['结构记忆', '段落连接', '长时间保持节拍']
  },
  {
    id: 'lyrical-balance',
    title: '抒情旋律与伴奏平衡',
    classicalMaterials: ['舒曼《旋律》', '布格缪勒抒情作品'],
    applicationPieces: ['Kiss the Rain', 'Call of Silence'],
    trainingPoints: ['右手旋律清楚', '左手不过重', '踏板基础']
  }
]

