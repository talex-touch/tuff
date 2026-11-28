import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true
})

const DANGEROUS_PROTOCOL_RE = /^(?:javascript|data|vbscript):/i
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function stripUrlControlCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code > 0x1F && code !== 0x7F && !/\s/.test(char)
    })
    .join('')
}

function isAllowedUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const normalizedProtocolCandidate = stripUrlControlCharacters(trimmed)
  if (DANGEROUS_PROTOCOL_RE.test(normalizedProtocolCandidate)) return false
  if (
    trimmed.startsWith('#')
    || (trimmed.startsWith('/') && !trimmed.startsWith('//'))
    || trimmed.startsWith('./')
    || trimmed.startsWith('../')
  ) {
    return true
  }

  try {
    return ALLOWED_URL_PROTOCOLS.has(new URL(trimmed).protocol)
  } catch {
    return false
  }
}

function sanitizeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: '\u00A0',
  colon: ':',
  tab: '\t',
  newline: '\n',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));?/gi, (match, hex?: string, dec?: string, named?: string) => {
    if (hex) {
      const code = Number.parseInt(hex, 16)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code)
        }
        catch {
          return ''
        }
      }
      return ''
    }
    if (dec) {
      const code = Number.parseInt(dec, 10)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code)
        }
        catch {
          return ''
        }
      }
      return ''
    }
    if (named) {
      const lower = named.toLowerCase()
      if (Object.hasOwn(NAMED_HTML_ENTITIES, lower))
        return NAMED_HTML_ENTITIES[lower]!
    }
    return match
  })
}

// Elements that must never survive sanitization even inside "trusted" content:
// they execute script, load remote/opaque resources, or rebase relative URLs.
const DANGEROUS_ELEMENTS
  = 'script|style|iframe|object|embed|base|form|link|meta|svg|math|template|noscript|frame|frameset|applet|textarea|title|xmp'

const DANGEROUS_ELEMENT_SET = new Set(DANGEROUS_ELEMENTS.split('|'))
const RAW_TEXT_DANGEROUS_ELEMENTS = new Set(['script', 'style', 'iframe', 'textarea', 'title', 'xmp'])
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])
const URL_ATTRIBUTES = new Set(['href', 'src'])
const BANNED_ATTRIBUTES = new Set([
  'style',
  'formaction',
  'xlink:href',
  'action',
  'srcdoc',
  'srcset',
  'background',
  'ping',
  'poster',
  'dynsrc',
  'lowsrc',
  'codebase',
  'archive',
])

const SAFE_ATTR_NAME_RE = /^[a-z][a-z0-9_-]*$/

function isAllowedAttributeName(name: string): boolean {
  if (!name || name.startsWith('on') || BANNED_ATTRIBUTES.has(name))
    return false
  return SAFE_ATTR_NAME_RE.test(name)
}

/**
 * Parses the HTML, filters it as a tree, and serialises the result.
 *
 * Returns null when there is no DOM to parse with, which is the caller's signal to fall back
 * to the parser-safe single-pass HTML tokenizer.
 */
