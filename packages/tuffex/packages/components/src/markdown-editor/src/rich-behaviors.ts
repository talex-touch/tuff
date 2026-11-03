import type { MarkdownEditorSelection, MarkdownTextChange } from './types'
import type { CaretPoint, RichCommand, RichSurface } from './rich-surface'
import DOMPurify from 'dompurify'
import { looksLikeInlineMath } from '../../../../utils/markdown-math-syntax'
import { CALLOUT_CLASS, CALLOUT_MARKER, CALLOUT_TITLE_CLASS } from './markdown-callout'
import { formatMarkdown, indentMarkdownList } from './markdown-format'
import { codeSpan, serializeMarkdown } from './markdown-serializer'
import { isPlaceholderBreak } from './source-map'
import { mapMarkdownPosition } from './text-changes'

/**
 * Everything the rich surface does on top of plain typing: Markdown
 * shortcuts, keys whose browser default would build structure Markdown cannot
 * hold, the clipboard and drops, task checkboxes. Where the result must be
 * exact it is edited in the source and re-rendered; small DOM-only states
 * (a new task item before it has text) are built in the DOM and serialized.
 */

const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
const INLINE_FORMATTING = new Set(['A', 'B', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'S', 'SMALL', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'U'])

interface InlineRule {
  pattern: RegExp
  kind: 'wrap' | 'highlight' | 'code' | 'math' | 'emoji'
}

