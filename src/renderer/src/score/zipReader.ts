const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

/**
 * Minimal ZIP reader for MXL containers. Supports stored (method 0) entries
 * and skips deflated entries with a clear error. Not a general ZIP library.
 */
export function readZipEntries(buffer: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const entries = new Map<string, Uint8Array>()

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

    if (method !== 0) {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`)
    }

    const local = localHeaderOffset
    const localNameLength = view.getUint16(local + 26, true)
    const localExtraLength = view.getUint16(local + 28, true)
    const dataOffset = local + 30 + localNameLength + localExtraLength
    entries.set(name, new Uint8Array(buffer.buffer, buffer.byteOffset + dataOffset, uncompressedSize))

    cursor += 46 + nameLength + extraLength + commentLength
    void compressedSize
  }

  return entries
}

export function extractMxlContainer(data: Uint8Array): { fileName: string; xmlText: string } | null {
  const entries = readZipEntries(data)
  const xmlEntry = [...entries.entries()]
    .find(([name]) => name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.musicxml'))
  if (!xmlEntry) return null

  return {
    fileName: xmlEntry[0],
    xmlText: new TextDecoder().decode(xmlEntry[1])
  }
}

/**
 * Creates a stored (uncompressed) ZIP archive from text entries. Used by tests
 * and fixtures; not a general archive writer.
 */
export function createStoredZip(entries: Array<{ name: string; content: string }>): Uint8Array {
  const parts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const content = Buffer.from(entry.content, 'utf8')
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_SIGNATURE, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(content.length, 18)
    localHeader.writeUInt16LE(content.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(content.length, 20)
    central.writeUInt16LE(content.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)

    parts.push(localHeader, nameBuffer, content)
    centralParts.push(central, nameBuffer)
    offset += 30 + nameBuffer.length + content.length
  }

  const centralOffset = offset
  const centralBuffer = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(centralOffset, 16)

  return new Uint8Array(Buffer.concat([...parts, centralBuffer, eocd]))
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
