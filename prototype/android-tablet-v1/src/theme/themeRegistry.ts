import bocchiHomeHandwrittenTitle from '../assets/themes/bocchi/home/home-handwritten-title.png'
import bocchiHomeHero from '../assets/themes/bocchi/home/home-hero.png'
import bocchiHomeMidiAmp from '../assets/themes/bocchi/home/home-midi-amp.png'
import bocchiHomeRecentCharacter from '../assets/themes/bocchi/home/home-recent-character.png'
import bocchiHomeTheoryBird from '../assets/themes/bocchi/home/home-theory-bird.png'
import bocchiPracticeHero from '../assets/themes/bocchi/practice/ChatGPT Image 2026年9月23日 20_53_32.png'
import bocchiPracticeSightDecoration from '../assets/themes/bocchi/practice/ChatGPT Image 2026年9月23日 20_56_06.png'
import bocchiPracticeChordDecoration from '../assets/themes/bocchi/practice/ChatGPT Image 2026年9月23日 20_57_50.png'
import bocchiToolsHero from '../assets/themes/bocchi/tools/ChatGPT Image 2026年9月24日 00_05_48.png'
import bocchiToolsChordDecoration from '../assets/themes/bocchi/tools/ChatGPT Image 2026年9月24日 00_25_10.png'
import bocchiToolsIntervalDecoration from '../assets/themes/bocchi/tools/ChatGPT Image 2026年9月24日 00_27_04.png'
import bocchiToolsScaleDecoration from '../assets/themes/bocchi/tools/ChatGPT Image 2026年9月24日 00_30_34.png'
import bocchiHistoryHero from '../assets/themes/bocchi/history/ChatGPT Image 2026年9月24日 02_27_13.png'
import bocchiHistoryTrendDecoration from '../assets/themes/bocchi/history/ChatGPT Image 2026年9月24日 02_32_25.png'
import bocchiHistoryMemoDecoration from '../assets/themes/bocchi/history/ChatGPT Image 2026年9月24日 02_30_40.png'
import bocchiHistoryLowerDecoration from '../assets/themes/bocchi/history/ChatGPT Image 2026年9月24日 02_34_11.png'
import bocchiSettingsHero from '../assets/themes/bocchi/settings/ChatGPT Image 2026年9月24日 12_01_39.png'
import bocchiSettingsMidiDecoration from '../assets/themes/bocchi/settings/ChatGPT Image 2026年9月24日 12_38_35.png'
import bocchiSettingsThemeDecoration from '../assets/themes/bocchi/settings/ChatGPT Image 2026年9月24日 12_46_01.png'
import bocchiSettingsAboutDecoration from '../assets/themes/bocchi/settings/ChatGPT Image 2026年9月24日 12_47_56.png'

export type ThemeId = 'light' | 'dark' | 'bocchi-dev'
export type PublicThemeId = 'light' | 'dark'
export type ThemeSource = 'built-in' | 'development' | 'external'

export type ThemeTokenName =
  | '--app-bg'
  | '--surface'
  | '--surface-soft'
  | '--surface-elevated'
  | '--surface-tint'
  | '--text-primary'
  | '--text-secondary'
  | '--text-muted'
  | '--accent'
  | '--accent-strong'
  | '--accent-soft'
  | '--accent-ink'
  | '--border'
  | '--divider'
  | '--line-strong'
  | '--shadow'
  | '--shadow-soft'
  | '--nav-bg'
  | '--nav-active-bg'
  | '--nav-active-text'
  | '--button-primary-bg'
  | '--button-primary-text'
  | '--paper'
  | '--blue'
  | '--blue-soft'
  | '--amber'
  | '--amber-soft'
  | '--success'
  | '--success-soft'
  | '--danger'
  | '--danger-soft'
  | '--warning'

export type ThemeTokens = Readonly<Record<ThemeTokenName, string>>

export interface StandardHomeVisual {
  kind: 'standard'
}

export interface SingleImageHomeVisual {
  kind: 'single-image-hero'
  frameClassName: string
  heroClassName: string
  assets: Readonly<{
    hero: string
    headline: string
    recentPractice: string
    midi: string
    tools: string
  }>
  memo: string
}

export type HomeVisual = StandardHomeVisual | SingleImageHomeVisual

export interface StandardPracticeVisual {
  kind: 'standard'
}

export interface HeroCardsPracticeVisual {
  kind: 'hero-cards'
  frameClassName: string
  heroClassName: string
  assets: Readonly<{
    hero: string
    sight: string
    chord: string
  }>
}

export type PracticeVisual = StandardPracticeVisual | HeroCardsPracticeVisual

export interface StandardToolsVisual {
  kind: 'standard'
}

export interface HeroCardsToolsVisual {
  kind: 'hero-cards'
  frameClassName: string
  assets: Readonly<{
    hero: string
    chord: string
    interval: string
    scale: string
  }>
}

