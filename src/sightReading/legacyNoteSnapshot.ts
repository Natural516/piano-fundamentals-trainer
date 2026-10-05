/** Existing report/durable V1 bytes. This token is not a translated display label. */
export const LEGACY_SIGHT_EMPTY_NOTE_SENTINEL = '暂无' as const

/** Recognize only the proven legacy sentinel; preserve all real or unknown note text verbatim. */
export function resolveLegacySightNoteSnapshot(value: string | null): string | null {
  return value === LEGACY_SIGHT_EMPTY_NOTE_SENTINEL ? null : value
}
