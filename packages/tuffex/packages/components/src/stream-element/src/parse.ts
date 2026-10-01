import type { Token, Tokens } from 'marked'
import type { AiSourceItem } from '../../ai-elements/src/types'
import type { StreamInline, StreamMark } from '../../stream-text/src/types'
import type { StreamListItem, StreamPart } from './types'
import { Marked } from 'marked'
import { completeInlineMarkup } from '../../stream-markdown/src/complete-inline-markup'
import { mathExtension } from '../../stream-markdown/src/math-extension'

// One lexer for every element; it keeps nothing between calls. Math is
// registered so `$…$` and `$$…$$` are recognised, and handed on whole.
const markdown = new Marked({ gfm: true }).use(mathExtension())

/** Inline tokens the element does not render itself: their paragraph is delegated whole. */
const DELEGATED_INLINE = new Set(['image', 'mathInline', 'html'])
const CITATION = /\[(\d+)\]/g

export interface ParseOptions {
  /**
   * The source is still producing: a half-written construct at the end is
   * closed first (`completeInlineMarkup`), so `**bold` never flashes its
   * asterisks. Settled content is parsed exactly as written.
   */
  streaming?: boolean
  /** Resolves `[n]` in text: `sources[n - 1]`. */
  sources?: readonly AiSourceItem[]
}

/**
 * Markdown into the parts a `TxStreamElement` renders. Headings, paragraphs,
 * emphasis, inline code, links, lists (nested, task), quotes, rules and fenced
 * code become native parts; tables, math, mermaid, raw HTML and images go,
 * with their delegated neighbours, into one `markdown` part.
 */
export function parseStreamMarkdown(content: string, options: ParseOptions = {}): StreamPart[] {
  const source = options.streaming ? completeInlineMarkup(content) : content
  return blockParts(markdown.lexer(source), options.sources ?? [], false)
}

function blockParts(tokens: Token[] | undefined, sources: readonly AiSourceItem[], tight: boolean): StreamPart[] {
  const parts: StreamPart[] = []
  let delegated: string[] = []
  const flush = (): void => {
    if (delegated.length > 0)
      parts.push({ type: 'markdown', raw: delegated.join('') })
    delegated = []
  }
  for (const token of tokens ?? []) {
    if (token.type === 'space') {
      // Keeps delegated blocks apart, as the source did.
      if (delegated.length > 0)
        delegated.push(token.raw)
      continue
    }
    if (token.type === 'def' || token.type === 'checkbox')
      continue
    const part = nativePart(token, sources, tight)
    if (part) {
      flush()
      parts.push(part)
    }
    else {
      delegated.push(token.raw)
    }
  }
  flush()
  return parts
}

function nativePart(token: Token, sources: readonly AiSourceItem[], tight: boolean): StreamPart | null {
  switch (token.type) {
    case 'heading': {
      const heading = token as Tokens.Heading
      if (hasDelegatedInline(heading.tokens))
        return null
      const depth = Math.min(6, Math.max(1, heading.depth)) as 1 | 2 | 3 | 4 | 5 | 6
      return { type: 'heading', depth, inlines: inlines(heading.tokens, sources) }
    }
    case 'paragraph':
    case 'text': {
      const block = token as Tokens.Paragraph | Tokens.Text
      if (hasDelegatedInline(block.tokens))
        return null
      const content = block.tokens?.length ? inlines(block.tokens, sources) : textInlines(block.text, [], undefined, sources)
      // A tight list item's line is a `text` token: no paragraph margins.
      return token.type === 'text' && tight
        ? { type: 'paragraph', inlines: content, tight: true }
        : { type: 'paragraph', inlines: content }
    }
    case 'list': {
      const list = token as Tokens.List
      const start = typeof list.start === 'number' ? list.start : undefined
      return {
        type: 'list',
        ordered: list.ordered,
        ...(list.ordered && start !== undefined ? { start } : {}),
        items: list.items.map(item => listItem(item, sources)),
      }
    }
    case 'blockquote':
      return { type: 'quote', parts: blockParts((token as Tokens.Blockquote).tokens, sources, false) }
    case 'hr':
      return { type: 'rule' }
    case 'code': {
      const code = token as Tokens.Code
      const lang = code.lang?.trim().split(/\s+/)[0]?.toLowerCase() || undefined
      // A diagram is TxStreamMarkdown's to draw.
      if (lang === 'mermaid')
        return null
      return { type: 'code', ...(lang ? { lang } : {}), code: code.text }
    }
    default:
      return null
  }
}

function listItem(item: Tokens.ListItem, sources: readonly AiSourceItem[]): StreamListItem {
  return {
    ...(item.task ? { checked: Boolean(item.checked) } : {}),
    parts: blockParts(item.tokens, sources, true),
  }
}

function hasDelegatedInline(tokens: Token[] | undefined): boolean {
  return Boolean(tokens?.some(token =>
    DELEGATED_INLINE.has(token.type)
    || ('tokens' in token && hasDelegatedInline((token as { tokens?: Token[] }).tokens)),
  ))
}

function withMark(marks: StreamMark[], mark: StreamMark): StreamMark[] {
  return marks.includes(mark) ? marks : [...marks, mark]
}

/** Inline tokens into stream inlines; `[n]` becomes a citation only in plain text, never in code or link text. */
function inlines(
  tokens: Token[] | undefined,
  sources: readonly AiSourceItem[],
  marks: StreamMark[] = [],
  href?: string,
  cite = true,
): StreamInline[] {
  const out: StreamInline[] = []
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text': {
        const text = token as Tokens.Text
        if (text.tokens?.length)
          out.push(...inlines(text.tokens, sources, marks, href, cite))
        else
          out.push(...textInlines(text.text, marks, href, cite ? sources : []))
        break
      }
      case 'strong':
      case 'em':
      case 'del':
        out.push(...inlines((token as Tokens.Strong).tokens, sources, withMark(marks, token.type), href, cite))
        break
      case 'codespan':
        out.push(...textInlines((token as Tokens.Codespan).text, withMark(marks, 'code'), href, []))
        break
      case 'link': {
        const link = token as Tokens.Link
        out.push(...inlines(link.tokens, sources, marks, link.href, false))
        break
      }
      case 'br':
        out.push(...textInlines(' ', marks, href, []))
        break
      case 'escape':
        out.push(...textInlines((token as Tokens.Escape).text, marks, href, []))
        break
      default:
        out.push(...textInlines(token.raw, marks, href, []))
    }
  }
  return out
}

function textInlines(text: string, marks: StreamMark[], href: string | undefined, sources: readonly AiSourceItem[]): StreamInline[] {
  if (!text)
    return []
  const style = { ...(marks.length > 0 ? { marks } : {}), ...(href ? { href } : {}) }
  if (sources.length === 0)
    return [{ type: 'text', text, ...style }]
  const out: StreamInline[] = []
  let last = 0
  for (const match of text.matchAll(CITATION)) {
    const index = Number(match[1])
    const source = index >= 1 ? sources[index - 1] : undefined
    // An unresolvable marker stays the text it was.
    if (!source)
      continue
    const at = match.index ?? 0
    if (at > last)
      out.push({ type: 'text', text: text.slice(last, at), ...style })
    out.push({ type: 'citation', source, index })
    last = at + match[0].length
  }
  if (last < text.length)
    out.push({ type: 'text', text: text.slice(last), ...style })
  return out
}
