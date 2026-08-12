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

const DANGEROUS_ELEMENT_SET = new Set(DANGEROUS_ELEMENTS.split('|'))
const URL_ATTRIBUTES = new Set(['href', 'src'])
const BANNED_ATTRIBUTES = new Set([
  'style',
  'formaction',
  'xlink:href',
  'action',
  'srcdoc',
  'background',
  'ping',
])

/**
 * Parses the HTML, filters it as a tree, and serialises the result.
 *
 * The regex chain below applies its passes in sequence over each other's output, so deleting
 * an attribute can splice the surrounding text into something new. Executing it proves the
 * point: `<img src="/nope.png" on style="y"error=alert(1)>` came out as
 * `<img src="/nope.png" onerror=alert(1)>`, and `<i onerror="x"frame src="//evil">` became a
 * real iframe (#900). No amount of pass ordering fixes that shape — the passes are the
 * problem.
 *
 * A tree has no such seams: an attribute is removed from a node, not from a string, so
 * nothing can be spliced together by its removal. The policy applied here is the same one the
 * regexes expressed, so this is a change of mechanism rather than of what counts as safe.
 *
 * Returns null when there is no DOM to parse with, which is the caller's signal to fall back.
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

      if (name.startsWith('on') || BANNED_ATTRIBUTES.has(name)) {
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

/**
 * The fallback for contexts with no DOM — server-side rendering, and unit tests that have not
 * asked for one.
 *
 * Still the sequential regex chain, so still subject in principle to the splice class in
 * #900, but applied repeatedly until the output stops changing. A splice produces text that
 * the next round strips, so the fixed point is reached with the handler gone. The iteration
 * cap is a guard against a pathological input, not an expected path: two rounds settle
 * everything observed.
 */
function sanitizeByStrippingUntilStable(html: string): string {
  let current = html
  for (let round = 0; round < 8; round += 1) {
    const next = stripOnce(current)
    if (next === current)
      return current
    current = next
  }
  return current
}

function stripOnce(html: string): string {
  return stripDangerousElements(html)
    // Event-handler attributes. Allow `/` as a separator too, since
    // `<img/onerror=...>` is valid HTML that the previous `\s+on` pattern missed.
    .replace(/[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Inline styles (CSS-based injection).
    .replace(/[\s/]+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // URL-bearing attributes beyond href/src that can execute or navigate.
    .replace(/[\s/]+(?:formaction|xlink:href|action|srcdoc|background|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // href/src with quotes — protocol-checked.
    //
    // `[\s/]+`, not `\s+`, for the same reason the handlers above use it: `/` is a valid
    // attribute-name separator, so `<a/href="javascript:...">` never reached the protocol
    // allowlist and survived verbatim while the plain `<a href=...>` form was stripped (#907).
    .replace(/[\s/]+(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi, (_match, name: string, quote: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}=${quote}${sanitizeAttributeValue(value.trim())}${quote}`
    })
    // href/src without quotes.
    .replace(/[\s/]+(href|src)\s*=\s*([^\s>"']+)/gi, (_match, name: string, value: string) => {
      if (!isAllowedUrl(value)) return ''
      return ` ${name.toLowerCase()}="${sanitizeAttributeValue(value.trim())}"`
    })
}

export function sanitizeMarkdownHtml(html: string): string {
  if (!html) return ''

  const parsed = sanitizeByParsing(html)
  if (parsed !== null)
    return parsed

  return sanitizeByStrippingUntilStable(html)
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown) as string
  return sanitizeMarkdownHtml(html)
}
