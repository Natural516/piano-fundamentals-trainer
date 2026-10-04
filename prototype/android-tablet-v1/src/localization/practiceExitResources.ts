export const practiceExitResources = {
  'zh-CN': {
    endTitle: '结束本轮？', endHelp: '选择结束后，你可以决定是否保存本次练习记录。',
    saveTitle: '保存本次练习记录？', saveHelp: '是否将本次练习保存到记录？尚未完成的题目不会计为错误。',
    progressFixed: '已完成 {{completed}} / {{total}}。', progressEndless: '已完成 {{completed}} 题。',
    continuePractice: '继续练习', end: '结束', saveEnd: '保存并结束', discardEnd: '不保存并结束', cancel: '取消退出，返回练习'
  },
  en: {
    endTitle: 'End this session?', endHelp: 'You can choose whether to save this practice record in the next step.',
    saveTitle: 'Save this practice record?', saveHelp: 'Would you like to save this practice to History? Unfinished questions will not count as wrong answers.',
    progressFixed: 'Completed {{completed}} / {{total}}.', progressEndless: 'Completed {{completed}} questions.',
    continuePractice: 'Continue practice', end: 'End', saveEnd: 'Save and end', discardEnd: 'End without saving', cancel: 'Cancel exit and return to practice'
  }
} as const
