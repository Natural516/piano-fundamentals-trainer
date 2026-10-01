import type {
  SafeGeometryParameterName,
  ThemeCapabilityName,
  VisualRecipeId
} from './themeTypes'

export interface ParameterRule {
  min: number
  max: number
}

export interface VisualRecipeDefinition {
  id: VisualRecipeId
  capability: ThemeCapabilityName
  frameClassName: string
  variant: string
  assetSlots: readonly string[]
  optionalAssetSlots?: readonly string[]
  parameters: Readonly<Partial<Record<SafeGeometryParameterName, ParameterRule>>>
  variants?: readonly string[]
}

const commonBorderRules = {
  borderWidthPx: { min: 0, max: 3 },
  borderRadiusPx: { min: 0, max: 32 }
} as const

export const VISUAL_RECIPE_REGISTRY: Readonly<Record<VisualRecipeId, VisualRecipeDefinition>> = {
  'interval-blue-notebook-v1': {
    id: 'interval-blue-notebook-v1', capability: 'intervalPracticeVisual', frameClassName: 'interval-blue-notebook', variant: 'blue-notebook',
    assetSlots: [], optionalAssetSlots: ['hubCardCollage', 'activeBorder'], parameters: {}
  },
  'home-scrapbook-single-hero-v1': {
    id: 'home-scrapbook-single-hero-v1', capability: 'homeVisual', frameClassName: 'bocchi-home-preview', variant: 'single-image-hero',
    assetSlots: ['hero', 'headline', 'recentPractice', 'midi', 'tools'],
    parameters: {
      heroScale: { min: 0.6, max: 1.4 }, heroOffsetXPercent: { min: -20, max: 20 }, heroOffsetYPercent: { min: -20, max: 20 },
      heroObjectPositionX: { min: 0, max: 100 }, heroObjectPositionY: { min: 0, max: 100 }, decorationOpacity: { min: 0, max: 0.65 }, ...commonBorderRules
    }
  },
  'practice-hero-cards-v1': {
    id: 'practice-hero-cards-v1', capability: 'practiceVisual', frameClassName: 'bocchi-practice-preview', variant: 'hero-cards',
    assetSlots: ['hero', 'sight', 'chord'],
    parameters: { heroScale: { min: 0.6, max: 1.4 }, heroObjectPositionX: { min: 0, max: 100 }, heroObjectPositionY: { min: 0, max: 100 }, decorationOpacity: { min: 0, max: 0.65 }, ...commonBorderRules }
  },
  'tools-studio-cards-v1': {
    id: 'tools-studio-cards-v1', capability: 'toolsVisual', frameClassName: 'bocchi-tools-preview', variant: 'hero-cards',
    assetSlots: ['hero', 'chord', 'interval', 'scale'],
    parameters: { heroScale: { min: 0.6, max: 1.4 }, heroOffsetXPercent: { min: -20, max: 20 }, heroOffsetYPercent: { min: -20, max: 20 }, decorationOpacity: { min: 0, max: 0.65 }, ...commonBorderRules }
  },
  'history-journal-dashboard-v1': {
    id: 'history-journal-dashboard-v1', capability: 'historyVisual', frameClassName: 'bocchi-history-preview', variant: 'dashboard',
    assetSlots: ['hero', 'trend', 'memo', 'lower'],
    parameters: { heroScale: { min: 0.6, max: 1.4 }, heroObjectPositionX: { min: 0, max: 100 }, heroObjectPositionY: { min: 0, max: 100 }, decorationOpacity: { min: 0, max: 0.65 }, ...commonBorderRules }
  },
  'settings-hero-cards-v1': {
    id: 'settings-hero-cards-v1', capability: 'settingsVisual', frameClassName: 'bocchi-settings-preview', variant: 'hero-cards',
    assetSlots: ['hero', 'midi', 'theme', 'about'],
    parameters: { heroScale: { min: 0.6, max: 1.4 }, heroObjectPositionX: { min: 0, max: 100 }, heroObjectPositionY: { min: 0, max: 100 }, decorationOpacity: { min: 0, max: 0.65 }, ...commonBorderRules }
  },
  'practice-decorated-focus-v1': {
    id: 'practice-decorated-focus-v1', capability: 'practiceActiveVisual', frameClassName: 'bocchi-sight-active', variant: 'decorated-focus',
    variants: ['sight', 'chord'],
    assetSlots: ['cornerCharacter', 'decorations', 'chordCornerCharacter', 'chordDecorations', 'chordPolaroid'],
    parameters: { decorationOpacity: { min: 0, max: 0.65 }, decorationScale: { min: 0.5, max: 1.25 }, decorationOffsetXPercent: { min: -15, max: 15 }, decorationOffsetYPercent: { min: -15, max: 15 }, decorationRotateDeg: { min: -12, max: 12 }, ...commonBorderRules }
  },
  'tool-reference-notebook-v1': {
    id: 'tool-reference-notebook-v1', capability: 'toolDetailVisual', frameClassName: 'bocchi-tool-detail-preview', variant: 'decorated-reference',
    assetSlots: ['background', 'decorations', 'chordQueryHero', 'sharedCompleteRyo'],
    parameters: { backgroundPositionX: { min: 0, max: 100 }, backgroundPositionY: { min: 0, max: 100 }, backgroundScale: { min: 1, max: 1.25 }, decorationOpacity: { min: 0, max: 0.65 }, washOpacity: { min: 0.15, max: 0.85 }, ...commonBorderRules }
  }
}

export function resolveVisualRecipe(recipeId: string): VisualRecipeDefinition {
  const recipe = VISUAL_RECIPE_REGISTRY[recipeId as VisualRecipeId]
  if (!recipe) throw new Error(`UNSUPPORTED_RECIPE: ${recipeId}`)
  return recipe
}
