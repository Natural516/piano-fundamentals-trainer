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
      if (source.startsWith('<!--', index)) {
        const commentEnd = source.indexOf('-->', index)
        if (commentEnd < 0) throw new Error('Unterminated comment')
        index = commentEnd + 3
        continue
      }

      if (source.startsWith('<![CDATA[', index)) {
        const cdataEnd = source.indexOf(']]>', index)
        if (cdataEnd < 0) throw new Error('Unterminated CDATA')
        textParts.push(source.slice(index + 9, cdataEnd))
        index = cdataEnd + 3
        continue
      }

      if (source.startsWith('<!', index) || source.startsWith('<?', index)) {
        const declarationEnd = source.indexOf('>', index)
        if (declarationEnd < 0) throw new Error('Unterminated declaration')
        index = declarationEnd + 1
        continue
      }

      if (source[index] === '<') {
        if (source.startsWith('</', index)) {
          const closeEnd = source.indexOf('>', index)
          if (closeEnd < 0) throw new Error('Unterminated close tag')
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
    if (source.startsWith('<?xml', index) || source.startsWith('<?', index)) {
      const declarationEnd = source.indexOf('?>', index)
      if (declarationEnd < 0) throw new Error('Unterminated processing instruction')
      index = declarationEnd + 2
      continue
    }

    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index)
      if (commentEnd < 0) throw new Error('Unterminated comment')
      index = commentEnd + 3
      continue
    }

    if (source.startsWith('<!', index)) {
      const declarationEnd = source.indexOf('>', index)
      if (declarationEnd < 0) throw new Error('Unterminated declaration')
      index = declarationEnd + 1
      continue
    }

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
