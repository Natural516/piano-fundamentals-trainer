/** Preparation-only App copy. Settings identities and musical facts remain domain-owned. */
export const intervalPreparationResources = {
  'zh-CN': {
    title: '音程练习', preparation: '练习准备', heading: '设置本轮音程练习',
    description: '覆盖 26 种向上音程，范围 F1 – G6；开始后将进入无底部导航的专注练习页。',
    answerHint: '答案提示', answerHintDescription: '关闭时仍显示固定大谱表和根音，只隐藏目标音',
    bassAccidentals: '低音包含升降号', bassAccidentalsDescription: '关闭时低音只用自然音；目标音仍按正确拼写使用升降号',
    questionCount: '练习题数', questionCountLabel: '音程练习题数',
    questionCountDescription: '固定题数完成后自动结束；无限练习需主动结束',
    questions: '{{count}} 题', unlimited: '无限练习', start: '开始练习',
    on: 'On', off: 'Off', enabled: '开启', disabled: '关闭', switchLabel: '{{setting}}已{{state}}'
  },
  en: {
    title: 'Interval Practice', preparation: 'Practice preparation', heading: 'Set up this interval session',
    description: 'Practice 26 ascending interval types within F1 – G6. Start to enter focused practice without bottom navigation.',
    answerHint: 'Answer hint', answerHintDescription: 'Off: the grand staff shows only the bass note. On: it shows the bass note and target note.',
    bassAccidentals: 'Include accidentals in bass notes', bassAccidentalsDescription: 'Off: bass notes are natural notes only. Target notes still use the correct accidental spelling.',
    questionCount: 'Questions', questionCountLabel: 'Interval practice question count',
    questionCountDescription: 'Fixed-count sessions end automatically. End unlimited practice yourself.',
    questions_one: '{{count}} question', questions_other: '{{count}} questions', unlimited: 'Unlimited practice', start: 'Start practice',
    on: 'On', off: 'Off', enabled: 'On', disabled: 'Off', switchLabel: '{{setting}}: {{state}}'
  }
} as const
