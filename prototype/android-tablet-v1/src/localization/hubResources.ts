/** App-owned entry-page copy. Theme artwork, author metadata and theme slogans stay untouched. */
export const hubResources = {
  'zh-CN': {
    home: {
      title: '今天，读几页新音符', today: '今日练习', headline: '让眼睛先认出，再让手指弹出来。',
      headlineFirst: '让眼睛先认出，', headlineSecond: '再让手指弹出来。', preview: '识谱练习预览',
      overview: '今日概览', lastPractice: '上次练习', loading: '正在读取记录', empty: '暂无练习记录',
      emptyDetail: '完成一次练习后，这里会显示最近结果。', midiInput: 'MIDI 输入',
      theory: '乐理工具', theoryTitle: '基础知识查询', theoryDetail: '和弦、音阶、音程与调号',
      accuracy: '{{value}}% 正确率', completionRate: '{{value}}% 完成率', firstTryAccuracy: '{{value}} 首次正确率',
      completed: '完成 {{count}}', completedFixed: '完成 {{completed}}/{{total}}',
      recentDetail: '{{date}} · {{module}} · {{progress}}', recentModeDetail: '{{date}} · {{mode}} · {{progress}}',
      sight: '识谱', chord: '和弦', interval: '音程', unknownTime: '时间未知',
      todayTime: '今天 {{time}}', yesterdayTime: '昨天 {{time}}',
      dateTime: '{{month}} 月 {{day}} 日 {{time}}', yearDateTime: '{{year}} 年 {{month}} 月 {{day}} 日 {{time}}'
    },
    practice: {
      title: '练习', heading: '选择今天的练习', description: '从识谱、和弦或音程开始，按自己的节奏打牢基础。',
      hubLabel: '练习中心', hubDescription: '选择识谱、和弦或音程练习，把基础一步一步练扎实。',
      sightCategory: '识谱训练', sightTitle: '识谱练习', sightDescription: '单音 / 双音识谱 · 看谱识音',
      chordCategory: '和弦与转位', chordTitle: '和弦练习', chordDescription: '三和弦 / 七和弦 · 原位与转位 · 柱式 + 分解',
      intervalCategory: '音程辨识与构造', intervalTitle: '音程练习', intervalDescription: '指定低音构造 · 26 种音程',
      start: '开始练习'
    },
    tools: {
      title: '工具', heading: '乐理基础知识查询', shortHeading: '乐理工具',
      description: '快速查询常用和弦、音阶、音程与调号基础信息。',
      panelDescription: '快速查询和弦、音程与自然大调音阶、调号。',
      chordTitle: '和弦查询', chordDetail: '查看规范和弦名称与完整理论构成音',
      intervalTitle: '音程查询', intervalDetail: '识别两个音之间的音程',
      scaleTitle: '自然大调音阶与调号', scaleDetail: '查看自然大调音阶与五线谱调号',
      open: '打开', openTool: '打开工具'
    }
  },
  en: {
    home: {
      title: 'Read a few new notes today', today: 'Today’s practice', headline: 'Read the notes, then play them.',
      headlineFirst: 'Read the notes,', headlineSecond: 'then play them.', preview: 'Sight reading preview',
      overview: 'Today at a glance', lastPractice: 'Last practice', loading: 'Loading practice records', empty: 'No practice records yet',
      emptyDetail: 'Your latest result will appear here after a practice session.', midiInput: 'MIDI input',
      theory: 'Theory tools', theoryTitle: 'Explore music theory', theoryDetail: 'Chords, scales, intervals and key signatures',
      accuracy: '{{value}}% accuracy', completionRate: '{{value}}% completion rate', firstTryAccuracy: '{{value}} first-try accuracy',
      completed_one: '{{count}} question completed', completed_other: '{{count}} questions completed', completedFixed: '{{completed}}/{{total}} completed',
      recentDetail: '{{date}} · {{module}} · {{progress}}', recentModeDetail: '{{date}} · {{mode}} · {{progress}}',
      sight: 'Sight reading', chord: 'Chords', interval: 'Intervals', unknownTime: 'Time unknown',
      todayTime: 'Today {{time}}', yesterdayTime: 'Yesterday {{time}}',
      dateTime: '{{month}}/{{day}} {{time}}', yearDateTime: '{{year}}/{{month}}/{{day}} {{time}}'
    },
    practice: {
      title: 'Practice', heading: 'Choose today’s practice', description: 'Build your foundations with sight reading, chords or intervals, at your own pace.',
      hubLabel: 'Practice center', hubDescription: 'Choose sight reading, chords or intervals to build your foundations step by step.',
      sightCategory: 'Sight Reading', sightTitle: 'Sight Reading', sightDescription: 'Single notes and pairs · Read and recognize notes',
      chordCategory: 'Chords & Inversions', chordTitle: 'Chord Practice', chordDescription: 'Triads and seventh chords · Root position and inversions · Block and broken chords',
      intervalCategory: 'Intervals', intervalTitle: 'Interval Practice', intervalDescription: 'Build from a given bass note · 26 interval types',
      start: 'Start practice'
    },
    tools: {
      title: 'Tools', heading: 'Explore music theory', shortHeading: 'Theory tools',
      description: 'Look up chords, scales, intervals and key signatures.',
      panelDescription: 'Look up chords, intervals, major scales and key signatures.',
      chordTitle: 'Chord Lookup', chordDetail: 'See standard chord names and all chord tones',
      intervalTitle: 'Interval Lookup', intervalDetail: 'Identify the interval between two notes',
      scaleTitle: 'Major Scale & Key Signature', scaleDetail: 'See major scale notes and staff key signatures',
      open: 'Open', openTool: 'Open tool'
    }
  }
} as const