// Each matches the text before the caret ending in the closing delimiter just
// typed; the groups are opening delimiter, content, closing delimiter.
const INLINE_RULES: InlineRule[] = [
  { pattern: /(?:^|[^*\\])(\*\*)([^*\s](?:[^*]*?[^*\s])?)(\*\*)$/, kind: 'wrap' },
  { pattern: /(?:^|[^_\\\w])(__)([^_\s](?:[^_]*?[^_\s])?)(__)$/, kind: 'wrap' },
  { pattern: /(?:^|[^*\\])(\*)([^*\s](?:[^*]*?[^*\s])?)(\*)$/, kind: 'wrap' },
  { pattern: /(?:^|[^_\\\w])(_)([^_\s](?:[^_]*?[^_\s])?)(_)$/, kind: 'wrap' },
  { pattern: /(?:^|[^~\\])(~~)([^~\s](?:[^~]*?[^~\s])?)(~~)$/, kind: 'wrap' },
  { pattern: /(?:^|[^=\\])(==)([^=\s](?:[^=]*?[^=\s])?)(==)$/, kind: 'highlight' },
  { pattern: /(?:^|[^`\\])(`)([^`]+)(`)$/, kind: 'code' },
  { pattern: /(?:^|[^$\\])(\$)([^$]+)(\$)$/, kind: 'math' },
  { pattern: /(?:^|[\s(])(:)([a-z0-9_+-]{1,40})(:)$/, kind: 'emoji' },
]

function isElement(node: Node | null | undefined): node is HTMLElement {
  return !!node && node.nodeType === 1
}

function isText(node: Node | null | undefined): node is Text {
  return !!node && node.nodeType === 3
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

function caret(pos: number): MarkdownEditorSelection {
  return { anchor: pos, head: pos }
}

function collapse(surface: RichSurface, node: Node, offset: number): void {
  try {
    surface.root.ownerDocument.getSelection()?.collapse(node, offset)
  }
  catch {}
}

/** Visible text, without step-out spaces; non-breaking spaces read as spaces. */
function plain(text: string): string {
  return text.replace(/\u200B/g, '').replace(/\u00A0/g, ' ')
}

function textBetween(surface: RichSurface, start: [Node, number], end: [Node, number]): string {
  const range = surface.root.ownerDocument.createRange()
  range.setStart(start[0], start[1])
  range.setEnd(end[0], end[1])
  return plain(range.toString())
}

function checkbox(surface: RichSurface, checked: boolean): HTMLInputElement {
  const box = surface.root.ownerDocument.createElement('input')
  box.type = 'checkbox'
  box.className = 'tx-markdown-editor__checkbox'
  box.checked = checked
  box.tabIndex = -1
  box.disabled = !surface.checkable
  return box
}

// ---------------------------------------------------------------------------
// Markdown shortcuts while typing
// ---------------------------------------------------------------------------

export function applyTypingRules(surface: RichSurface, event: InputEvent): void {
  if (event.inputType !== 'insertText' || !event.data)
    return
  const char = event.data.slice(-1)
  if (char === ' ' || char === '\u00A0')
    blockRule(surface)
  else if (char !== ']' || !calloutRule(surface))
    inlineRule(surface)
}

/** `# `, `- `, `1. `, `> ` at the start of a paragraph; `[ ] ` at the start of a bullet item. */
function blockRule(surface: RichSurface): boolean {
  const point = surface.caretPoint()
  if (!point || !isText(point.node))
    return false
  const block = surface.closest(point.node, ['P', 'LI'])
  if (!block)
    return false
  const typed = textBetween(surface, [block, 0], [point.node, point.offset])
  const rest = textBetween(surface, [point.node, point.offset], [block, block.childNodes.length]).trim()

  if (block.tagName === 'LI') {
    const match = /^\[([ xX]?)\] $/.exec(typed)
    if (!match || block.parentElement?.tagName !== 'UL' || block.querySelector(':scope > input, :scope > p > input'))
      return false
    // `- [ ]` with nothing after it is not a task in Markdown, so the box
    // exists in the DOM until text follows it.
    const range = surface.root.ownerDocument.createRange()
    range.setStart(block, 0)
    range.setEnd(point.node, point.offset)
    range.deleteContents()
    const space = surface.root.ownerDocument.createTextNode(' ')
    block.prepend(checkbox(surface, /x/i.test(match[1] ?? '')), space)
    block.classList.add('tx-markdown-editor__task')
    collapse(surface, space, 1)
    surface.reconcile('rule')
    return true
  }

  if (block.parentNode !== surface.root)
    return false
  const match = /^(#{1,6}|[-*+]|\d{1,9}[.)]|>) $/.exec(typed)
  if (!match)
    return false
  const marker = match[1]!
  const from = surface.view.domToSource(block, 0, 1)
  const to = surface.view.domToSource(point.node, point.offset, 1)
  // An empty item is a bare `-`: marked reads `- ` alone as a paragraph.
  const insert = marker.startsWith('#') || rest ? `${marker} ` : marker
  surface.commit([{ from, to, insert }], caret(from + insert.length), 'rule')
  return true
}

/** `[!NOTE]` and the other markers, alone on the first line of a top-level quote: a callout. */
function calloutRule(surface: RichSurface): boolean {
  const point = surface.caretPoint()
  if (!surface.options.callouts || !point || !isText(point.node))
    return false
  const paragraph = surface.closest(point.node, ['P'])
  const quote = paragraph?.parentElement
  if (!paragraph || quote?.tagName !== 'BLOCKQUOTE' || quote.parentNode !== surface.root || quote.firstElementChild !== paragraph)
    return false
  const typed = textBetween(surface, [paragraph, 0], [point.node, point.offset])
  if (!CALLOUT_MARKER.test(typed))
    return false
  const view = surface.view
  const from = view.domToSource(paragraph, 0, 1)
  const to = view.domToSource(point.node, point.offset, -1)
  // Typed in front of text on the same line, it is that line's text.
  const lineEnd = view.doc.indexOf('\n', to)
  if (view.doc.slice(to, lineEnd < 0 ? view.doc.length : lineEnd).trim())
    return false
  const marker = typed.trim()
  surface.commit([{ from, to, insert: marker }], caret(from + marker.length), 'rule')
  return true
}

/** `**bold**`, `*em*`, `~~del~~`, `==mark==`, `` `code` ``, `$tex$`, `:emoji:` as the closing delimiter is typed. */
function inlineRule(surface: RichSurface): boolean {
  const point = surface.caretPoint()
  if (!point || !isText(point.node) || surface.closest(point.node, ['CODE', 'PRE']))
    return false
  const node = point.node
  const text = node.data.slice(0, point.offset)
  for (const rule of INLINE_RULES) {
    const match = rule.pattern.exec(text)
    if (!match)
      continue
    const [whole, open = '', content = '', close = ''] = match
    const openStart = match.index + whole.length - open.length - content.length - close.length
    const view = surface.view
    const from = view.domToSource(node, openStart, 1)
    const to = view.domToSource(node, point.offset, -1)
    let changes: MarkdownTextChange[]
    if (rule.kind === 'highlight' && !surface.options.highlight)
      continue
    if (rule.kind === 'wrap' || rule.kind === 'highlight') {
      const openEnd = view.domToSource(node, openStart + open.length, -1)
      const closeFrom = view.domToSource(node, point.offset - close.length, 1)
      changes = [{ from, to: openEnd, insert: open }, { from: closeFrom, to, insert: close }]
    }
    else if (rule.kind === 'code') {
      changes = [{ from, to, insert: codeSpan(content) }]
    }
    else if (rule.kind === 'math') {
      if (!surface.options.math || !looksLikeInlineMath(content))
        continue
      changes = [{ from, to, insert: `$${content}$` }]
    }
    else {
      const emoji = surface.options.emoji()?.get(content)
      if (!emoji)
        continue
      if (emoji.src) {
        surface.rerenderBlock(node, caret(to))
        return true
      }
      changes = [{ from, to, insert: emoji.char }]
    }
    const end = mapMarkdownPosition(to, changes, 1)
    surface.commit(changes, caret(end), 'rule')
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function shortcut(key: string, shift: boolean, mac: boolean): RichCommand | null {
  switch (key) {
    case 'z':
      return shift ? 'redo' : 'undo'
    case 'y':
      return mac ? null : 'redo'
    case 'b':
      return 'bold'
    case 'i':
      return 'italic'
    case 'k':
      return 'link'
    case 'e':
      return 'code'
    case 'x':
      return shift ? 'strike' : null
    case 'h':
      return shift ? 'highlight' : null
    default:
      return null
  }
}

export function handleRichKeydown(surface: RichSurface, event: KeyboardEvent): void {
  if (surface.host.onKeydown(event)) {
    event.preventDefault()
    return
  }
  if (event.isComposing || event.keyCode === 229)
    return
  const mac = isMac()
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (mod && !event.altKey) {
    const command = shortcut(event.key.toLowerCase(), event.shiftKey, mac)
    if (command) {
      event.preventDefault()
      surface.host.onCommand(command)
      return
    }
  }
  if (mod && event.altKey) {
    const digit = /^Digit([0-6])$/.exec(event.code)?.[1]
    if (digit !== undefined) {
      event.preventDefault()
      surface.host.onCommand(`heading${digit}` as RichCommand)
      return
    }
    if (event.code === 'KeyM') {
      event.preventDefault()
      surface.host.onCommand('comment')
      return
    }
  }
  if (!surface.editable || event.altKey)
    return
  // A line break goes into the rendered block, not into the Markdown the caret is showing.
  if (event.key === 'Enter')
    surface.reveal.conceal()
  let handled = false
  if (event.key === 'Enter')
    handled = mod ? breakOut(surface) : onEnter(surface, event.shiftKey)
  else if (event.key === 'Backspace' && !mod && !event.shiftKey)
    handled = onBackspace(surface)
  else if (event.key === 'Tab' && !mod)
    handled = onTab(surface, event.shiftKey)
  else if (event.key === 'ArrowRight' && !mod && !event.shiftKey)
    handled = stepOutRight(surface)
  if (handled)
    event.preventDefault()
}

/** Mod+Enter: a new paragraph after the current block, whatever it is. */
function breakOut(surface: RichSurface): boolean {
  const anchor = surface.root.ownerDocument.getSelection()?.anchorNode ?? null
  const top = surface.view.topElement(anchor)
  if (!top)
    return false
  surface.flush()
  const p = surface.emptyParagraph()
  top.after(p)
  surface.reconcile('structure')
  collapse(surface, p, 0)
  return true
}

function paragraphAfterItemAt(surface: RichSurface, pos: number): void {
  const item = surface.view.sourceToDom(pos).item
  if (!item)
    return
  const p = surface.emptyParagraph()
  item.el.after(p)
  surface.reconcile('structure')
  collapse(surface, p, 0)
}

function onEnter(surface: RichSurface, shift: boolean): boolean {
  const point = surface.caretPoint()
  if (!point)
    return false
  const view = surface.view
  if (surface.closest(point.node, ['PRE'])) {
    // Code is literal: a newline with this line's indent, never a new paragraph.
    surface.flush()
    const pos = view.domToSource(point.node, point.offset, 1)
    const doc = view.doc
    const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
    const insert = `\n${/^[ \t]*/.exec(doc.slice(lineStart, pos))![0]}`
    surface.commit([{ from: pos, to: pos, insert }], caret(pos + insert.length), 'input')
    return true
  }
  if (shift)
    return false
  const cell = surface.closest(point.node, ['TD', 'TH'])
  if (cell)
    return insertTableRow(surface, cell)

  const paragraph = surface.closest(point.node, ['P'])
  const text = paragraph ? plain(paragraph.textContent ?? '').trim() : ''
  if (paragraph && paragraph.parentNode === surface.root) {
    surface.flush()
    const item = view.itemAt(paragraph)
    if (item?.raw) {
      const start = view.startOf(item)
      const end = start + item.raw.length
      const fence = /^(`{3,}|~{3,})([\w+#.-]*)$/.exec(text)
      if (fence) {
        const insert = `${fence[1]}${fence[2]}\n\n${fence[1]}`
        surface.commit([{ from: start, to: end, insert }], caret(start + fence[1]!.length + fence[2]!.length + 1), 'rule')
        return true
      }
      if (surface.options.math && text === '$$') {
        surface.commit([{ from: start, to: end, insert: '' }], caret(start), 'rule')
        surface.host.onCommand('math')
        return true
      }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) {
        surface.commit([{ from: start, to: end, insert: '---' }], null, 'rule')
        paragraphAfterItemAt(surface, start)
        return true
      }
    }
  }

  if (paragraph && afterCalloutTitle(surface, paragraph, point))
    return surface.root.ownerDocument.execCommand('insertLineBreak')

  // The last, empty paragraph of a quote leaves it.
  const quote = paragraph?.parentElement
  if (paragraph && !text && quote?.tagName === 'BLOCKQUOTE' && !paragraph.nextElementSibling) {
    const top = view.topElement(quote)
    if (top) {
      paragraph.remove()
      const p = surface.emptyParagraph()
      if (!quote.firstElementChild && quote === top)
        top.replaceWith(p)
      else
        top.after(p)
      surface.reconcile('structure')
      collapse(surface, p, 0)
      return true
    }
  }

  const li = surface.closest(point.node, ['LI'])
  if (li?.classList.contains('tx-markdown-editor__task'))
    return enterTask(surface, li, point)
  return false
}

/**
 * The caret just after a callout's title, with nothing else in its paragraph.
 * Enter there starts the callout's text on the next line, the way
 * `> [!NOTE]\n> text` reads, rather than in a paragraph of its own.
 */
function afterCalloutTitle(surface: RichSurface, paragraph: HTMLElement, point: CaretPoint): boolean {
  const quote = paragraph.parentElement
  const title = paragraph.firstElementChild
  if (!quote?.classList.contains(CALLOUT_CLASS) || quote.firstElementChild !== paragraph || !title?.classList.contains(CALLOUT_TITLE_CLASS))
    return false
  const range = surface.root.ownerDocument.createRange()
  range.setStartAfter(title)
  range.setEnd(paragraph, paragraph.childNodes.length)
  if (!range.isPointInRange(point.node, point.offset) || plain(range.toString()).trim() || range.cloneContents().querySelector('img, input, [data-md-atom]'))
    return false
  range.setEnd(point.node, point.offset)
  return !range.cloneContents().querySelector('br')
}

/** Enter in a task item: the next item gets a box too. An empty one ends the list like any empty item. */
function enterTask(surface: RichSurface, li: HTMLElement, point: CaretPoint): boolean {
  const doc = surface.root.ownerDocument
  const box = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')
  const nested = Array.from(li.children).find(child => child.tagName === 'UL' || child.tagName === 'OL') ?? null
  const own = Array.from(li.childNodes).filter(node => node !== box && node !== nested)
  const empty = !own.some(node => plain(node.textContent ?? '').trim()) && !li.querySelector(':scope img, :scope [data-md-atom]')
  surface.flush()
  if (empty) {
    // The browser's Enter in an empty item ends the list; let it, without the box.
    box?.remove()
    li.classList.remove('tx-markdown-editor__task')
    for (const node of own)
      node.parentNode?.removeChild(node)
    const br = doc.createElement('br')
    li.insertBefore(br, nested)
    collapse(surface, li, 0)
    return false
  }
  const range = doc.createRange()
  range.setStart(point.node, point.offset)
  if (nested)
    range.setEndBefore(nested)
  else
    range.setEnd(li, li.childNodes.length)
  const tail = range.extractContents()
  const next = doc.createElement('li')
  next.className = 'tx-markdown-editor__task'
  const space = doc.createTextNode(' ')
  next.append(checkbox(surface, false), space, tail)
  if (!plain(next.textContent ?? '').trim() && !next.querySelector('img, [data-md-atom]'))
    next.append(doc.createElement('br'))
  li.after(next)
  surface.reconcile('structure')
  collapse(surface, space, 1)
  return true
}

function onBackspace(surface: RichSurface): boolean {
  const point = surface.caretPoint()
  if (!point)
    return false
  const heading = surface.closest(point.node, HEADINGS)
  if (!heading || heading.parentNode !== surface.root)
    return false
  if (textBetween(surface, [heading, 0], [point.node, point.offset]))
    return false
  surface.flush()
  const item = surface.view.itemAt(heading)
  if (!item)
    return false
  // At the start of a heading Backspace drops the heading, not the line break before it.
  if (!plain(heading.textContent ?? '').trim()) {
    const p = surface.emptyParagraph()
    heading.replaceWith(p)
    surface.reconcile('structure')
    collapse(surface, p, 0)
    return true
  }
  const prefix = /^ {0,3}#{1,6}[ \t]*/.exec(item.raw)?.[0]
  if (!prefix)
    return false
  const start = surface.view.startOf(item)
  surface.commit([{ from: start, to: start + prefix.length, insert: '' }], caret(start), 'structure')
  return true
}

function onTab(surface: RichSurface, outdent: boolean): boolean {
  const selection = surface.root.ownerDocument.getSelection()
  const anchor = selection?.anchorNode ?? null
  if (!anchor || !surface.root.contains(anchor))
    return false
  if (surface.closest(anchor, ['PRE'])) {
    surface.flush()
    const current = surface.getSelection()
    if (!current)
      return true
    const doc = surface.view.doc
    const pos = Math.min(current.anchor, current.head)
    const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
    if (outdent) {
      const spaces = /^ {1,2}/.exec(doc.slice(lineStart))?.[0].length ?? 0
      if (spaces)
        surface.commit([{ from: lineStart, to: lineStart + spaces, insert: '' }], caret(Math.max(lineStart, pos - spaces)), 'input')
      return true
    }
    surface.commit([{ from: pos, to: Math.max(current.anchor, current.head), insert: '  ' }], caret(pos + 2), 'input')
    return true
  }
  const cell = surface.closest(anchor, ['TD', 'TH'])
  if (cell)
    return moveCell(surface, cell, outdent ? -1 : 1)
  if (surface.closest(anchor, ['LI'])) {
    surface.flush()
    const current = surface.getSelection()
    const result = current ? indentMarkdownList(surface.view.doc, current, outdent ? -1 : 1) : null
    if (result)
      surface.commit(result.changes, result.selection, 'structure')
    return true
  }
  return false
}

function moveCell(surface: RichSurface, cell: HTMLElement, direction: 1 | -1): boolean {
  const table = cell.closest('table')
  const cells = table ? Array.from(table.querySelectorAll<HTMLElement>('th, td')) : []
  const next = cells[cells.indexOf(cell) + direction]
  if (!next)
    return direction > 0 ? insertTableRow(surface, cell) : true
  const selection = surface.root.ownerDocument.getSelection()
  const range = surface.root.ownerDocument.createRange()
  range.selectNodeContents(next)
  if (!plain(next.textContent ?? '').trim())
    range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  return true
}

/** Enter in a cell, or Tab in the last one: a new row under this one. */
function insertTableRow(surface: RichSurface, cell: HTMLElement): boolean {
  surface.flush()
  const table = cell.closest('table')
  const row = cell.closest('tr')
  // Rows are source lines only in a top-level table; nested ones carry quote or list prefixes.
  const item = table?.parentNode === surface.root ? surface.view.itemAt(table) : null
  if (!table || !row || !item?.raw)
    return true
  const rows = Array.from(table.querySelectorAll('tr'))
  const index = rows.indexOf(row)
  // One source line per row, with the delimiter row after the header.
  const lines = item.raw.split('\n')
  const line = index === 0 ? 1 : index + 1
  if (line >= lines.length)
    return true
  const start = surface.view.startOf(item)
  let at = start
  for (let i = 0; i <= line; i++)
    at += lines[i]!.length + 1
  at -= 1
  const insert = `\n|${'  |'.repeat(Math.max(1, row.children.length))}`
  surface.commit([{ from: at, to: at, insert }], null, 'structure')
  const fresh = surface.view.sourceToDom(start).item?.el.querySelectorAll('tr')[index + 1]?.children[0]
  if (fresh)
    collapse(surface, fresh, 0)
  return true
}

function hasContentAfter(node: Node): boolean {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (isText(next) ? /[^\s\u200B]/.test(next.data) : !(isElement(next) && next.tagName === 'BR' && isPlaceholderBreak(next)))
      return true
  }
  return false
}

/** ArrowRight at the very end of formatting that ends its block: out of it, so typing is plain. */
function stepOutRight(surface: RichSurface): boolean {
  const point = surface.caretPoint()
  if (!point || !isText(point.node) || point.offset < point.node.length)
    return false
  let node: Node = point.node
  let outer: HTMLElement | null = null
  while (node.parentElement && node.parentElement !== surface.root && INLINE_FORMATTING.has(node.parentElement.tagName)) {
    if (hasContentAfter(node))
      return false
    outer = node.parentElement
    node = outer
  }
  if (!outer || hasContentAfter(outer))
    return false
  const target = surface.stepOut(outer, 'after')
  const item = surface.view.itemAt(outer)
  if (item)
    item.map = null
  collapse(surface, target.node, target.offset)
  return true
}

// ---------------------------------------------------------------------------
// Clipboard, drop, clicks
// ---------------------------------------------------------------------------

// Their text is not content: it would land in the document as paragraphs.
const PASTE_FORBIDDEN_TAGS = ['style', 'textarea', 'select', 'button', 'svg', 'math']

function htmlToMarkdown(surface: RichSurface, html: string): string {
  const container = surface.root.ownerDocument.createElement('div')
  container.innerHTML = DOMPurify.sanitize(html, { FORBID_TAGS: PASTE_FORBIDDEN_TAGS })
  return serializeMarkdown(container, { math: surface.options.math, highlight: surface.options.highlight })
}

function images(list: DataTransfer): File[] {
  return Array.from(list.files).filter(file => file.type.startsWith('image/'))
}

export function handleRichPaste(surface: RichSurface, event: ClipboardEvent): void {
  event.preventDefault()
  const data = event.clipboardData
  if (!surface.editable || !data)
    return
  surface.flush()
  const selection = surface.getSelection()
  if (!selection)
    return
  const from = Math.min(selection.anchor, selection.head)
  const to = Math.max(selection.anchor, selection.head)
  const files = images(data)
  if (files.length && surface.host.onFiles(files, from))
    return

  const text = data.getData('text/plain').replace(/\r\n?/g, '\n')
  const anchor = surface.root.ownerDocument.getSelection()?.anchorNode ?? null
  if (surface.closest(anchor, ['PRE'])) {
    if (text)
      surface.replaceRange(from, to, text, 'paste')
    return
  }
  // Code and revealed Markdown take the text as it is, on one line.
  if (surface.closest(anchor, ['CODE']) || surface.reveal.holds(anchor)) {
    if (text)
      surface.root.ownerDocument.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '))
    return
  }
  const markdown = data.getData('text/x-markdown')
  if (markdown) {
    surface.insertMarkdown(markdown, 'paste')
    return
  }
  if (from !== to && /^(?:https?:\/\/|mailto:)\S+$/.test(text.trim())) {
    const result = formatMarkdown(surface.view.doc, selection, { type: 'link', href: text.trim() })
    if (result)
      surface.commit(result.changes, result.selection, 'paste')
    return
  }
  const html = data.getData('text/html')
  const converted = html ? htmlToMarkdown(surface, html) : ''
  if (converted || text)
    surface.insertMarkdown(converted || text, 'paste')
}

/** Copies the Markdown of the selection alongside its HTML. */
export function handleRichCopy(surface: RichSurface, event: ClipboardEvent, cut: boolean): void {
  surface.flush()
  const selection = surface.getSelection()
  const domSelection = surface.root.ownerDocument.getSelection()
  if (!selection || selection.anchor === selection.head || !event.clipboardData || !domSelection?.rangeCount)
    return
  const from = Math.min(selection.anchor, selection.head)
  const to = Math.max(selection.anchor, selection.head)
  const markdown = surface.view.doc.slice(from, to)
  const container = surface.root.ownerDocument.createElement('div')
  container.append(domSelection.getRangeAt(0).cloneContents())
  event.preventDefault()
  event.clipboardData.setData('text/plain', markdown)
  event.clipboardData.setData('text/x-markdown', markdown)
  event.clipboardData.setData('text/html', container.innerHTML)
  if (cut && surface.editable)
    surface.commit([{ from, to, insert: '' }], caret(from), 'cut')
}

function pointFromEvent(surface: RichSurface, event: MouseEvent): number | null {
  const doc = surface.root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
  }
  let node: Node | null = null
  let offset = 0
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(event.clientX, event.clientY)
    node = position?.offsetNode ?? null
    offset = position?.offset ?? 0
  }
  else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY)
    node = range?.startContainer ?? null
    offset = range?.startOffset ?? 0
  }
  if (!node || !surface.root.contains(node))
    return null
  return surface.view.domToSource(node, offset, 1)
}

/** A drag out of the surface carries the Markdown too; a drop back in is then a native move. */
export function handleRichDragStart(surface: RichSurface, event: DragEvent): void {
  surface.flush()
  const selection = surface.getSelection()
  if (!selection || selection.anchor === selection.head || !event.dataTransfer)
    return
  const from = Math.min(selection.anchor, selection.head)
  const to = Math.max(selection.anchor, selection.head)
  event.dataTransfer.setData('text/x-markdown', surface.view.doc.slice(from, to))
}

export function handleRichDrop(surface: RichSurface, event: DragEvent): void {
  const data = event.dataTransfer
  if (!data)
    return
  const files = images(data)
  if (files.length) {
    event.preventDefault()
    if (!surface.editable)
      return
    surface.flush()
    surface.host.onFiles(files, pointFromEvent(surface, event) ?? surface.view.doc.length)
    return
  }
  // A drag inside the surface moves text natively; HTML from elsewhere comes in as Markdown.
  if (data.types.includes('text/x-markdown') || !data.types.includes('text/html'))
    return
  event.preventDefault()
  const at = surface.editable ? pointFromEvent(surface, event) : null
  if (at === null)
    return
  const markdown = htmlToMarkdown(surface, data.getData('text/html')) || data.getData('text/plain')
  if (markdown)
    surface.insertMarkdown(markdown, 'drop', caret(at))
}

export function handleRichClick(surface: RichSurface, event: MouseEvent): void {
  const target = event.target as Node | null
  if (!target || !surface.root.contains(target))
    return
  const element = isElement(target) ? target : target.parentElement
  if (!element)
    return
  if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox') {
    event.preventDefault()
    if (surface.checkable)
      toggleCheckbox(surface, element as HTMLInputElement)
    return
  }
  const link = element.closest('a[href]')
  if (link && surface.root.contains(link) && ((isMac() ? event.metaKey : event.ctrlKey) || !surface.editable)) {
    const href = link.getAttribute('href') ?? ''
    if (/^(?:https?:|mailto:)/i.test(href)) {
      event.preventDefault()
      surface.root.ownerDocument.defaultView?.open(href, '_blank', 'noopener,noreferrer')
    }
    return
  }
  const atom = element.closest<HTMLElement>('[data-md-atom]')
  if (!atom || !surface.root.contains(atom) || !surface.editable)
    return
  // A callout's title opens as its marker, the caret on the type.
  if (atom.classList.contains(CALLOUT_TITLE_CLASS)) {
    surface.reveal.revealElement(atom)
    return
  }
  // A custom emoji's image holds no text for the caret, so its shortcode opens as a formula's source does.
  if (atom.matches('.tx-markdown-editor__emoji.is-custom')) {
    surface.reveal.revealElement(atom)
    return
  }
  if (!atom.classList.contains('tx-markdown-editor__math'))
    return
  // An inline formula opens in place, as its TeX; a display one in the editor's prompt.
  if (!atom.classList.contains('is-block') && surface.reveal.revealElement(atom))
    return
  const item = surface.view.itemAt(atom)
  const range = item ? surface.view.mapOf(item).rangeOf(atom) : null
  if (!item || !range)
    return
  const start = surface.view.startOf(item)
  surface.host.onAtom(atom, start + range[0], start + range[1])
}

/** On the box a click toggled, which alone animates the change. */
const TOGGLED_CLASS = 'is-toggled'

function toggleCheckbox(surface: RichSurface, box: HTMLInputElement): void {
  surface.flush()
  const item = surface.view.itemAt(box)
  const unit = item ? surface.view.mapOf(item).unitOf(box) : null
  if (!item || !unit || unit.end - unit.start < 3) {
    // A box without source yet (a new task item): flip it in place.
    box.checked = !box.checked
    box.classList.add(TOGGLED_CLASS)
    surface.reconcile('toggle')
    return
  }
  const from = surface.view.startOf(item) + unit.end - 3
  const checked = /x/i.test(item.raw.slice(unit.end - 2, unit.end - 1))
  const index = Array.from(item.el.querySelectorAll('input[type="checkbox"]')).indexOf(box)
  surface.commit([{ from, to: from + 3, insert: checked ? '[ ]' : '[x]' }], null, 'toggle')
  // The block re-rendered; the toggled box sits at the same place in the new one.
  surface.view.sourceToDom(from).item?.el.querySelectorAll('input[type="checkbox"]')[index]?.classList.add(TOGGLED_CLASS)
}
