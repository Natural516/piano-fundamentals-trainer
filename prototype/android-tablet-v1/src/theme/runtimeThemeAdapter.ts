import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import manifestSchema from '../../../../theme-contract/v1/manifest.schema.json'
import themeSchema from '../../../../theme-contract/v1/theme.schema.json'
import { resolveVisualRecipe } from './visualRecipeRegistry'
import type { ThemeAssetResolver } from './themeAssetResolver'
import type {
  ColorThemeTokenName,
  ExternalThemeDefinitionV1,
  ExternalThemeId,
  RuntimeThemeCapabilities,
  RuntimeThemeDefinition,
  SafeGeometryParameters,
  ShadowPreset,
  ThemeCapabilityName,
  ThemeTokens
} from './themeTypes'

export interface ExternalThemeManifestV1 {
  format: 'piano-fundamentals-theme'
  packageFormatVersion: 1
  themeApiVersion: 1
  themeId: string
  name: string
  subtitle: string
  version: string
  minAppVersion: string
  maxAppVersionExclusive: string
  themeType: 'full'
  entry: 'theme.json'
  checksums: 'checksums.json'
  signature: null | { algorithm: 'Ed25519'; keyId: string; file: 'signature.ed25519' }
  preview: { cover: string | null; gallery: string[] }
}

