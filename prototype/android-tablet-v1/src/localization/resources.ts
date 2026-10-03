import { shellResources } from './shellResources'

export const localizationResources = {
  'zh-CN': {
    navigation: shellResources['zh-CN'].navigation,
    midi: shellResources['zh-CN'].midi,
    common: { appTitle: '钢琴基本功训练器', noData: '暂无' },
    music: { intervals: {
      perfectUnison: '纯一度', augmentedUnison: '增一度',
      diminishedSecond: '减二度', minorSecond: '小二度', majorSecond: '大二度', augmentedSecond: '增二度',
      diminishedThird: '减三度', minorThird: '小三度', majorThird: '大三度', augmentedThird: '增三度',
      diminishedFourth: '减四度', perfectFourth: '纯四度', augmentedFourth: '增四度',
      diminishedFifth: '减五度', perfectFifth: '纯五度', augmentedFifth: '增五度',
      diminishedSixth: '减六度', minorSixth: '小六度', majorSixth: '大六度', augmentedSixth: '增六度',
      diminishedSeventh: '减七度', minorSeventh: '小七度', majorSeventh: '大七度', augmentedSeventh: '增七度',
      diminishedOctave: '减八度', perfectOctave: '纯八度'
    } },
    settings: {
      ...shellResources['zh-CN'].settings,
      title: '设置',
      language: '语言',
      languageDescription: '即时生效，无需重启。其它页面的翻译将逐步完善。',
      system: '跟随系统',
      chinese: '简体中文',
      english: 'English',
      currentLanguage: '当前界面语言：{{language}}',
      loading: '正在读取语言设置…',
      saving: '正在保存语言设置…',
      errors: {
        readFailed: '无法读取语言设置，暂时跟随系统。',
        invalidDocument: '语言设置无法识别，暂时跟随系统。',
        futureSchema: '语言设置来自较新版本，已保留原始数据；本版本暂时跟随系统。',
        writeFailed: '语言设置未保存，已恢复之前的选择。请稍后重试。'
      }
    }
  },
  en: {
    navigation: shellResources.en.navigation,
    midi: shellResources.en.midi,
    common: { appTitle: 'Piano Fundamentals Trainer', noData: 'No data' },
    music: { intervals: {
      perfectUnison: 'Perfect unison', augmentedUnison: 'Augmented unison',
      diminishedSecond: 'Diminished second', minorSecond: 'Minor second', majorSecond: 'Major second', augmentedSecond: 'Augmented second',
      diminishedThird: 'Diminished third', minorThird: 'Minor third', majorThird: 'Major third', augmentedThird: 'Augmented third',
      diminishedFourth: 'Diminished fourth', perfectFourth: 'Perfect fourth', augmentedFourth: 'Augmented fourth',
      diminishedFifth: 'Diminished fifth', perfectFifth: 'Perfect fifth', augmentedFifth: 'Augmented fifth',
      diminishedSixth: 'Diminished sixth', minorSixth: 'Minor sixth', majorSixth: 'Major sixth', augmentedSixth: 'Augmented sixth',
      diminishedSeventh: 'Diminished seventh', minorSeventh: 'Minor seventh', majorSeventh: 'Major seventh', augmentedSeventh: 'Augmented seventh',
      diminishedOctave: 'Diminished octave', perfectOctave: 'Perfect octave'
    } },
    settings: {
      ...shellResources.en.settings,
      title: 'Settings',
      language: 'Language',
      languageDescription: 'Applies immediately, without restarting. Other pages will be translated gradually.',
      system: 'Follow system',
      chinese: 'Simplified Chinese',
      english: 'English',
      currentLanguage: 'Current interface language: {{language}}',
      loading: 'Loading language preference…',
      saving: 'Saving language preference…',
      errors: {
        readFailed: 'Could not read the language preference. Following the system for now.',
        invalidDocument: 'The language preference could not be recognized. Following the system for now.',
        futureSchema: 'The language preference belongs to a newer version. Its data is preserved; following the system for now.',
        writeFailed: 'The language preference was not saved. Your previous choice has been restored. Please try again.'
      }
    }
  }
} as const
