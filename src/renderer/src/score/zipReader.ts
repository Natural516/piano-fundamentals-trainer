const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

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

export function extractMxlContainer(data: Uint8Array): { fileName: string; xmlText: string } | null {
  const entries = readZipEntries(data)
  const xmlEntry = pickXmlEntry(entries)
  if (!xmlEntry) return null
  if (xmlEntry[1].method !== 0) {
    throw new Error(`MXL entry uses unsupported method ${xmlEntry[1].method}; use extractMxlContainerAsync`)
  }

  return {
    fileName: xmlEntry[1].name,
    xmlText: new TextDecoder().decode(xmlEntry[1].data)
  }
}

export async function inflateEntry(entry: ZipEntryInfo): Promise<Uint8Array> {
  if (entry.method === 0) {
    return entry.data
  }
  if (entry.method !== 8) {
    throw new Error(`Unsupported ZIP compression method ${entry.method}`)
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持 DEFLATE 解压（DecompressionStream 不可用）')
  }

  const stream = new DecompressionStream('deflate')
  const response = new Response(new Blob([new Uint8Array(entry.data)]).stream().pipeThrough(stream))
  return new Uint8Array(await response.arrayBuffer())
}

export async function extractMxlContainerAsync(data: Uint8Array): Promise<{ fileName: string; xmlText: string } | null> {
  const entries = readZipEntries(data)
  const xmlEntry = pickXmlEntry(entries)
  if (!xmlEntry) return null

  const info = xmlEntry[1]
  const xmlBytes = await inflateEntry(info)
  return {
    fileName: info.name,
    xmlText: new TextDecoder().decode(xmlBytes)
  }
}

function pickXmlEntry(entries: Map<string, ZipEntryInfo>): [string, ZipEntryInfo] | null {
  const candidates = [...entries.entries()]
    .filter(([name]) => name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.musicxml'))
  return candidates.find(([name]) => name.toLowerCase().endsWith('.musicxml'))
    ?? candidates.find(([name]) => !name.toLowerCase().endsWith('container.xml'))
    ?? candidates[0]
    ?? null
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
    writeUint16(localHeader, 18, compressed.length)
    writeUint16(localHeader, 22, content.length)
    writeUint16(localHeader, 26, nameBytes.length)

    const central = new Uint8Array(46)
    writeUint32(central, 0, CENTRAL_SIGNATURE)
    writeUint16(central, 4, 20)
    writeUint16(central, 6, 20)
    writeUint16(central, 10, method)
    writeUint16(central, 20, compressed.length)
    writeUint16(central, 24, content.length)
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
 * Creates a DEFLATE-compressed ZIP archive. Used by tests to exercise the
 * MXL deflate path without external dependencies.
 */
export async function createDeflatedZip(entries: Array<{ name: string; content: string }>): Promise<Uint8Array> {
  const compress = async (content: Uint8Array): Promise<Uint8Array> => {
    if (typeof CompressionStream === 'undefined') {
      throw new Error('当前环境不支持 DEFLATE 压缩（CompressionStream 不可用）')
    }
    const stream = new CompressionStream('deflate')
    const response = new Response(new Blob([new Uint8Array(content)]).stream().pipeThrough(stream))
    return new Uint8Array(await response.arrayBuffer())
  }

  const compressedByEntry: Uint8Array[] = []
  for (const entry of entries) {
    compressedByEntry.push(await compress(new TextEncoder().encode(entry.content)))
  }
  return buildZipEntries(entries, 8, (_, index) => compressedByEntry[index])
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
