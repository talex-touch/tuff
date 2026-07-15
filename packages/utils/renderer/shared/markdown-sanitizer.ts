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
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
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

// Elements that must never survive sanitization even inside "trusted" content:
// they execute script, load remote/opaque resources, or rebase relative URLs.
const DANGEROUS_ELEMENTS
  = 'script|style|iframe|object|embed|base|form|link|meta|svg|math|template|noscript|frame|frameset|applet'

function stripDangerousElements(html: string): string {
  return html
    // HTML comments can hide conditional/payload content.
    .replace(/<!--[\s\S]*?-->/g, '')
    // Paired dangerous elements together with their content.
    .replace(new RegExp(`<(${DANGEROUS_ELEMENTS})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
    // Any remaining unpaired / self-closing dangerous tags.
    .replace(new RegExp(`<\\/?(?:${DANGEROUS_ELEMENTS})\\b[^>]*>`, 'gi'), '')
}

export function sanitizeMarkdownHtml(html: string): string {
  if (!html) return ''

  return stripDangerousElements(html)
    // Event-handler attributes. Allow `/` as a separator too, since
    // `<img/onerror=...>` is valid HTML that the previous `\s+on` pattern missed.
    .replace(/[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Inline styles (CSS-based injection).
    .replace(/[\s/]+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // URL-bearing attributes beyond href/src that can execute or navigate.
    .replace(/[\s/]+(?:formaction|xlink:href|action|srcdoc|background|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // href/src with quotes — protocol-checked.
    .replace(/\s+(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi, (_match, name: string, quote: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}=${quote}${sanitizeAttributeValue(value.trim())}${quote}`
    })
    // href/src without quotes.
    .replace(/\s+(href|src)\s*=\s*([^\s>"']+)/gi, (_match, name: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}="${sanitizeAttributeValue(value.trim())}"`
    })
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown) as string
  return sanitizeMarkdownHtml(html)
}
