import { readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

export const PIANO_SAMPLE_READ_CHANNEL = 'piano:samples:read'
export const PIANO_SAMPLE_RESOURCE_DIRECTORY = 'piano-samples'

export interface PianoSampleResourceEnvironment {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
}

export interface PianoSampleReadResult {
  success: boolean
  bytes?: Uint8Array
  error?: string
}

export function getPianoSampleRoot(environment: PianoSampleResourceEnvironment): string {
  return environment.isPackaged
    ? join(environment.resourcesPath, PIANO_SAMPLE_RESOURCE_DIRECTORY)
    : join(environment.appPath, 'resources', PIANO_SAMPLE_RESOURCE_DIRECTORY)
}

export function resolvePianoSampleResource(root: string, requestedPath: unknown): string | null {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0 || isAbsolute(requestedPath)) {
    return null
  }

  const segments = requestedPath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    return null
  }

  const normalizedRoot = resolve(root)
  const candidate = resolve(normalizedRoot, normalize(segments.join(sep)))
  const relativePath = relative(normalizedRoot, candidate)
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    return null
  }

  return candidate
}

export async function readPianoSampleResource(
  root: string,
  requestedPath: unknown
): Promise<PianoSampleReadResult> {
  const resourcePath = resolvePianoSampleResource(root, requestedPath)
  if (!resourcePath) {
    return { success: false, error: '无效的内置钢琴采样路径' }
  }

  try {
    const bytes = await readFile(resourcePath)
    return { success: true, bytes: Uint8Array.from(bytes) }
  } catch {
    return {
      success: false,
      error: `缺少内置钢琴采样：${String(requestedPath)}`
    }
  }
}