function sanitizeByParsing(html: string): string | null {
  if (typeof DOMParser === 'undefined')
    return null

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  }
  catch {
    return null
  }
  if (!doc?.body)
    return null

  // Comments can hide payload content and are not needed in rendered markdown.
  const walker = doc.createTreeWalker(doc.body, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: ChildNode[] = []
  while (walker.nextNode()) comments.push(walker.currentNode as ChildNode)
  for (const comment of comments) comment.remove()

  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (DANGEROUS_ELEMENT_SET.has(element.tagName.toLowerCase())) {
      element.remove()
      continue
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()

      if (!isAllowedAttributeName(name)) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (URL_ATTRIBUTES.has(name) && !isAllowedUrl(attribute.value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return doc.body.innerHTML
}

function isHtmlWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
}

function isAsciiAlpha(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isTagNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (
    (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || ch === '-'
    || ch === ':'
  )
}

function skipDangerousElementBody(html: string, start: number, lowerTag: string): number {
  const len = html.length
  const closeNeedle = `</${lowerTag}`
  const openNeedle = `<${lowerTag}`
  const trackNesting = !RAW_TEXT_DANGEROUS_ELEMENTS.has(lowerTag)
  let depth = 1
  let pos = start

  while (pos < len) {
    const nextLt = html.indexOf('<', pos)
    if (nextLt === -1)
      return len

    if (html.slice(nextLt, nextLt + closeNeedle.length).toLowerCase() === closeNeedle) {
      const afterName = html[nextLt + closeNeedle.length] ?? ''
      if (!afterName || isHtmlWhitespace(afterName) || afterName === '>' || afterName === '/') {
        const endGt = html.indexOf('>', nextLt + closeNeedle.length)
        if (endGt === -1)
          return len
        depth -= 1
        pos = endGt + 1
        if (depth <= 0)
          return pos
        continue
      }
    }

    if (trackNesting && html.slice(nextLt, nextLt + openNeedle.length).toLowerCase() === openNeedle) {
      const afterName = html[nextLt + openNeedle.length] ?? ''
      if (!afterName || isHtmlWhitespace(afterName) || afterName === '>' || afterName === '/') {
        const endGt = html.indexOf('>', nextLt + openNeedle.length)
        if (endGt === -1)
          return len
        if (html[endGt - 1] !== '/')
          depth += 1
        pos = endGt + 1
        continue
      }
    }

    pos = nextLt + 1
  }

  return len
}

/**
 * Parser-safe single-pass HTML tokenizer and canonical re-serializer for SSR / no-DOM contexts.
 *
 * Unlike regex stripping:
 * - Parses HTML5 attributes character-by-character, including adjacent quoted attributes with no
 *   separating whitespace (`<img src="/x"onerror="...">`) and `/` separators (`<a/href="...">`).
 * - Decodes HTML character references before URL scheme validation (`&#106;avascript:`).
 * - Re-emits only canonical `<tag attr="escaped">` tokens, so attribute deletion can never splice
 *   adjacent text into a new tag or event handler.
 * - Fails closed by escaping unclosed/malformed `<...` tags as `&lt;` and dropping unclosed
 *   comments or dangerous element subtrees to EOF.
 */
function sanitizeByTokenizing(html: string): string {
  const len = html.length
  let out = ''
  let i = 0

  while (i < len) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out += html.slice(i)
      break
    }

    if (lt > i)
      out += html.slice(i, lt)

    // HTML comments: drop through `-->`, or drop to EOF if unclosed (fail closed).
    if (html.startsWith('<!--', lt)) {
      const closeComment = html.indexOf('-->', lt + 4)
      i = closeComment === -1 ? len : closeComment + 3
      continue
    }

    const next = html[lt + 1]
    if (!next) {
      out += '&lt;'
      i = lt + 1
      continue
    }

    // Declarations / CDATA / processing instructions: drop through `>` or EOF.
    if (next === '!' || next === '?') {
      const closeDecl = html.indexOf('>', lt + 2)
      i = closeDecl === -1 ? len : closeDecl + 1
      continue
    }

    // Closing tag: `</tagName>`
    if (next === '/') {
      let pos = lt + 2
      if (pos >= len || !isAsciiAlpha(html[pos]!)) {
        out += '&lt;'
        i = lt + 1
        continue
      }
      const nameStart = pos
      while (pos < len && isTagNameChar(html[pos]!))
        pos += 1
      const lowerTag = html.slice(nameStart, pos).toLowerCase()
      const closeGt = html.indexOf('>', pos)
      if (closeGt === -1) {
        out += '&lt;'
        i = lt + 1
        continue
      }
      i = closeGt + 1
      if (!DANGEROUS_ELEMENT_SET.has(lowerTag))
        out += `</${lowerTag}>`
      continue
    }

    // Opening or self-closing tag
    if (!isAsciiAlpha(next)) {
      out += '&lt;'
      i = lt + 1
      continue
    }

    let pos = lt + 1
    const nameStart = pos
    while (pos < len && isTagNameChar(html[pos]!))
      pos += 1
    const lowerTag = html.slice(nameStart, pos).toLowerCase()

    const attrs: Array<{ name: string, value: string | null }> = []
    let selfClosing = false
    let closed = false

    while (pos < len) {
      while (pos < len && isHtmlWhitespace(html[pos]!))
        pos += 1
      if (pos >= len)
        break

      const ch = html[pos]!
      if (ch === '>') {
        closed = true
        pos += 1
        break
      }
      if (ch === '/') {
        if (html[pos + 1] === '>') {
          selfClosing = true
          closed = true
          pos += 2
          break
        }
        // HTML5 treats `/` inside a tag as an attribute separator (`<a/href=...>`).
        pos += 1
        continue
      }
      if (ch === '<') {
        // Unclosed tag followed by another `<`: fail closed.
        closed = false
        break
      }

      const attrNameStart = pos
      while (
        pos < len
        && !isHtmlWhitespace(html[pos]!)
        && html[pos] !== '='
        && html[pos] !== '>'
        && html[pos] !== '/'
        && html[pos] !== '"'
        && html[pos] !== '\''
        && html[pos] !== '<'
      ) {
        pos += 1
      }

      if (pos === attrNameStart) {
        // Consume stray delimiter character (`"`, `'`, `=`) to guarantee forward progress.
        pos += 1
        continue
      }

      const attrName = html.slice(attrNameStart, pos).toLowerCase()
      while (pos < len && isHtmlWhitespace(html[pos]!))
        pos += 1

      let attrValue: string | null = null
      if (html[pos] === '=') {
        pos += 1
        while (pos < len && isHtmlWhitespace(html[pos]!))
          pos += 1
        if (pos >= len) {
          closed = false
          break
        }

        const valChar = html[pos]!
        if (valChar === '"' || valChar === '\'') {
          pos += 1
          const valStart = pos
          const endQuote = html.indexOf(valChar, pos)
          if (endQuote === -1) {
            closed = false
            break
          }
          attrValue = html.slice(valStart, endQuote)
          pos = endQuote + 1
        }
        else {
          const valStart = pos
          while (pos < len && !isHtmlWhitespace(html[pos]!) && html[pos] !== '>') {
            if (html[pos] === '<') {
              closed = false
              break
            }
            pos += 1
          }
          if (pos < len && html[pos] === '<')
            break
          attrValue = html.slice(valStart, pos)
        }
      }

      attrs.push({ name: attrName, value: attrValue })
    }

    if (!closed) {
      out += '&lt;'
      i = lt + 1
      continue
    }

    if (DANGEROUS_ELEMENT_SET.has(lowerTag)) {
      if (selfClosing || VOID_ELEMENTS.has(lowerTag)) {
        i = pos
      }
      else {
        i = skipDangerousElementBody(html, pos, lowerTag)
      }
      continue
    }

    let serializedAttrs = ''
    const seenAttrs = new Set<string>()
    for (const attr of attrs) {
      if (!isAllowedAttributeName(attr.name) || seenAttrs.has(attr.name))
        continue

      if (URL_ATTRIBUTES.has(attr.name)) {
        const decoded = decodeHtmlEntities(attr.value ?? '')
        if (!isAllowedUrl(decoded))
          continue
        seenAttrs.add(attr.name)
        serializedAttrs += ` ${attr.name}="${sanitizeAttributeValue(decoded.trim())}"`
        continue
      }

      seenAttrs.add(attr.name)
      if (attr.value === null) {
        serializedAttrs += ` ${attr.name}`
      }
      else {
        const decoded = decodeHtmlEntities(attr.value)
        serializedAttrs += ` ${attr.name}="${sanitizeAttributeValue(decoded)}"`
      }
    }

    out += `<${lowerTag}${serializedAttrs}${selfClosing ? ' /' : ''}>`
    i = pos
  }

  return out
}

export function sanitizeMarkdownHtml(html: string): string {
  if (!html) return ''

  const parsed = sanitizeByParsing(html)
  if (parsed !== null)
    return parsed

  return sanitizeByTokenizing(html)
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown) as string
  return sanitizeMarkdownHtml(html)
}