export type ToolsVisual = StandardToolsVisual | HeroCardsToolsVisual

export interface StandardHistoryVisual {
  kind: 'standard'
}

export interface DashboardHistoryVisual {
  kind: 'dashboard'
  frameClassName: string
  assets: Readonly<{
    hero: string
    trend: string
    memo: string
    lower: string
  }>
}

export type HistoryVisual = StandardHistoryVisual | DashboardHistoryVisual

export interface StandardSettingsVisual {
  kind: 'standard'
}

export interface HeroCardsSettingsVisual {
  kind: 'hero-cards'
  frameClassName: string
  assets: Readonly<{
    hero: string
    midi: string
    theme: string
    about: string
  }>
}

export type SettingsVisual = StandardSettingsVisual | HeroCardsSettingsVisual

export interface ThemeDefinition {
  id: ThemeId
  displayName: string
  source: ThemeSource
  colorScheme: PublicThemeId
  tokens: ThemeTokens
  capabilities: Readonly<{
    homeVisual: HomeVisual
    practiceVisual: PracticeVisual
    toolsVisual: ToolsVisual
    historyVisual: HistoryVisual
    settingsVisual: SettingsVisual
  }>
}

const lightTokens: ThemeTokens = {
  '--app-bg': '#f2f0e9',
  '--surface': '#fcfbf7',
  '--surface-soft': '#e9eee9',
  '--surface-elevated': '#ffffff',
  '--surface-tint': '#e5eee8',
  '--text-primary': '#17231e',
  '--text-secondary': '#52605a',
  '--text-muted': '#7a8580',
  '--accent': '#2f6f58',
  '--accent-strong': '#245744',
  '--accent-soft': '#dcebe3',
  '--accent-ink': '#174734',
  '--border': '#dbe0db',
  '--divider': '#dbe0db',
  '--line-strong': '#c8d0ca',
  '--shadow': '0 14px 40px rgba(37, 48, 42, 0.08)',
  '--shadow-soft': '0 6px 20px rgba(37, 48, 42, 0.06)',
  '--nav-bg': '#fcfbf7',
  '--nav-active-bg': '#dcebe3',
  '--nav-active-text': '#174734',
  '--button-primary-bg': '#2f6f58',
  '--button-primary-text': '#ffffff',
  '--paper': '#ffffff',
  '--blue': '#3d6f8d',
  '--blue-soft': '#e1edf3',
  '--amber': '#a56a24',
  '--amber-soft': '#f4e8d7',
  '--success': '#2c7b58',
  '--success-soft': '#e2f1e8',
  '--danger': '#b34545',
  '--danger-soft': '#f6e3e1',
  '--warning': '#c17b2b'
}

const darkTokens: ThemeTokens = {
  '--app-bg': '#111713',
  '--surface': '#18201b',
  '--surface-soft': '#253029',
  '--surface-elevated': '#1d2721',
  '--surface-tint': '#20372c',
  '--text-primary': '#edf3ee',
  '--text-secondary': '#bac6bd',
  '--text-muted': '#86948a',
  '--accent': '#7cc2a1',
  '--accent-strong': '#98d5b8',
  '--accent-soft': '#254637',
  '--accent-ink': '#b9ead1',
  '--border': '#303c34',
  '--divider': '#303c34',
  '--line-strong': '#445248',
  '--shadow': '0 16px 44px rgba(0, 0, 0, 0.26)',
  '--shadow-soft': '0 6px 20px rgba(0, 0, 0, 0.2)',
  '--nav-bg': '#18201b',
  '--nav-active-bg': '#254637',
  '--nav-active-text': '#b9ead1',
  '--button-primary-bg': '#7cc2a1',
  '--button-primary-text': '#10231a',
  '--paper': '#ffffff',
  '--blue': '#8ebbd3',
  '--blue-soft': '#233c49',
  '--amber': '#e1ad69',
  '--amber-soft': '#45351f',
  '--success': '#6fc69a',
  '--success-soft': '#214132',
  '--danger': '#ec8b86',
  '--danger-soft': '#4a2929',
  '--warning': '#e3ae67'
}

