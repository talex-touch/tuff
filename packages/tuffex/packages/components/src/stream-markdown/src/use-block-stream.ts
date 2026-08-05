import type { Marked, Token, TokensList } from 'marked'
import type { StreamBlock } from './types'

export interface BlockStreamOptions {
  marked: Marked
  /**
   * Applied to every markup block's HTML before it is cached, so cached HTML
   * is always safe to hand to `v-html`. Identity when omitted. Swap by
   * calling `reset()` and re-updating — the stream never re-runs it on
   * blocks it considers stable.
   */
  sanitize?: (html: string) => string
}

export interface BlockStream {
  /** Feeds the full accumulated content and returns the renderable blocks. */
  update: (content: string) => StreamBlock[]
  /** Drops all cached state; the next update recomputes every block. */
  reset: () => void
}

interface Entry {
  id: number
  raw: string
  /** Null for `space` tokens — they take part in prefix comparison but never render. */
  block: StreamBlock | null
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/

/**
 * A fence is closed when a later line carries a run of the opening character
 * at least as long as the opening run. Indented code has no fence and
 * reports false; the component treats non-tail blocks as settled anyway.
 */
function isFenceClosed(raw: string): boolean {
  const open = FENCE_OPEN_RE.exec(raw)
  if (!open)
    return false

  const marker = open[1] ?? ''
  const close = new RegExp(`\\n {0,3}[${marker.charAt(0)}]{${marker.length},}[ \\t]*\\n?$`)
  return close.test(raw.slice(open[0].length))
}

/**
 * Reference-link definitions live in a lexer-global table: a `[ref]: url`
 * arriving late changes how an *earlier* paragraph renders without changing
 * that paragraph's `raw`. The fingerprint catches that and forces a re-parse
 * of otherwise-stable blocks.
 */
function fingerprintLinks(links: TokensList['links']): string {
  const keys = Object.keys(links)
  if (keys.length === 0)
    return ''

  keys.sort()
  return JSON.stringify(keys.map(key => [key, links[key]?.href ?? '', links[key]?.title ?? '']))
}

/**
 * Incremental block renderer for a growing markdown document.
 *
 * Comparison-driven rather than assumption-driven: every update re-lexes the
 * full content (cheap, token-only) and keeps the longest prefix of blocks
 * whose `raw` is unchanged — parse and sanitize run only on what actually
 * changed. Markdown constructs that rewrite earlier text (setext headings,
 * list continuation) break the prefix at the rewrite point and re-render
 * exactly the affected blocks.
 */
export function createBlockStream(options: BlockStreamOptions): BlockStream {
  const { marked } = options
  const sanitize = options.sanitize ?? ((html: string) => html)

  let entries: Entry[] = []
  let linksSalt = ''
  let seq = 0

  function renderToken(token: Token, id: number): StreamBlock | null {
    if (token.type === 'space')
      return null

    if (token.type === 'code') {
      const rawLang = typeof token.lang === 'string' ? token.lang : ''
      return {
        id,
        type: 'code',
        html: '',
        raw: token.raw,
        lang: rawLang.trim().split(/\s+/)[0]?.toLowerCase() ?? '',
        code: token.text,
        fenceClosed: isFenceClosed(token.raw),
      }
    }

    return {
      id,
      type: 'markup',
      html: sanitize(marked.parser([token])),
      raw: token.raw,
      lang: '',
      code: '',
      fenceClosed: true,
    }
  }

  function update(content: string): StreamBlock[] {
    const tokens = marked.lexer(content)
    const salt = fingerprintLinks(tokens.links)
    const saltChanged = salt !== linksSalt
    linksSalt = salt

    const next: Entry[] = []
    let mismatched = false

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!
      const prev = entries[index]

      if (!mismatched && prev && prev.raw === token.raw) {
        // Same source slice. Re-render only when the link table shifted under
        // it; identical output strings still leave the DOM untouched.
        next.push(saltChanged ? { id: prev.id, raw: prev.raw, block: renderToken(token, prev.id) } : prev)
        continue
      }

      // The first mismatch is the evolving tail (or a rewrite point), not a
      // brand-new block: it inherits the previous id so it keeps its DOM node
      // and never replays the reveal animation. Everything after it is new.
      const id = !mismatched && prev ? prev.id : ++seq
      mismatched = true
      next.push({ id, raw: token.raw, block: renderToken(token, id) })
    }

    entries = next
    return blocks()
  }

  function blocks(): StreamBlock[] {
    const result: StreamBlock[] = []
    for (const entry of entries) {
      if (entry.block)
        result.push(entry.block)
    }
    return result
  }

  function reset(): void {
    entries = []
    linksSalt = ''
  }

  return { update, reset }
}