export class ThemeContractError extends Error {
  constructor(readonly code: string, message: string, readonly details: readonly ErrorObject[] = []) {
    super(`${code}: ${message}`)
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateManifestSchema = ajv.compile<ExternalThemeManifestV1>(manifestSchema)
const validateThemeSchema = ajv.compile<ExternalThemeDefinitionV1>(themeSchema)

const SHADOW_PRESETS: Readonly<Record<ShadowPreset, string>> = {
  none: 'none',
  soft: '0 6px 20px rgba(67, 41, 52, 0.08)',
  raised: '0 14px 40px rgba(67, 41, 52, 0.10)',
  focus: '0 0 0 4px rgba(47, 111, 88, 0.18)'
}

export function validateExternalManifest(value: unknown): ExternalThemeManifestV1 {
  if (!validateManifestSchema(value)) throw new ThemeContractError('INVALID_MANIFEST', 'manifest.json 不符合 v1 schema', validateManifestSchema.errors ?? [])
  return value
}

export function validateExternalThemeDefinition(value: unknown): ExternalThemeDefinitionV1 {
  if (!validateThemeSchema(value)) {
    const errors = validateThemeSchema.errors ?? []
    const paths = errors.map((item) => `${item.instancePath}/${'additionalProperty' in item.params ? item.params.additionalProperty : 'missingProperty' in item.params ? item.params.missingProperty : ''}`)
    const code = paths.some((item) => item.includes('/recipeId')) ? 'UNSUPPORTED_RECIPE'
      : paths.some((item) => item.includes('/tokens/')) ? 'INVALID_TOKEN'
        : paths.some((item) => item.includes('/assets/')) ? 'UNSAFE_ASSET_PATH'
          : paths.some((item) => item.includes('/parameters/')) ? 'INVALID_PARAMETER'
            : paths.some((item) => item.includes('/capabilities/')) ? 'MISSING_CAPABILITY'
              : 'INVALID_THEME_SCHEMA'
    throw new ThemeContractError(code, 'theme.json 不符合 v1 schema', errors)
  }
  return value
}

function resolveAssets(
  themeId: string,
  version: string,
  capability: ThemeCapabilityName,
  definition: ExternalThemeDefinitionV1,
  resolver: ThemeAssetResolver
): Record<string, string> {
  const source = definition.capabilities[capability]
  if (!source) throw new ThemeContractError('MISSING_CAPABILITY', capability)
  const recipe = resolveVisualRecipe(source.recipeId)
  if (recipe.capability !== capability) throw new ThemeContractError('UNSUPPORTED_RECIPE', `${source.recipeId} 不能用于 ${capability}`)
  const suppliedSlots = Object.keys(source.assets).sort()
  const allowedSlots = [...recipe.assetSlots, ...(recipe.optionalAssetSlots ?? [])]
  if (recipe.assetSlots.some((slot) => !suppliedSlots.includes(slot)) || suppliedSlots.some((slot) => !allowedSlots.includes(slot))) {
    throw new ThemeContractError('INVALID_ASSET_SLOT', `${capability} asset slots 不完整或包含未知项`)
  }
  return Object.fromEntries(Object.entries(source.assets).map(([slot, assetPath]) => [slot, resolver.resolveAsset(themeId, version, assetPath)]))
}

function normalizeParameters(capability: ThemeCapabilityName, definition: ExternalThemeDefinitionV1): SafeGeometryParameters {
  const source = definition.capabilities[capability]
  if (!source) throw new ThemeContractError('MISSING_CAPABILITY', capability)
  const recipe = resolveVisualRecipe(source.recipeId)
  const normalized: Record<string, number> = {}
  for (const [name, value] of Object.entries(source.parameters)) {
    const rule = recipe.parameters[name as keyof typeof recipe.parameters]
    if (!rule) throw new ThemeContractError('INVALID_PARAMETER', `${source.recipeId} 不支持参数 ${name}`)
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) throw new ThemeContractError('INVALID_PARAMETER', `${name} 超出 ${rule.min}..${rule.max}`)
    normalized[name] = Math.min(rule.max, Math.max(rule.min, value))
  }
  return normalized
}

function buildTokens(definition: ExternalThemeDefinitionV1): ThemeTokens {
  const colors = definition.tokens.colors as Readonly<Record<ColorThemeTokenName, string>>
  return {
    ...colors,
    '--shadow': SHADOW_PRESETS[definition.tokens.shadows.shadow],
    '--shadow-soft': SHADOW_PRESETS[definition.tokens.shadows.shadowSoft]
  }
}

export function adaptExternalTheme(
  manifestInput: unknown,
  themeInput: unknown,
  resolver: ThemeAssetResolver,
  source: 'development' | 'external' = 'external'
): RuntimeThemeDefinition {
  const manifest = validateExternalManifest(manifestInput)
  const definition = validateExternalThemeDefinition(themeInput)
  const assetSets = Object.fromEntries((Object.keys(definition.capabilities) as ThemeCapabilityName[]).map((capability) => [
    capability,
    resolveAssets(manifest.themeId, manifest.version, capability, definition, resolver)
  ])) as Partial<Record<ThemeCapabilityName, Record<string, string>>>
  const parameters = Object.fromEntries((Object.keys(definition.capabilities) as ThemeCapabilityName[]).map((capability) => [
    capability,
    normalizeParameters(capability, definition)
  ])) as Partial<Record<ThemeCapabilityName, SafeGeometryParameters>>

  const capabilities: RuntimeThemeCapabilities = {
    intervalPracticeVisual: assetSets.intervalPracticeVisual
      ? { kind: 'blue-notebook', recipeId: 'interval-blue-notebook-v1', assets: assetSets.intervalPracticeVisual }
      : { kind: 'standard' },
    homeVisual: {
      kind: 'single-image-hero', recipeId: 'home-scrapbook-single-hero-v1', frameClassName: resolveVisualRecipe('home-scrapbook-single-hero-v1').frameClassName,
      heroClassName: 'bocchi-home-hero', assets: assetSets.homeVisual as { hero: string; headline: string; recentPractice: string; midi: string; tools: string }, parameters: parameters.homeVisual ?? {},
      memo: '一步一步，靠近喜欢的音乐。'
    },
    practiceVisual: {
      kind: 'hero-cards', recipeId: 'practice-hero-cards-v1', frameClassName: resolveVisualRecipe('practice-hero-cards-v1').frameClassName, heroClassName: 'bocchi-practice-hero',
      assets: assetSets.practiceVisual as { hero: string; sight: string; chord: string }, parameters: parameters.practiceVisual ?? {}
    },
    toolsVisual: {
      kind: 'hero-cards', recipeId: 'tools-studio-cards-v1', frameClassName: resolveVisualRecipe('tools-studio-cards-v1').frameClassName,
      assets: assetSets.toolsVisual as { hero: string; chord: string; interval: string; scale: string }, parameters: parameters.toolsVisual ?? {}
    },
    historyVisual: {
      kind: 'dashboard', recipeId: 'history-journal-dashboard-v1', frameClassName: resolveVisualRecipe('history-journal-dashboard-v1').frameClassName,
      assets: assetSets.historyVisual as { hero: string; trend: string; memo: string; lower: string }, parameters: parameters.historyVisual ?? {}
    },
    settingsVisual: {
      kind: 'hero-cards', recipeId: 'settings-hero-cards-v1', frameClassName: resolveVisualRecipe('settings-hero-cards-v1').frameClassName,
      assets: assetSets.settingsVisual as { hero: string; midi: string; theme: string; about: string }, parameters: parameters.settingsVisual ?? {}
    },
    practiceActiveVisual: {
      kind: 'decorated-focus', recipeId: 'practice-decorated-focus-v1', frameClassName: resolveVisualRecipe('practice-decorated-focus-v1').frameClassName,
      assets: { cornerCharacter: assetSets.practiceActiveVisual!.cornerCharacter, decorations: assetSets.practiceActiveVisual!.decorations }, parameters: parameters.practiceActiveVisual ?? {},
      chordArtwork: { frameClassName: 'bocchi-chord-active', cornerCharacter: assetSets.practiceActiveVisual!.chordCornerCharacter, decorations: assetSets.practiceActiveVisual!.chordDecorations, polaroid: assetSets.practiceActiveVisual!.chordPolaroid }
    },
    toolDetailVisual: {
      kind: 'decorated-reference', recipeId: 'tool-reference-notebook-v1', frameClassName: resolveVisualRecipe('tool-reference-notebook-v1').frameClassName,
      assets: { background: assetSets.toolDetailVisual!.background, decorations: assetSets.toolDetailVisual!.decorations },
      artwork: { chordQueryHero: assetSets.toolDetailVisual!.chordQueryHero, sharedCompleteRyo: assetSets.toolDetailVisual!.sharedCompleteRyo }, parameters: parameters.toolDetailVisual ?? {}
    }
  }

  return {
    id: manifest.themeId as ExternalThemeId,
    packageThemeId: manifest.themeId as ExternalThemeId,
    version: manifest.version,
    displayName: manifest.name,
    subtitle: manifest.subtitle,
    source,
    colorScheme: definition.colorScheme,
    tokens: buildTokens(definition),
    capabilities
  }
}
