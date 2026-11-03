import type { MarkdownEditorHighlightColor } from './types'
import { atomSource, isPlaceholderBreak, REVEAL_ATTRIBUTE } from './source-map'
import { MARKDOWN_EDITOR_HIGHLIGHT_COLORS } from './types'

/**
 * DOM to Markdown for the rich surface: an edited block, or pasted HTML.
 *
 * Text typed into the contenteditable surface is literal, so any Markdown
 * punctuation in it is escaped on the way out — otherwise `a | b` in a table
 * cell re-emits as a column break, and `*text*` round-trips into emphasis the
 * user never asked for. `code` and `pre` are verbatim and never escaped.
 *
 * Atoms (formulas, images, emoji shortcodes, raw HTML) carry their exact source
 * in `data-md-src` and are written back as-is.
 */

export interface MarkdownSerializeOptions {
  /** Escape `$` so typed prices never open a formula. */
  math?: boolean
  /** `<mark>` is `==text==`, and `==` in text is escaped. */
  highlight?: boolean
}

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'UL',
])

/** Inline HTML that Markdown has no syntax for, kept as tags rather than dropped. */
const KEPT_INLINE_TAGS = new Set(['KBD', 'SUP', 'SUB', 'MARK', 'U', 'INS', 'SMALL'])

const EMPHASIS: Record<string, string> = {
  STRONG: '**',
  B: '**',
  EM: '*',
  I: '*',
  DEL: '~~',
  S: '~~',
  STRIKE: '~~',
}

const COLORS = new Set<string>(MARKDOWN_EDITOR_HIGHLIGHT_COLORS)

// Stands in for a hard line break while whitespace is normalized.
const BREAK = '\u0000'

interface InlineState {
  options: MarkdownSerializeOptions
  /** Nothing visible has been written on the current line yet. */
  lineStart: boolean
  /** How a `<br>` reads here: a line break, a space (headings), `<br>` (table cells). */
  breakAs: 'line' | 'space' | 'html'
  /** In the content of an `==` highlight, where `==` would end it. */
  inHighlight?: boolean
}

function inTableCell(state: InlineState): boolean {
  return state.breakAs === 'html'
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === 1
}

function isText(node: Node): node is Text {
  return node.nodeType === 3
}

function isBlockElement(node: Node): boolean {
  return isElement(node) && BLOCK_TAGS.has(node.tagName)
}

function rawOf(node: Node): string | null {
  return atomSource(node)
}

function plainText(node: Node): string {
  return (node.textContent ?? '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ')
}

/**
 * Escapes the runs of `=` in Markdown text that could open a highlight, or
 * close the one the text is `inside`. A run followed by a space opens
 * nothing; in a highlight only `==` after a space closes nothing.
 */
export function escapeHighlightRuns(text: string, inside = false): string {
  return text.replace(/\\[\s\S]|={2,}/g, (match: string, at: number) => {
    if (match[0] === '\\')
      return match
    const safe = inside
      ? match.length === 2 && /\s/.test(text.charAt(at - 1))
      : /\s/.test(text.charAt(at + match.length))
    return safe ? match : '\\='.repeat(match.length)
  })
}

/**
 * `==content==`, whitespace moved outside the delimiters and an `=` at
 * either edge of the content escaped: `===a==` would be `=` and a highlight.
 */
export function wrapHighlight(content: string): string {
  const lead = /^\s*/.exec(content)![0]
  const trail = /\s*$/.exec(content.slice(lead.length))![0]
  let core = content.slice(lead.length, content.length - trail.length)
  if (!core)
    return `${lead}${trail}`
  if (core.startsWith('='))
    core = `\\${core}`
  // An even run of backslashes before it escapes only themselves.
  if (/(?:^|[^\\])(?:\\\\)*=$/.test(core))
    core = `${core.slice(0, -1)}\\=`
  return `${lead}==${core}==${trail}`
}

/** The color of a `<mark>` other than the default yellow; null for yellow and unknown colors. */
export function markColor(el: Element): Exclude<MarkdownEditorHighlightColor, 'yellow'> | null {
  const color = el.getAttribute('data-color')
  return color && color !== 'yellow' && COLORS.has(color) ? color as Exclude<MarkdownEditorHighlightColor, 'yellow'> : null
}

