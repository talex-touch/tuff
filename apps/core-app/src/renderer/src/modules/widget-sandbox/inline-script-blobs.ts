/**
 * Rewrites inline `<script>` elements inside untrusted HTML previews into host-created
 * `blob:` `<script src="blob:...">` tags so interactive HTML previews work under CoreApp's
 * strict parent CSP (`script-src 'self' 'unsafe-eval' blob:`, no `'unsafe-inline'`) inside
 * opaque-origin `<iframe sandbox="allow-scripts" srcdoc="...">` frames.
 *
 * Classic scripts become `<script ... src="blob:..."></script>` (`no-cors` fetch works from
 * an opaque-origin frame). ES module scripts (`type="module"`) are wrapped in a tiny classic
 * loader blob that creates a same-origin `blob:null/...` inside the iframe and runs `import()`,
 * avoiding cross-origin CORS rejection of parent-origin module blobs.
 */

const EXECUTABLE_SCRIPT_TYPES = new Set([
  '',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'application/x-javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
  'module'
])

function defaultCreateScriptBlobUrl(code: string): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null
  }
  return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
}

function parseAttributes(
  rawAttrs: string
): Array<{ name: string; rawName: string; value: string | null }> {
  const attrs: Array<{ name: string; rawName: string; value: string | null }> = []
  const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const rawName = match[1]!
    const value = match[2] ?? match[3] ?? match[4] ?? null
    attrs.push({ name: rawName.toLowerCase(), rawName, value })
  }
  return attrs
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function buildModuleLoaderCode(moduleSource: string): string {
  return `(function(){var u=URL.createObjectURL(new Blob([${JSON.stringify(moduleSource)}],{type:'text/javascript'}));import(u).finally(function(){URL.revokeObjectURL(u);});})();`
}

export interface RewriteInlineScriptsResult {
  html: string
  blobUrls: string[]
}

export function rewriteInlineScriptsToBlobs(
  html: string,
  createBlobUrl: (code: string) => string | null = defaultCreateScriptBlobUrl
): RewriteInlineScriptsResult {
  if (!html || !/<script\b/i.test(html)) {
    return { html, blobUrls: [] }
  }

  const blobUrls: string[] = []
  let out = ''
  let i = 0

  while (i < html.length) {
    // Preserve HTML comments verbatim so `<script>` inside comments is untouched.
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      if (end === -1) {
        out += html.slice(i)
        break
      }
      out += html.slice(i, end + 3)
      i = end + 3
      continue
    }

    // Preserve raw-text elements (`textarea`, `style`, `title`, `xmp`) verbatim.
    const rawTagMatch = /^<(textarea|style|title|xmp)\b[^>]*>/i.exec(html.slice(i))
    if (rawTagMatch) {
      const tagName = rawTagMatch[1]!.toLowerCase()
      const afterOpen = i + rawTagMatch[0].length
      const closeRe = new RegExp(`</${tagName}\\s*>`, 'i')
      const closeMatch = closeRe.exec(html.slice(afterOpen))
      if (!closeMatch) {
        out += html.slice(i)
        break
      }
      const endPos = afterOpen + closeMatch.index + closeMatch[0].length
      out += html.slice(i, endPos)
      i = endPos
      continue
    }

    // Match `<script ...>...</script>`.
    const scriptOpen = /^<script\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(html.slice(i))
    if (scriptOpen) {
      const openTag = scriptOpen[0]
      const rawAttrs = scriptOpen[1] ?? ''
      const bodyStart = i + openTag.length
      const closeMatch = /<\/script\s*>/i.exec(html.slice(bodyStart))
      if (!closeMatch) {
        out += html.slice(i)
        break
      }
      const body = html.slice(bodyStart, bodyStart + closeMatch.index)
      const endPos = bodyStart + closeMatch.index + closeMatch[0].length

      const attrs = parseAttributes(rawAttrs)
      const hasSrc = attrs.some((attr) => attr.name === 'src')
      const typeAttr = attrs.find((attr) => attr.name === 'type')
      const normalizedType = (typeAttr?.value ?? '').trim().toLowerCase().split(';')[0]!.trim()

      if (hasSrc || !EXECUTABLE_SCRIPT_TYPES.has(normalizedType) || !body.trim()) {
        out += html.slice(i, endPos)
        i = endPos
        continue
      }

      const isModule = normalizedType === 'module'
      const scriptCode = isModule ? buildModuleLoaderCode(body) : body
      const blobUrl = createBlobUrl(scriptCode)
      if (!blobUrl) {
        out += html.slice(i, endPos)
        i = endPos
        continue
      }

      blobUrls.push(blobUrl)
      const keptAttrs = attrs
        .filter((attr) => {
          if (attr.name === 'src' || attr.name === 'nonce' || attr.name === 'integrity') {
            return false
          }
          if (isModule && attr.name === 'type') {
            return false
          }
          return true
        })
        .map((attr) =>
          attr.value === null ? attr.rawName : `${attr.rawName}="${escapeAttr(attr.value)}"`
        )
      if (isModule && !attrs.some((attr) => attr.name === 'defer')) {
        keptAttrs.push('defer')
      }
      const attrPrefix = keptAttrs.length > 0 ? ` ${keptAttrs.join(' ')}` : ''
      out += `<script${attrPrefix} src="${escapeAttr(blobUrl)}"></script>`
      i = endPos
      continue
    }

    const nextLt = html.indexOf('<', i + 1)
    if (nextLt === -1) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, nextLt)
    i = nextLt
  }

  return { html: out, blobUrls }
}

export function revokeBlobUrls(urls: readonly string[]): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return
  }
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignore already-revoked or invalid blob URLs during teardown.
    }
  }
}
