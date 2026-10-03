export const localizationResources = {
  'zh-CN': {
    common: { appTitle: '钢琴基本功训练器' },
    settings: {
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
    common: { appTitle: 'Piano Fundamentals Trainer' },
    settings: {
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