function escapeText(value: string, state: InlineState): string {
  let out = value
    // Backslash first, or it would double-escape the escapes added below.
    .replace(/\\/g, '\\\\')
    // Between two letters or digits an underscore opens and closes no emphasis.
    .replace(/([`*[\]|~]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}]))/gu, '\\$1')
    // Would open inline HTML or an autolink.
    .replace(/<(?=[a-z/!?])/gi, '\\<')
    // Would read as an entity.
    .replace(/&(?=#?\w+;)/g, '\\&')
  if (state.options.math)
    out = out.replace(/\$(?=\S)/g, '\\$')
  if (state.options.highlight)
    out = escapeHighlightRuns(out, state.inHighlight)
  if (state.lineStart && !inTableCell(state)) {
    // Block markers only bite at the start of a line.
    out = out
      .replace(/^(\s*)([#>+=-])/, '$1\\$2')
      .replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3')
  }
  if (/\S/.test(out))
    state.lineStart = false
  return out
}

export function codeSpan(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') || (/^ .*\S.* $/.test(text)) ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

export function linkDestination(href: string): string {
  if (!/[\s<>()]/.test(href))
    return href
  return `<${href.replace(/[<>]/g, char => encodeURIComponent(char))}>`
}

function linkTitle(title: string | null): string {
  return title ? ` "${title.replace(/"/g, '\\"')}"` : ''
}

/** Moves the whitespace at the edges of an emphasis span outside its delimiters. */
function wrapEmphasis(content: string, delimiter: string): string {
  const lead = /^\s*/.exec(content)?.[0] ?? ''
  const trail = /\s*$/.exec(content.slice(lead.length))?.[0] ?? ''
  const core = content.slice(lead.length, content.length - trail.length)
  return core ? `${lead}${delimiter}${core}${delimiter}${trail}` : `${lead}${trail}`
}

/** The delimiters an element is written between, when Markdown has syntax for it. */
function delimiterOf(node: Node, state: InlineState): string | null {
  if (!isElement(node) || rawOf(node) !== null)
    return null
  if (node.tagName === 'MARK')
    return state.options.highlight && !markColor(node) ? '==' : null
  return EMPHASIS[node.tagName] ?? null
}

function serializeText(data: string, state: InlineState): string {
  return escapeText(data.replace(/\u200B/g, '').replace(/\u00A0/g, ' ').replace(/[ \t\r\n]+/g, ' '), state)
}

function serializeInlineNodes(nodes: ArrayLike<Node>, state: InlineState): string {
  let out = ''
  const list = Array.from(nodes)
  for (let index = 0; index < list.length; index++) {
    const node = list[index]!
    // Adjacent text is escaped as one: `a=` and `=b` are `a==b` together.
    if (isText(node)) {
      let data = node.data
      while (index + 1 < list.length && isText(list[index + 1]!))
        data += (list[++index] as Text).data
      out += serializeText(data, state)
      continue
    }
    // `<b>a</b><b>b</b>` would read as `**a****b**`; emit adjacent spans of
    // the same emphasis as one.
    const delimiter = delimiterOf(node, state)
    if (delimiter) {
      const run: Node[] = [...Array.from(node.childNodes)]
      while (index + 1 < list.length && delimiterOf(list[index + 1]!, state) === delimiter)
        run.push(...Array.from(list[++index]!.childNodes))
      const outer = state.inHighlight
      if (delimiter === '==')
        state.inHighlight = true
      const content = serializeInlineNodes(run, state)
      state.inHighlight = outer
      out += delimiter === '==' ? wrapHighlight(content) : wrapEmphasis(content, delimiter)
      continue
    }
    out += serializeInline(node, state)
  }
  return out
}

function serializeInline(node: Node, state: InlineState): string {
  if (isText(node))
    return serializeText(node.data, state)
  if (!isElement(node))
    return ''

  const raw = rawOf(node)
  if (raw !== null) {
    state.lineStart = false
    // marked unescapes `\|` before it lexes a cell, so an atom's source lost them.
    return inTableCell(state) ? raw.replace(/\|/g, '\\|') : raw
  }
  if (node.hasAttribute(REVEAL_ATTRIBUTE)) {
    // The Markdown the caret is editing: already source, escapes and all.
    const text = plainText(node)
    if (/\S/.test(text))
      state.lineStart = false
    // A pipe typed into it would end the cell; one already escaped is kept.
    return inTableCell(state) ? text.replace(/(\\*)\|/g, (match, slashes: string) => slashes.length % 2 ? match : `${slashes}\\|`) : text
  }

  const tag = node.tagName
  switch (tag) {
    case 'BR':
      if (isPlaceholderBreak(node))
        return ''
      state.lineStart = state.breakAs === 'line'
      return state.breakAs === 'line' ? BREAK : state.breakAs === 'html' ? '<br>' : ' '
    case 'CODE': {
      state.lineStart = false
      // GFM splits cells before it sees code spans, so a pipe in one still needs its escape.
      const text = plainText(node)
      return codeSpan(inTableCell(state) ? text.replace(/\|/g, '\\|') : text)
    }
    case 'A': {
      const href = node.getAttribute('href') ?? ''
      const text = serializeInlineNodes(node.childNodes, state)
      if (!href)
        return text
      const title = node.getAttribute('title')
      const label = plainText(node)
      if (!title && label === href && /^(?:https?:\/\/|www\.)[^\s<]+$/.test(href))
        return href
      if (!title && href.startsWith('mailto:') && label === href.slice(7))
        return `<${label}>`
      return `[${text}](${linkDestination(href)}${linkTitle(title)})`
    }
    case 'IMG': {
      const src = node.getAttribute('src') ?? ''
      if (!src)
        return ''
      state.lineStart = false
      const alt = (node.getAttribute('alt') ?? '').replace(/([[\]\\])/g, '\\$1')
      return `![${alt}](${linkDestination(src)}${linkTitle(node.getAttribute('title'))})`
    }
    case 'INPUT':
      return ''
    default:
      break
  }

  const inner = serializeInlineNodes(node.childNodes, state)
  if (KEPT_INLINE_TAGS.has(tag)) {
    const name = tag.toLowerCase()
    const color = tag === 'MARK' ? markColor(node) : null
    return inner ? `<${name}${color ? ` data-color="${color}"` : ''}>${inner}</${name}>` : ''
  }
  return inner
}

function finishInline(value: string): string {
  return value
    .split(BREAK)
    .map(line => line.trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

function serializeInlineContent(nodes: ArrayLike<Node>, options: MarkdownSerializeOptions, breakAs: InlineState['breakAs'] = 'line'): string {
  return finishInline(serializeInlineNodes(nodes, { options, lineStart: true, breakAs }))
}

/** Children as blocks: runs of inline nodes become paragraphs. */
function serializeBlocks(parent: Node, options: MarkdownSerializeOptions, separator = '\n\n'): string {
  const parts: string[] = []
  let run: Node[] = []
  const flush = () => {
    if (run.length) {
      const text = serializeInlineContent(run, options)
      if (text)
        parts.push(text)
    }
    run = []
  }
  for (const child of Array.from(parent.childNodes)) {
    if (isBlockElement(child)) {
      flush()
      const text = serializeBlockElement(child as HTMLElement, options)
      if (text)
        parts.push(text)
    }
    else {
      run.push(child)
    }
  }
  flush()
  return parts.join(separator)
}

function hasBlockChildren(el: Element): boolean {
  return Array.from(el.childNodes).some(isBlockElement)
}

function indentContinuation(text: string, width: number): string {
  const pad = ' '.repeat(width)
  return text.split('\n').map((line, index) => (index === 0 || !line ? line : `${pad}${line}`)).join('\n')
}

function serializeList(list: HTMLElement, options: MarkdownSerializeOptions): string {
  const ordered = list.tagName === 'OL'
  let number = ordered ? Number.parseInt(list.getAttribute('start') ?? '1', 10) : 1
  if (!Number.isFinite(number))
    number = 1

  // A list nested straight into a list (what `execCommand('indent')` builds)
  // belongs to the item before it.
  const items: Array<{ item: HTMLElement, nested: HTMLElement[] }> = []
  for (const child of Array.from(list.children) as HTMLElement[]) {
    if (child.tagName === 'LI')
      items.push({ item: child, nested: [] })
    else if ((child.tagName === 'UL' || child.tagName === 'OL') && items.length)
      items[items.length - 1]!.nested.push(child)
  }

  const loose = items.some(({ item }) => Array.from(item.children).some(child => child.tagName === 'P'))
  // A bare `-` under an item's text underlines it into a setext heading; `*`
  // cannot. A list keeps one bullet character or it splits in two.
  const first = items[0]?.item
  const nested = /^(?:LI|OL|UL)$/.test(list.parentElement?.tagName ?? '')
  const bullet = !ordered && nested && first && !serializeBlocks(first, options, '\n').trim() ? '*' : '-'
  return items.map(({ item, nested }) => {
    const marker = ordered ? `${number++}.` : bullet
    const box = item.querySelector<HTMLInputElement>(':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]')
    const task = box ? (box.checked ? '[x] ' : '[ ] ') : ''
    const parts = [serializeBlocks(item, options, loose ? '\n\n' : '\n'), ...nested.map(child => serializeList(child, options))]
      .filter(Boolean)
    const body = parts.join(loose ? '\n\n' : '\n')
    return indentContinuation(`${marker} ${task}${body}`.trimEnd(), marker.length + 1)
  }).join(loose ? '\n\n' : '\n')
}

function cellAlignment(cell: Element): string {
  const align = (cell.getAttribute('align') ?? (cell as HTMLElement).style?.textAlign ?? '').toLowerCase()
  if (align === 'center')
    return ':---:'
  if (align === 'right')
    return '---:'
  if (align === 'left')
    return ':---'
  return '---'
}

function serializeTable(table: HTMLTableElement, options: MarkdownSerializeOptions): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table)
  if (!rows.length)
    return ''
  const matrix = rows.map(row => Array.from(row.children).map(cell =>
    serializeInlineContent(cell.childNodes, options, 'html').replace(/\n/g, ' ')))
  const header = rows[0]!
  const width = Math.max(...matrix.map(row => row.length), 1)
  const delimiter = Array.from({ length: width }, (_, index) => {
    const cell = header.children[index]
    return cell ? cellAlignment(cell) : '---'
  })
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
  return [line(matrix[0]!), line(delimiter), ...matrix.slice(1).map(line)].join('\n')
}

function serializeCodeBlock(pre: HTMLElement): string {
  const code = pre.querySelector('code') ?? pre
  const language = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className)?.[1] ?? ''
  // marked ends every block with a newline the source does not have.
  const text = (code.textContent ?? '').replace(/\u200B/g, '').replace(/\n$/, '')
  const longest = Math.max(0, ...Array.from(text.matchAll(/^`{3,}/gm), match => match[0].length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${text}\n${fence}`
}

function serializeBlockElement(el: HTMLElement, options: MarkdownSerializeOptions): string {
  const raw = rawOf(el)
  if (raw !== null)
    return raw

  const tag = el.tagName
  if (/^H[1-6]$/.test(tag)) {
    const text = serializeInlineContent(el.childNodes, options, 'space')
    // An emptied heading is still one: the caret is in it, and `#` renders it.
    const marker = '#'.repeat(Number(tag.slice(1)))
    return text ? `${marker} ${text}` : marker
  }

  switch (tag) {
    case 'UL':
    case 'OL':
      return serializeList(el, options)
    case 'PRE':
      return serializeCodeBlock(el)
    case 'TABLE':
      return serializeTable(el as HTMLTableElement, options)
    case 'HR':
      return '---'
    case 'BLOCKQUOTE': {
      const body = serializeBlocks(el, options)
      return body ? body.split('\n').map(line => (line ? `> ${line}` : '>')).join('\n') : '>'
    }
    case 'LI':
      return `- ${serializeBlocks(el, options, '\n')}`.trimEnd()
    default:
      return hasBlockChildren(el) ? serializeBlocks(el, options) : serializeInlineContent(el.childNodes, options)
  }
}

/** One top-level block of the surface, without the newlines that end it. */
export function serializeMarkdownBlock(el: Element, options: MarkdownSerializeOptions = {}): string {
  if (isBlockElement(el) || rawOf(el) !== null)
    return serializeBlockElement(el as HTMLElement, options)
  return serializeInlineContent([el], options)
}

export function serializeMarkdown(root: Element, options: MarkdownSerializeOptions = {}): string {
  return serializeBlocks(root, options).replace(/\n{3,}/g, '\n\n').trim()
}
