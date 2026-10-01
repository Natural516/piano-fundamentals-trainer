import type {
  BuiltInThemeDefinition,
  BuiltInThemeId,
  RuntimeThemeDefinition,
  StandardHistoryVisual,
  StandardHomeVisual,
  StandardPracticeActiveVisual,
  StandardPracticeVisual,
  StandardSettingsVisual,
  StandardToolDetailVisual,
  StandardToolsVisual,
  ThemeDefinition,
  ThemeId,
  ThemeTokens,
  VisualRecipeId
} from './themeTypes'

export type { BuiltInThemeDefinition, BuiltInThemeId, ExternalThemeDefinitionV1, ExternalThemeId, RuntimeThemeDefinition, ThemeDefinition, ThemeId, ThemePointer, ThemeStore } from './themeTypes'

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
  '--warning': '#c17b2b',
  '--practice-feedback-success': '#2c7b58',
  '--practice-feedback-danger': '#b34545',
  '--practice-feedback-warning': '#c17b2b'
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
  '--warning': '#e3ae67',
  '--practice-feedback-success': '#2c7b58',
  '--practice-feedback-danger': '#b34545',
  '--practice-feedback-warning': '#c17b2b'
}

const standardHomeVisual: StandardHomeVisual = { kind: 'standard' }
const standardPracticeVisual: StandardPracticeVisual = { kind: 'standard' }
const standardToolsVisual: StandardToolsVisual = { kind: 'standard' }
const standardHistoryVisual: StandardHistoryVisual = { kind: 'standard' }
const standardSettingsVisual: StandardSettingsVisual = { kind: 'standard' }
const standardPracticeActiveVisual: StandardPracticeActiveVisual = { kind: 'standard' }
const standardToolDetailVisual: StandardToolDetailVisual = { kind: 'standard' }

const builtInThemes: Readonly<Record<BuiltInThemeId, BuiltInThemeDefinition>> = {
  light: {
    id: 'light',
    version: '1.0.0',
    displayName: '浅色',
    source: 'built-in',
    colorScheme: 'light',
    tokens: lightTokens,
    capabilities: { homeVisual: standardHomeVisual, practiceVisual: standardPracticeVisual, toolsVisual: standardToolsVisual, historyVisual: standardHistoryVisual, settingsVisual: standardSettingsVisual, practiceActiveVisual: standardPracticeActiveVisual, toolDetailVisual: standardToolDetailVisual }
  },
  dark: {
    id: 'dark',
    version: '1.0.0',
    displayName: '深色',
    source: 'built-in',
    colorScheme: 'dark',
    tokens: darkTokens,
    capabilities: { homeVisual: standardHomeVisual, practiceVisual: standardPracticeVisual, toolsVisual: standardToolsVisual, historyVisual: standardHistoryVisual, settingsVisual: standardSettingsVisual, practiceActiveVisual: standardPracticeActiveVisual, toolDetailVisual: standardToolDetailVisual }
  }
}

export const BuiltInThemeRegistry = builtInThemes
export const UnifiedRuntimeThemeRegistry: Readonly<Record<string, RuntimeThemeDefinition>> = BuiltInThemeRegistry
export const THEME_REGISTRY = UnifiedRuntimeThemeRegistry

export function resolveTheme(themeId: ThemeId): ThemeDefinition {
  return UnifiedRuntimeThemeRegistry[String(themeId)] ?? BuiltInThemeRegistry.light
}

export function resolveInitialThemeId(search: string, allowDevelopmentTheme: boolean): ThemeId {
  const requested = new URLSearchParams(search).get('theme')
  if (requested === 'light' || requested === 'dark') return requested
  // `bocchi-dev` is retained only as a migration alias. External themes are
  // resolved by ThemeRuntimeManager after their installed source is verified.
  if (allowDevelopmentTheme && (requested === 'natural516.bocchi' || requested === 'bocchi-dev')) return 'light'
  return 'light'
}

const RECIPE_DATASET_KEYS: Readonly<Record<keyof RuntimeThemeDefinition['capabilities'], string>> = {
  homeVisual: 'themeRecipeHome', practiceVisual: 'themeRecipePractice', toolsVisual: 'themeRecipeTools', historyVisual: 'themeRecipeHistory',
  settingsVisual: 'themeRecipeSettings', practiceActiveVisual: 'themeRecipePracticeActive', toolDetailVisual: 'themeRecipeToolDetail', intervalPracticeVisual: 'themeRecipeIntervalPractice'
}

function recipeIdOf(visual: RuntimeThemeDefinition['capabilities'][keyof RuntimeThemeDefinition['capabilities']]): VisualRecipeId | null {
  return visual && 'recipeId' in visual ? visual.recipeId : null
}

export function applyThemeDefinition(root: HTMLElement, theme: ThemeDefinition): void {
  root.dataset.theme = String(theme.id)
  root.dataset.themeSource = theme.source
  root.style.colorScheme = theme.colorScheme
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value)
  for (let index = root.style.length - 1; index >= 0; index -= 1) {
    const property = root.style.item(index)
    if (property.startsWith('--theme-recipe-')) root.style.removeProperty(property)
  }
  for (const [capability, datasetKey] of Object.entries(RECIPE_DATASET_KEYS) as [keyof RuntimeThemeDefinition['capabilities'], string][]) {
    const visual = theme.capabilities[capability]
    const recipeId = recipeIdOf(visual)
    if (recipeId) root.dataset[datasetKey] = recipeId
    else delete root.dataset[datasetKey]
    if (visual && 'parameters' in visual) {
      for (const [name, value] of Object.entries(visual.parameters)) {
        const kebabName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        root.style.setProperty(`--theme-recipe-${capability}-${kebabName}`, String(value))
      }
    }
  }
}
