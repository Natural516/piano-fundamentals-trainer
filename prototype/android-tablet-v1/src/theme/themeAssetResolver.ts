export interface ThemeAssetResolver {
  resolveAsset(themeId: string, version: string, relativeAssetPath: string): string
}

export class MappedThemeAssetResolver implements ThemeAssetResolver {
  constructor(private readonly assets: Readonly<Record<string, string>>) {}

  resolveAsset(_themeId: string, _version: string, relativeAssetPath: string): string {
    const resolved = this.assets[relativeAssetPath]
    if (!resolved) throw new Error(`MISSING_ASSET: ${relativeAssetPath}`)
    return resolved
  }
}

export class ViteBuiltInAssetResolver extends MappedThemeAssetResolver {}

export class DevelopmentThemeAssetResolver extends MappedThemeAssetResolver {}
