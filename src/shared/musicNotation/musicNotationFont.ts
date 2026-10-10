import bravuraFontUrl from '@vexflow-fonts/bravura/bravura.woff2?url'
import { Font, VexFlow } from 'vexflow/bravura'

let notationFontPromise: Promise<void> | null = null

export function ensureMusicNotationFont(): Promise<void> {
  if (notationFontPromise) return notationFontPromise

  notationFontPromise = Font.load('Bravura', bravuraFontUrl, { display: 'block' })
    .then(async () => {
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready
      }
      VexFlow.setFonts('Bravura', 'Academico')
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`本地 Bravura 音乐字体加载失败：${detail}`)
    })

  return notationFontPromise
}
