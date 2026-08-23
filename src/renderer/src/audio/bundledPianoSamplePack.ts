import { PianoSampler } from './pianoSampler'
import { SALAMANDER_SAMPLE_ASSET_ROOT, SALAMANDER_SAMPLE_PACK } from './salamanderSamplePack'

export interface PianoSampleBridgeResult {
  success: boolean
  bytes?: Uint8Array
  error?: string
}

export interface PianoSampleBridge {
  readFile: (relativePath: string) => Promise<PianoSampleBridgeResult>
}

export class PianoSampleAssetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PianoSampleAssetError'
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(bytes)
  return copy.buffer
}

export async function loadBundledPianoSamplePack(
  sampler: PianoSampler,
  bridge: PianoSampleBridge | null | undefined
): Promise<number> {
  if (!bridge) {
    throw new PianoSampleAssetError('内置钢琴采样资源桥接不可用')
  }

  return sampler.loadSamplePack(SALAMANDER_SAMPLE_PACK.anchors, async (sample) => {
    const relativePath = `${SALAMANDER_SAMPLE_ASSET_ROOT}/${sample}`
    const result = await bridge.readFile(relativePath)
    if (!result.success || !result.bytes || result.bytes.byteLength === 0) {
      throw new PianoSampleAssetError(result.error ?? `缺少内置钢琴采样：${relativePath}`)
    }
    return sampler.decodeAudioData(toArrayBuffer(result.bytes))
  })
}
