import type { RuntimeThemeDefinition, ThemePointer, ThemeStore } from './themeTypes'

export class InMemoryThemeStore implements ThemeStore {
  private readonly themes = new Map<string, RuntimeThemeDefinition>()

  list(): readonly ThemePointer[] {
    return [...this.themes.values()].map((theme) => ({ themeId: String(theme.id), version: theme.version, source: theme.source }))
  }

  get(themeId: string): RuntimeThemeDefinition | undefined { return this.themes.get(themeId) }
  put(theme: RuntimeThemeDefinition): void { this.themes.set(String(theme.id), theme) }
  remove(themeId: string): void { this.themes.delete(themeId) }
}
