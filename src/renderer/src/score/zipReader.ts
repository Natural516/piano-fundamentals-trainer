const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_ENTRIES = 64
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 32 * 1024 * 1024

interface ZipEntryInfo {
  name: string
  method: number
  data: Uint8Array
  uncompressedSize: number
}

/**
 * Minimal ZIP reader for MXL containers. Supports stored (method 0) entries
 * and skips deflated entries with a clear error. Not a general ZIP library.
 */
export function readZipEntries(buffer: Uint8Array): Map<string, ZipEntryInfo> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const entries = new Map<string, ZipEntryInfo>()

  const eocdOffset = findEocd(view)
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP: end of central directory not found')
  }

  const centralOffset = view.getUint32(eocdOffset + 16, true)
  const entryCount = view.getUint16(eocdOffset + 10, true)
  let cursor = centralOffset

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      break
    }

    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)
    const nameBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + cursor + 46, nameLength)
    const name = new TextDecoder().decode(nameBytes)

    const local = localHeaderOffset
    const localNameLength = view.getUint16(local + 26, true)
    const localExtraLength = view.getUint16(local + 28, true)
    const dataOffset = local + 30 + localNameLength + localExtraLength
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset + dataOffset, compressedSize)
    entries.set(name, { name, method, data, uncompressedSize })

    cursor += 46 + nameLength + extraLength + commentLength
    void compressedSize
  }

  return entries
}

export type InflateFn = (data: Uint8Array) => Promise<Uint8Array> | Uint8Array

export async function inflateEntry(entry: ZipEntryInfo, inflate?: InflateFn): Promise<Uint8Array> {
  if (entry.method === 0) {
    return entry.data
  }
  if (entry.method !== 8) {
    throw new Error(`Unsupported ZIP compression method ${entry.method}`)
  }
  if (inflate) {
    return new Uint8Array(await inflate(entry.data))
  }
  throw new Error('MXL raw DEFLATE 需要生产 MxlExtractor adapter')
}

export interface MxlExtractOptions {
  inflate?: InflateFn
  maxEntries?: number
  maxEntryBytes?: number
  maxTotalBytes?: number
}

export async function extractMxlContainerAsync(
  data: Uint8Array,
  options: MxlExtractOptions = {}
): Promise<{ fileName: string; xmlText: string } | null> {
  const entries = readZipEntries(data)
  const maxEntries = options.maxEntries ?? MAX_ENTRIES
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ENTRY_BYTES
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES

  if (entries.size > maxEntries) {
    throw new Error('MXL 条目数超过安全上限')
  }
  let totalBytes = 0
  for (const entry of entries.values()) {
    if (entry.uncompressedSize > maxEntryBytes) {
      throw new Error(`MXL 条目 ${entry.name} 超过单文件大小上限`)
    }
    totalBytes += entry.uncompressedSize
  }
  if (totalBytes > maxTotalBytes) {
    throw new Error('MXL 解压总量超过安全上限')
  }

  const container = entries.get('META-INF/container.xml')
  if (!container) {
    throw new Error('MXL 缺少 META-INF/container.xml')
  }
  const containerText = new TextDecoder().decode(await inflateEntry(container, options.inflate))
  const containerRoot = parseContainerXml(containerText)
  if (!containerRoot || containerRoot.includes('..') || containerRoot.startsWith('/')) {
    throw new Error('MXL container rootfile 路径非法或包含路径穿越')
  }

  const xmlEntry = entries.get(containerRoot)
  if (!xmlEntry) {
    throw new Error(`MXL container 指向的主 MusicXML 不存在: ${containerRoot}`)
  }
  const xmlBytes = await inflateEntry(xmlEntry, options.inflate)
  return {
    fileName: xmlEntry.name,
    xmlText: new TextDecoder().decode(xmlBytes)
  }
}

function parseContainerXml(text: string): string | null {
  const root = text.match(/<rootfile[^>]*full-path\s*=\s*"([^"]+)"/)
  return root ? root[1] : null
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function buildZipEntries(
  entries: Array<{ name: string; content: string }>,
  method: number,
  getCompressed: (content: Uint8Array, index: number) => Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const content = new TextEncoder().encode(entry.content)
    const compressed = getCompressed(content, index)
    const nameBytes = new TextEncoder().encode(entry.name)
    const localHeader = new Uint8Array(30)
    writeUint32(localHeader, 0, LOCAL_SIGNATURE)
    writeUint16(localHeader, 4, 20)
    writeUint16(localHeader, 8, 0)
    writeUint16(localHeader, 10, method)
    writeUint32(localHeader, 18, compressed.length)
    writeUint32(localHeader, 22, content.length)
    writeUint16(localHeader, 26, nameBytes.length)

    const central = new Uint8Array(46)
    writeUint32(central, 0, CENTRAL_SIGNATURE)
    writeUint16(central, 4, 20)
    writeUint16(central, 6, 20)
    writeUint16(central, 10, method)
    writeUint32(central, 20, compressed.length)
    writeUint32(central, 24, content.length)
    writeUint16(central, 28, nameBytes.length)
    writeUint32(central, 42, offset)

    parts.push(localHeader, nameBytes, compressed)
    centralParts.push(central, nameBytes)
    offset += 30 + nameBytes.length + compressed.length
  }

  const centralOffset = offset
  const centralBuffer = concatBytes(centralParts)
  const eocd = new Uint8Array(22)
  writeUint32(eocd, 0, EOCD_SIGNATURE)
  writeUint16(eocd, 8, entries.length)
  writeUint16(eocd, 10, entries.length)
  writeUint32(eocd, 12, centralBuffer.length)
  writeUint32(eocd, 16, centralOffset)

  return concatBytes([...parts, centralBuffer, eocd])
}

/**
 * Creates a stored (uncompressed) ZIP archive from text entries. Used by tests
 * and fixtures; not a general archive writer.
 */
export function createStoredZip(entries: Array<{ name: string; content: string }>): Uint8Array {
  return buildZipEntries(entries, 0, (content) => content)
}

/**
 * Creates a ZIP archive with a caller-provided compression function (e.g.
 * Node zlib.deflateRawSync for method 8). Used by tests and adapters.
 */
export function buildZip(
  entries: Array<{ name: string; content: string }>,
  method: number,
  compress: (content: Uint8Array, index: number) => Uint8Array
): Uint8Array {
  return buildZipEntries(entries, method, compress)
}

function findEocd(view: DataView): number {
  const length = view.byteLength
  const minimum = Math.max(0, length - 65557)
  for (let offset = length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset
    }
  }
  return -1
}
