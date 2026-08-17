export interface XmlElement {
  tag: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
}

export type XmlNode = XmlElement | string

const SELF_CLOSING_TAGS = new Set([
  'barline', 'clef', 'key', 'time', 'direction', 'dynamics', 'articulations', 'notations',
  'technical', 'fingering', 'tie', 'slur', 'accidental', 'octave-shift', 'backup', 'forward',
  'sound', 'attributes', 'metronome', 'work', 'movement-number', 'movement-title', 'identification',
  'encoding', 'supports', 'credit', 'defaults', 'scaling', 'page-layout', 'system-layout', 'staff-layout'
])

/**
 * Minimal XML tree parser for the MusicXML subset. Handles elements,
 * attributes, text, comments, CDATA, self-closing tags and unescapes the
 * common entities. Not a general XML implementation.
 */
export function parseXml(source: string): XmlElement {
  let index = 0

  const skipProcessingInstruction = (): void => {
    const end = source.indexOf('?>', index + 2)
    if (end < 0) throw new Error('Unterminated processing instruction')
    index = end + 2
  }

  const skipComment = (): void => {
    const end = source.indexOf('-->', index + 4)
    if (end < 0) throw new Error('Unterminated comment')
    index = end + 3
  }

  // A MuseScore DOCTYPE may contain quoted '>' characters or an internal
  // subset. Scan it structurally instead of stopping at the first '>'.
  const skipDeclaration = (): void => {
    let cursor = index + 2
    let quote: '"' | "'" | null = null
    let subsetDepth = 0
    while (cursor < source.length) {
      const character = source[cursor]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '[') {
        subsetDepth += 1
      } else if (character === ']') {
        subsetDepth = Math.max(0, subsetDepth - 1)
      } else if (character === '>' && subsetDepth === 0) {
        index = cursor + 1
        return
      }
      cursor += 1
    }
    throw new Error('Unterminated declaration')
  }

  const skipNonSemanticNode = (): boolean => {
    if (source.startsWith('<!--', index)) {
      skipComment()
      return true
    }
    if (source.startsWith('<?', index)) {
      skipProcessingInstruction()
      return true
    }
    if (source.startsWith('<!', index) && !source.startsWith('<![CDATA[', index)) {
      skipDeclaration()
      return true
    }
    return false
  }

  const skipWhitespace = (): void => {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1
    }
  }

  const parseElement = (): XmlElement => {
    if (source[index] !== '<') {
      throw new Error(`Expected '<' at ${index}`)
    }

    const openEnd = source.indexOf('>', index)
    if (openEnd < 0) {
      throw new Error('Unterminated tag')
    }

    const rawTag = source.slice(index + 1, openEnd)
    index = openEnd + 1
    const selfClosing = rawTag.endsWith('/')
    const tagBody = selfClosing ? rawTag.slice(0, -1).trim() : rawTag.trim()
    const spaceIndex = tagBody.search(/\s/)
    const tag = spaceIndex < 0 ? tagBody : tagBody.slice(0, spaceIndex)
    const attributeSource = spaceIndex < 0 ? '' : tagBody.slice(spaceIndex + 1)
    const attributes: Record<string, string> = {}

    const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let attributeMatch: RegExpExecArray | null
    while ((attributeMatch = attributePattern.exec(attributeSource)) !== null) {
      attributes[attributeMatch[1]] = unescapeXml(attributeMatch[3] ?? attributeMatch[4] ?? '')
    }

    const element: XmlElement = {
      tag,
      attributes,
      children: [],
      text: ''
    }

    if (selfClosing) {
      return element
    }

    const textParts: string[] = []

    while (index < source.length) {
      if (skipNonSemanticNode()) continue

      if (source.startsWith('<![CDATA[', index)) {
        const cdataEnd = source.indexOf(']]>', index)
        if (cdataEnd < 0) throw new Error('Unterminated CDATA')
        textParts.push(source.slice(index + 9, cdataEnd))
        index = cdataEnd + 3
        continue
      }

      if (source[index] === '<') {
        if (source.startsWith('</', index)) {
          const closeEnd = source.indexOf('>', index)
          if (closeEnd < 0) throw new Error('Unterminated close tag')
          const closeTag = source.slice(index + 2, closeEnd).trim()
          if (closeTag !== tag) {
            throw new Error(`Mismatched close tag: expected </${tag}> but found </${closeTag}>`)
          }
          index = closeEnd + 1
          element.text = unescapeXml(textParts.join('').trim())
          return element
        }

        element.children.push(parseElement())
        continue
      }

      const textEnd = source.indexOf('<', index)
      const textChunk = textEnd < 0 ? source.slice(index) : source.slice(index, textEnd)
      textParts.push(textChunk)
      index = textEnd < 0 ? source.length : textEnd
    }

    throw new Error(`Missing close tag for <${tag}>`)
  }

  skipWhitespace()

  while (index < source.length) {
    skipWhitespace()
    if (source.charCodeAt(index) === 0xfeff) {
      index += 1
      continue
    }
    if (skipNonSemanticNode()) continue

    break
  }

  skipWhitespace()
  const root = parseElement()
  return root
}

export function findChildren(element: XmlElement, tag: string): XmlElement[] {
  return element.children.filter((child): child is XmlElement =>
    typeof child !== 'string' && child.tag === tag
  )
}

export function findChild(element: XmlElement, tag: string): XmlElement | null {
  return findChildren(element, tag)[0] ?? null
}

export function childText(element: XmlElement, tag: string): string {
  return findChild(element, tag)?.text ?? ''
}

export function childNumber(element: XmlElement, tag: string): number | null {
  const text = childText(element, tag)
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
