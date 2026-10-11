export const sightAnalysisResources = {
  'zh-CN': {
    title: '识谱分析', back: '返回练习记录', reportTitle: '识谱练习报告', missing: '无法读取这份练习报告。',
    window: '基于最近 {{count}} 次完整识谱练习',
    errors: '易错音', slow: '长思考音', sessionErrors: '本次易错音', sessionSlow: '本次长思考音',
    errorsHelp: '累计错误最多的谱面音，至少出现 5 次。',
    slowHelp: '最近练习中答对相对较慢的音，按中位用时排序；至少 5 个正确样本，不代表异常或已证明的弱项。',
    sampleHelp: '仅分析单音题，按谱号、谱面拼写与八度分别统计；错误包含按错和超时。',
    legacy: '此记录未保存详细音符统计，原有统计仍可查看。',
    noErrors: '暂无明显易错音', noSlow: '暂无符合排名条件的音：没有有效单音逐音数据，或每个音的正确样本不足 5 次。',
    noSessionErrors: '暂无易错音', noSessionSlow: '暂无可分析的正确样本',
    errorCount: '错误 {{count}} 次', usually: '答对中位用时 {{seconds}} 秒',
    correctSamples: '{{count}} 次正确样本', treble: '高音谱号', bass: '低音谱号',
    averageLabel: '平均反应时间', historyAverage: '平均反应 {{seconds}} 秒', historyAverageMissing: '平均反应 —',
    historyFacts: '{{settings}} · 完成 {{completed}}/{{total}} · 正确 {{correct}} / 错误 {{wrong}} / 超时 {{timeout}} · {{average}}',
    staff: '{{clef}} {{note}} 的谱面', rank: '第 {{count}} 名',
    loading: '正在读取识谱记录…', readFailed: '识谱记录尚未完整读取，暂不显示分析。'
  },
  en: {
    title: 'Sight Reading Analysis', back: 'Back to History', reportTitle: 'Sight Reading Report', missing: 'This practice report could not be read.',
    window_one: 'Based on the latest {{count}} completed sight-reading session',
    window_other: 'Based on the latest {{count}} completed sight-reading sessions',
    errors: 'Error-prone notes', slow: 'Slow-response notes', sessionErrors: 'Errors in this session', sessionSlow: 'Slow responses in this session',
    errorsHelp: 'The most errors by written note, with at least 5 occurrences.',
    slowHelp: 'Relatively slower correct responses in recent practice, ranked by median time. At least 5 correct samples; not necessarily outliers or proven weaknesses.',
    sampleHelp: 'Single-note questions only. Clefs, written spellings and octaves are counted separately; errors include wrong answers and timeouts.',
    legacy: 'Detailed note statistics were not saved for this record. Its original statistics remain available.',
    noErrors: 'No clear error-prone notes yet', noSlow: 'No eligible notes: there is no valid single-note detail, or each note has fewer than 5 correct samples.',
    noSessionErrors: 'No error-prone notes this session', noSessionSlow: 'No correct-response samples to analyze',
    errorCount_one: '{{count}} error', errorCount_other: '{{count}} errors', usually: 'Median correct time {{seconds}}s',
    correctSamples_one: '{{count}} correct sample', correctSamples_other: '{{count}} correct samples', treble: 'Treble clef', bass: 'Bass clef',
    averageLabel: 'Average response time', historyAverage: 'Avg response {{seconds}}s', historyAverageMissing: 'Avg response —',
    historyFacts: '{{settings}} · Completed {{completed}}/{{total}} · Correct {{correct}} · Wrong {{wrong}} · Timeouts {{timeout}} · {{average}}',
    staff: '{{clef}} notation for {{note}}', rank: 'Rank {{count}}',
    loading: 'Reading sight reading records…', readFailed: 'Sight reading records could not be fully loaded. Analysis is not shown.'
  }
} as const
