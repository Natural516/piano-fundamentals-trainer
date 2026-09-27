export type BuiltInThemeId = 'light' | 'dark'
export type DevelopmentThemeAlias = 'bocchi-dev'
export type ExternalThemeId = string & { readonly __externalThemeId: unique symbol }
export type ThemeId = BuiltInThemeId | DevelopmentThemeAlias | ExternalThemeId
export type PublicThemeId = BuiltInThemeId
export type ThemeSource = 'built-in' | 'development' | 'external'
export type ColorScheme = 'light' | 'dark'
export type ShadowPreset = 'none' | 'soft' | 'raised' | 'focus'

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
  | '--practice-feedback-success'
  | '--practice-feedback-danger'
  | '--practice-feedback-warning'

export type ColorThemeTokenName = Exclude<ThemeTokenName, '--shadow' | '--shadow-soft'>
export type ThemeTokens = Readonly<Record<ThemeTokenName, string>>

export type VisualRecipeId =
  | 'home-scrapbook-single-hero-v1'
  | 'practice-hero-cards-v1'
  | 'tools-studio-cards-v1'
  | 'history-journal-dashboard-v1'
  | 'settings-hero-cards-v1'
  | 'practice-decorated-focus-v1'
  | 'tool-reference-notebook-v1'

export type ThemeCapabilityName =
  | 'homeVisual'
  | 'practiceVisual'
  | 'toolsVisual'
  | 'historyVisual'
  | 'settingsVisual'
  | 'practiceActiveVisual'
  | 'toolDetailVisual'

export type SafeGeometryParameterName =
  | 'heroScale'
  | 'heroOffsetXPercent'
  | 'heroOffsetYPercent'
  | 'heroObjectPositionX'
  | 'heroObjectPositionY'
  | 'backgroundPositionX'
  | 'backgroundPositionY'
  | 'backgroundScale'
  | 'decorationOpacity'
  | 'decorationScale'
  | 'decorationOffsetXPercent'
  | 'decorationOffsetYPercent'
  | 'decorationRotateDeg'
  | 'washOpacity'
  | 'borderWidthPx'
  | 'borderRadiusPx'

export type SafeGeometryParameters = Readonly<Partial<Record<SafeGeometryParameterName, number>>>

export interface StandardHomeVisual { kind: 'standard' }
export interface SingleImageHomeVisual {
  kind: 'single-image-hero'
  recipeId: 'home-scrapbook-single-hero-v1'
  frameClassName: string
  heroClassName: string
  assets: Readonly<{ hero: string; headline: string; recentPractice: string; midi: string; tools: string }>
  parameters: SafeGeometryParameters
  memo: string
}
export type HomeVisual = StandardHomeVisual | SingleImageHomeVisual

export interface StandardPracticeVisual { kind: 'standard' }
export interface HeroCardsPracticeVisual {
  kind: 'hero-cards'
  recipeId: 'practice-hero-cards-v1'
  frameClassName: string
  heroClassName: string
  assets: Readonly<{ hero: string; sight: string; chord: string }>
  parameters: SafeGeometryParameters
}
export type PracticeVisual = StandardPracticeVisual | HeroCardsPracticeVisual

export interface StandardToolsVisual { kind: 'standard' }
export interface HeroCardsToolsVisual {
  kind: 'hero-cards'
  recipeId: 'tools-studio-cards-v1'
  frameClassName: string
  assets: Readonly<{ hero: string; chord: string; interval: string; scale: string }>
  parameters: SafeGeometryParameters
}
export type ToolsVisual = StandardToolsVisual | HeroCardsToolsVisual

export interface StandardHistoryVisual { kind: 'standard' }
export interface DashboardHistoryVisual {
  kind: 'dashboard'
  recipeId: 'history-journal-dashboard-v1'
  frameClassName: string
  assets: Readonly<{ hero: string; trend: string; memo: string; lower: string }>
  parameters: SafeGeometryParameters
}
export type HistoryVisual = StandardHistoryVisual | DashboardHistoryVisual

export interface StandardSettingsVisual { kind: 'standard' }
export interface HeroCardsSettingsVisual {
  kind: 'hero-cards'
  recipeId: 'settings-hero-cards-v1'
  frameClassName: string
  assets: Readonly<{ hero: string; midi: string; theme: string; about: string }>
  parameters: SafeGeometryParameters
}
export type SettingsVisual = StandardSettingsVisual | HeroCardsSettingsVisual

export interface StandardPracticeActiveVisual { kind: 'standard' }
export interface DecoratedFocusPracticeActiveVisual {
  kind: 'decorated-focus'
  recipeId: 'practice-decorated-focus-v1'
  frameClassName: string
  assets: Readonly<{ cornerCharacter: string; decorations: string }>
  parameters: SafeGeometryParameters
  chordArtwork?: Readonly<{ frameClassName: string; cornerCharacter: string; decorations: string; polaroid: string }>
}
export type PracticeActiveVisual = StandardPracticeActiveVisual | DecoratedFocusPracticeActiveVisual

export interface StandardToolDetailVisual { kind: 'standard' }
export interface DecoratedReferenceToolDetailVisual {
  kind: 'decorated-reference'
  recipeId: 'tool-reference-notebook-v1'
  frameClassName: string
  assets: Readonly<{ background: string; decorations: string }>
  artwork: Readonly<{ chordQueryHero: string; sharedCompleteRyo: string }>
  parameters: SafeGeometryParameters
}
export type ToolDetailVisual = StandardToolDetailVisual | DecoratedReferenceToolDetailVisual

export interface RuntimeThemeCapabilities {
  homeVisual: HomeVisual
  practiceVisual: PracticeVisual
  toolsVisual: ToolsVisual
  historyVisual: HistoryVisual
  settingsVisual: SettingsVisual
  practiceActiveVisual: PracticeActiveVisual
  toolDetailVisual: ToolDetailVisual
}

export interface RuntimeThemeDefinition {
  id: ThemeId
  packageThemeId?: ExternalThemeId
  version: string
  displayName: string
  subtitle?: string
  source: ThemeSource
  colorScheme: ColorScheme
  tokens: ThemeTokens
  capabilities: Readonly<RuntimeThemeCapabilities>
}

export interface BuiltInThemeDefinition extends RuntimeThemeDefinition {
  id: BuiltInThemeId
  source: 'built-in'
}

export interface ExternalThemeCapabilityV1 {
  recipeId: VisualRecipeId
  assets: Readonly<Record<string, string>>
  parameters: SafeGeometryParameters
}

export interface ExternalThemeDefinitionV1 {
  schemaVersion: 1
  colorScheme: ColorScheme
  tokens: Readonly<{
    colors: Readonly<Record<ColorThemeTokenName, string>>
    shadows: Readonly<{ shadow: ShadowPreset; shadowSoft: ShadowPreset }>
  }>
  capabilities: Readonly<Record<ThemeCapabilityName, ExternalThemeCapabilityV1>>
}

export interface ThemePointer {
  themeId: string
  version: string
  source: ThemeSource
}

export interface ThemeStore {
  list(): readonly ThemePointer[]
  get(themeId: string): RuntimeThemeDefinition | undefined
  put(theme: RuntimeThemeDefinition): void
  remove(themeId: string): void
}

export type ThemeDefinition = RuntimeThemeDefinition