const bocchiTokens: ThemeTokens = {
  '--app-bg': '#fff9f2',
  '--surface': '#fffdf9',
  '--surface-soft': '#fff2f6',
  '--surface-elevated': '#ffffff',
  '--surface-tint': '#fff4e9',
  '--text-primary': '#24242d',
  '--text-secondary': '#586776',
  '--text-muted': '#7a8795',
  '--accent': '#f33b81',
  '--accent-strong': '#dc286c',
  '--accent-soft': '#ffe2ed',
  '--accent-ink': '#d72267',
  '--border': '#ebdfd8',
  '--divider': '#ebdfd8',
  '--line-strong': '#ddcfc8',
  '--shadow': '0 14px 40px rgba(67, 41, 52, 0.10)',
  '--shadow-soft': '0 6px 20px rgba(67, 41, 52, 0.08)',
  '--nav-bg': '#ffffff',
  '--nav-active-bg': '#ffe2ed',
  '--nav-active-text': '#d72267',
  '--button-primary-bg': '#f33b81',
  '--button-primary-text': '#ffffff',
  '--paper': '#ffffff',
  '--blue': '#278bd7',
  '--blue-soft': '#dff2ff',
  '--amber': '#b67b08',
  '--amber-soft': '#fff0be',
  '--success': '#2c7b58',
  '--success-soft': '#e2f1e8',
  '--danger': '#b34545',
  '--danger-soft': '#f6e3e1',
  '--warning': '#c17b2b'
}

const standardHomeVisual: StandardHomeVisual = { kind: 'standard' }
const standardPracticeVisual: StandardPracticeVisual = { kind: 'standard' }
const standardToolsVisual: StandardToolsVisual = { kind: 'standard' }
const standardHistoryVisual: StandardHistoryVisual = { kind: 'standard' }
const standardSettingsVisual: StandardSettingsVisual = { kind: 'standard' }

export const THEME_REGISTRY: Readonly<Record<ThemeId, ThemeDefinition>> = {
  light: {
    id: 'light',
    displayName: '浅色',
    source: 'built-in',
    colorScheme: 'light',
    tokens: lightTokens,
    capabilities: { homeVisual: standardHomeVisual, practiceVisual: standardPracticeVisual, toolsVisual: standardToolsVisual, historyVisual: standardHistoryVisual, settingsVisual: standardSettingsVisual }
  },
  dark: {
    id: 'dark',
    displayName: '深色',
    source: 'built-in',
    colorScheme: 'dark',
    tokens: darkTokens,
    capabilities: { homeVisual: standardHomeVisual, practiceVisual: standardPracticeVisual, toolsVisual: standardToolsVisual, historyVisual: standardHistoryVisual, settingsVisual: standardSettingsVisual }
  },
  'bocchi-dev': {
    id: 'bocchi-dev',
    displayName: '孤独摇滚',
    source: 'development',
    colorScheme: 'light',
    tokens: bocchiTokens,
    capabilities: {
      homeVisual: {
        kind: 'single-image-hero',
        frameClassName: 'bocchi-home-preview',
        heroClassName: 'bocchi-home-hero',
        assets: {
          hero: bocchiHomeHero,
          headline: bocchiHomeHandwrittenTitle,
          recentPractice: bocchiHomeRecentCharacter,
          midi: bocchiHomeMidiAmp,
          tools: bocchiHomeTheoryBird
        },
        memo: '一步一步，靠近喜欢的音乐。'
      },
      practiceVisual: {
        kind: 'hero-cards',
        frameClassName: 'bocchi-practice-preview',
        heroClassName: 'bocchi-practice-hero',
        assets: {
          hero: bocchiPracticeHero,
          sight: bocchiPracticeSightDecoration,
          chord: bocchiPracticeChordDecoration
        }
      },
      toolsVisual: {
        kind: 'hero-cards',
        frameClassName: 'bocchi-tools-preview',
        assets: {
          hero: bocchiToolsHero,
          chord: bocchiToolsChordDecoration,
          interval: bocchiToolsIntervalDecoration,
          scale: bocchiToolsScaleDecoration
        }
      },
      historyVisual: {
        kind: 'dashboard',
        frameClassName: 'bocchi-history-preview',
        assets: {
          hero: bocchiHistoryHero,
          trend: bocchiHistoryTrendDecoration,
          memo: bocchiHistoryMemoDecoration,
          lower: bocchiHistoryLowerDecoration
        }
      },
      settingsVisual: {
        kind: 'hero-cards',
        frameClassName: 'bocchi-settings-preview',
        assets: {
          hero: bocchiSettingsHero,
          midi: bocchiSettingsMidiDecoration,
          theme: bocchiSettingsThemeDecoration,
          about: bocchiSettingsAboutDecoration
        }
      }
    }
  }
}

export function resolveTheme(themeId: ThemeId): ThemeDefinition {
  return THEME_REGISTRY[themeId]
}

export function resolveInitialThemeId(search: string, allowDevelopmentTheme: boolean): ThemeId {
  if (allowDevelopmentTheme) {
    const requested = new URLSearchParams(search).get('theme')
    if (requested === 'light' || requested === 'dark' || requested === 'bocchi-dev') return requested
    return 'bocchi-dev'
  }
  return 'light'
}

export function applyThemeDefinition(root: HTMLElement, theme: ThemeDefinition): void {
  root.dataset.theme = theme.id
  root.style.colorScheme = theme.colorScheme
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value)
}
