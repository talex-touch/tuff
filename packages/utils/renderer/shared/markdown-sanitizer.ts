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

export function sanitizeMarkdownHtml(html: string): string {
  if (!html) return ''

  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi, (_match, name: string, quote: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}=${quote}${sanitizeAttributeValue(value.trim())}${quote}`
    })
    .replace(/\s+(href|src)\s*=\s*([^\s>"']+)/gi, (_match, name: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}="${sanitizeAttributeValue(value.trim())}"`
    })
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown) as string
  return sanitizeMarkdownHtml(html)
}
