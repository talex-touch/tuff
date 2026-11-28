export interface ParsedQuotedUserMessage {
  /** Original file path header inside backticks, e.g. `无名.md` or `docs/story.md`. */
  sourcePath?: string
  /** Display filename derived from `sourcePath`, e.g. `无名.md`. */
  sourceName?: string
  /** Short uppercase file-type badge for `TxContextChunk`, e.g. `MD`, `TS`, `HTML`. */
  badge?: string
  /** Cleaned quote excerpt with leading `>` blockquote prefixes stripped. */
  quoteText: string
  /** Trailing user instruction after the quote block (may be empty for quote-only messages). */
  prompt: string
  /** Character count of the unquoted excerpt (excluding surrounding whitespace). */
  charCount: number
}

const BACKTICK_PATH_LINE_RE = /^`([^`\r\n]{1,260})`$/
const QUOTE_LINE_RE = /^\s*>\s?(.*)$/

function extractBasename(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function extractFileBadge(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot >= name.length - 1) return undefined
  const ext = name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '')
  if (!ext || ext.length > 5) return undefined
  return ext.toUpperCase()
}

/**
 * Parses user chat messages formatted by `WorkspaceFileViewer` selection/improve actions
 * (`` `path`\n> excerpt\n\ninstruction ``) or transcript passage quoting (`> excerpt\n\ninstruction`)
 * so `HomeMessageRow` can render the quoted passage via TuffEx's `TxContextChunk` card.
 *
 * Plain messages without a leading blockquote return `null` and keep exact plain-text rendering.
 */
export function parseQuotedUserMessage(raw: string): ParsedQuotedUserMessage | null {
  if (!raw || !raw.includes('>')) return null
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const lines = normalized.split('\n')
  let cursor = 0
  let sourcePath: string | undefined

  const firstLine = lines[0]?.trim() ?? ''
  const pathMatch = BACKTICK_PATH_LINE_RE.exec(firstLine)
  if (pathMatch?.[1]?.trim()) {
    const candidate = pathMatch[1].trim()
    // Only treat the leading backtick line as a quote source header when a blockquote immediately follows.
    let probe = 1
    while (probe < lines.length && lines[probe]!.trim() === '') {
      probe += 1
    }
    if (probe < lines.length && QUOTE_LINE_RE.test(lines[probe]!)) {
      sourcePath = candidate
      cursor = probe
    }
  }

  if (cursor >= lines.length || !QUOTE_LINE_RE.test(lines[cursor]!)) {
    return null
  }

  const quoteLines: string[] = []
  while (cursor < lines.length) {
    const match = QUOTE_LINE_RE.exec(lines[cursor]!)
    if (!match) break
    quoteLines.push(match[1] ?? '')
    cursor += 1
  }

  const quoteText = quoteLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!quoteText) return null

  // Skip blank separator lines between the quote block and trailing user prompt.
  while (cursor < lines.length && lines[cursor]!.trim() === '') {
    cursor += 1
  }

  const prompt = lines.slice(cursor).join('\n').trim()
  const sourceName = sourcePath ? extractBasename(sourcePath) : undefined
  const badge = sourceName ? extractFileBadge(sourceName) : undefined

  return {
    ...(sourcePath ? { sourcePath } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(badge ? { badge } : {}),
    quoteText,
    prompt,
    charCount: quoteText.length
  }
}
