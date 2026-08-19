import type { ScoreDocument } from './musicXmlTypes'
import { extractMxlContainerAsync, type InflateFn } from './zipReader'
import { loadTrainingSafeMusicXmlDocument, type MusicXmlCapabilityResult } from './musicXmlProfile'

export interface MusicXmlPayload {
  fileName: string
  xmlText: string
  document: ScoreDocument
  validation: MusicXmlCapabilityResult
}

export interface MxlExtractor {
  extractMxl: (bytes: Uint8Array) => Promise<MusicXmlPayload>
}

export function createMxlExtractor(inflateRaw: InflateFn): MxlExtractor {
  return {
    async extractMxl(bytes) {
      const container = await extractMxlContainerAsync(bytes, { inflate: inflateRaw })
      if (!container) throw new Error('MXL 中未找到 MusicXML 主谱文件')
      const loaded = loadTrainingSafeMusicXmlDocument(container.xmlText)
      return {
        ...container,
        document: loaded.document,
        validation: loaded.validation
      }
    }
  }
}

function getProductionInflateRaw(): InflateFn {
  return async (bytes) => {
    const adapter = window.pianoApp?.inflateRaw
    if (!adapter) {
      throw new Error('MXL 解压服务不可用，请在桌面应用中重试')
    }
    return new Uint8Array(await adapter(bytes))
  }
}

export const productionMxlExtractor: MxlExtractor = createMxlExtractor(getProductionInflateRaw())

export async function importMxlFile(file: Pick<File, 'arrayBuffer'>, extractor: MxlExtractor = productionMxlExtractor): Promise<MusicXmlPayload> {
  const arrayBuffer = await file.arrayBuffer()
  return extractor.extractMxl(new Uint8Array(arrayBuffer))
}
