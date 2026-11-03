import type { BlockItem } from './block-view'
import type { MarkdownEmoji } from './emoji'
import type { MarkdownRenderer } from './markdown-render'
import type { MarkdownEditorSelection, MarkdownTextChange } from './types'
import { BlockView } from './block-view'
import { serializeMarkdownBlock } from './markdown-serializer'
import {
  applyTypingRules,
  handleRichClick,
  handleRichCopy,
  handleRichDragStart,
  handleRichDrop,
  handleRichKeydown,
  handleRichPaste,
} from './rich-behaviors'
import { revealedFormats, RichReveal } from './rich-reveal'
import { isFormattingWhitespace, isMarkdownAtom, REVEAL_ATTRIBUTE } from './source-map'
import {
  applyMarkdownChanges,
  composeMarkdownChanges,
  diffMarkdown,
  mapMarkdownPosition,
  transformMarkdownChanges,
} from './text-changes'

/**
 * The rich (WYSIWYG) surface: a contenteditable rendering of the Markdown
 * that reports every edit as a change to the source.
 *
 * Typing is left to the browser. After each input the blocks it touched are
 * serialized back to Markdown, and the difference against the previous source
 * is the change reported to the shell. Structure the browser would get wrong
 * (Markdown shortcuts, code blocks, list indentation, paste) is edited in the
 * source instead, and the touched blocks re-render; see `rich-behaviors.ts`.
 *
 * Changes from elsewhere (a peer, undo, a toolbar command) arrive as source
 * changes and patch only the blocks whose source changed. While an IME
 * composition is open the DOM belongs to the IME: changes that arrive then are
 * queued and rebased over the composed text when it ends.
 */

export type RichChangeKind = 'input' | 'rule' | 'structure' | 'paste' | 'cut' | 'drop' | 'toggle'

export type RichCommand =
  | 'undo' | 'redo' | 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link' | 'comment' | 'math'
  | `heading${0 | 1 | 2 | 3 | 4 | 5 | 6}`

export interface RichSurfaceHost {
  /** A local edit, already applied to the surface, against the host's current document. */
  onChange: (changes: MarkdownTextChange[], before: MarkdownEditorSelection | null, after: MarkdownEditorSelection | null, kind: RichChangeKind) => void
  onCommand: (command: RichCommand) => void
  onSelectionChange: () => void
  /** Image files pasted or dropped at a source position; false when nothing takes them. */
  onFiles: (files: File[], at: number) => boolean
  /** A formula was clicked: edit it. */
  onAtom: (atom: HTMLElement, from: number, to: number) => void
  /** Keys for an open completion list; return true when handled. */
  onKeydown: (event: KeyboardEvent) => boolean
  /** After every input, for `:` completion. */
  onTyped: () => void
}

export interface RichSurfaceOptions {
  math: boolean
  highlight: boolean
  /** Typing `[!NOTE]` on a quote's first line makes it a callout. */
  callouts: boolean
  emoji: () => ReadonlyMap<string, MarkdownEmoji> | null
  decorateUpload?: (card: HTMLElement, id: string) => void
}

export const ZWSP = '\u200B'

const EDITABLE_BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH'])
const TOP_LEVEL_BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIV', 'DL', 'FIGURE', 'FOOTER', 'H1', 'H2',
  'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
])

export function isElement(node: Node | null | undefined): node is HTMLElement {
  return !!node && node.nodeType === 1
}

export function isText(node: Node | null | undefined): node is Text {
  return !!node && node.nodeType === 3
}

/** A block the caret cannot sit inside: a rule, a formula, raw HTML. */
function isWholeBlock(node: Node | null | undefined): boolean {
  return isElement(node) && (node.tagName === 'HR' || isMarkdownAtom(node))
}

export interface CaretPoint {
  node: Node
  offset: number
}

export class RichSurface {
  readonly root: HTMLElement
  readonly view: BlockView
  readonly renderer: MarkdownRenderer
  readonly host: RichSurfaceHost
  readonly options: RichSurfaceOptions
  /** The Markdown of the formatted text at the caret; see `rich-reveal.ts`. */
  readonly reveal: RichReveal
  editable = true
  checkable = true
  /** Set while the surface runs a native formatting command itself. */
  nativeFormat = false
  private readonly observer: MutationObserver
  private readonly touched = new Set<HTMLElement>()
  /** Blocks typed into since they were rendered; re-rendered once the caret leaves them. */
  private readonly dirty = new Set<BlockItem>()
  private composing = false
  private compositionDoc = ''
  private queued: MarkdownTextChange[][] = []
  private selectionBefore: MarkdownEditorSelection | null = null
  /** The empty paragraph `openLine` opened, until the command's edit comes back. */
  private opened: BlockItem | null = null
  private activeItem: BlockItem | null = null
  private selectionInside = false
  private readonly cleanups: Array<() => void> = []

  constructor(root: HTMLElement, renderer: MarkdownRenderer, host: RichSurfaceHost, options: RichSurfaceOptions) {
    this.root = root
    this.renderer = renderer
    this.host = host
    this.options = options
    this.view = new BlockView(root, renderer, {
      hydrate: () => ({
        editable: this.editable,
        checkable: this.checkable,
        externalLinks: false,
        decorateUpload: this.options.decorateUpload,
      }),
      decorate: (el) => {
        this.dropLayoutWhitespace(el)
        this.fillEmpty(el)
      },
    })
    this.reveal = new RichReveal(this)
    this.observer = new MutationObserver((records) => {
      for (const record of records)
        this.touch(record.target)
    })
    this.observer.observe(root, { childList: true, subtree: true, characterData: true })

    const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) => {
      root.addEventListener(type, listener)
      this.cleanups.push(() => root.removeEventListener(type, listener))
    }
    on('beforeinput', event => this.onBeforeInput(event))
    on('input', event => this.onInput(event as InputEvent))
    on('keydown', (event) => {
      this.reveal.onKeydown()
      handleRichKeydown(this, event)
    })
    on('mousedown', event => this.reveal.onPointerDown(event))
    on('compositionstart', () => this.onCompositionStart())
    on('compositionend', () => this.onCompositionEnd())
    on('paste', event => handleRichPaste(this, event))
    on('copy', event => handleRichCopy(this, event, false))
    on('cut', event => handleRichCopy(this, event, true))
    on('dragstart', event => handleRichDragStart(this, event))
    on('drop', event => handleRichDrop(this, event))
    on('click', event => handleRichClick(this, event))
    on('focus', () => {
      try {
        root.ownerDocument.execCommand('defaultParagraphSeparator', false, 'p')
        root.ownerDocument.execCommand('styleWithCSS', false, 'false')
      }
      catch {}
    })
    const listen = (type: 'selectionchange' | 'mouseup' | 'dragend', listener: () => void) => {
      root.ownerDocument.addEventListener(type, listener)
      this.cleanups.push(() => root.ownerDocument.removeEventListener(type, listener))
    }
    listen('selectionchange', () => this.onSelectionChange())
    // A press that began in the surface may end anywhere, or in a drag.
    listen('mouseup', () => this.reveal.onPointerUp())
    listen('dragend', () => this.reveal.onPointerUp())
  }

  destroy(): void {
    this.reveal.destroy()
    this.observer.disconnect()
    for (const cleanup of this.cleanups)
      cleanup()
    this.cleanups.length = 0
  }

  get doc(): string {
    return this.view.doc
  }

  get isComposing(): boolean {
    return this.composing
  }

  setEditable(editable: boolean, checkable: boolean): void {
    this.reveal.conceal()
    this.editable = editable
    this.checkable = checkable
    this.root.contentEditable = editable ? 'true' : 'false'
    this.withoutObserver(() => this.view.rehydrate())
  }

  private touch(node: Node): void {
    const top = this.view.topElement(node)
    if (top)
      this.touched.add(top)
  }

  /** DOM writes that are not edits: rendering, step-out spaces. */
  withoutObserver(write: () => void): void {
    this.flushRecords()
    write()
    this.observer.takeRecords()
  }

  private flushRecords(): void {
    for (const record of this.observer.takeRecords())
      this.touch(record.target)
  }

  /**
   * Removes the newlines marked writes between elements. A caret placed in one
   * sits outside every item, and text typed there lands in the list itself.
   */
  private dropLayoutWhitespace(el: HTMLElement): void {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const layout: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (isFormattingWhitespace(node as Text) && !node.parentElement?.closest('pre, [data-md-atom]'))
        layout.push(node as Text)
    }
    for (const text of layout)
      text.remove()
  }

  /** An empty block has no height in a contenteditable: give it a break to hold the caret. */
  private fillEmpty(el: HTMLElement): void {
    const doc = el.ownerDocument
    if (el.tagName === 'BLOCKQUOTE' && !el.firstElementChild) {
      el.textContent = ''
      el.append(doc.createElement('p'))
    }
    const blocks = [el, ...Array.from(el.querySelectorAll<HTMLElement>('p, li, td, th, h1, h2, h3, h4, h5, h6'))]
    for (const block of blocks) {
      // As a Node: the guard would otherwise narrow `block` to never past the `continue`.
      if (!EDITABLE_BLOCKS.has(block.tagName) || isMarkdownAtom(block as Node))
        continue
      if (!(block.textContent ?? '').trim() && !block.querySelector('br, img, input, [data-md-atom], ul, ol, p'))
        block.append(doc.createElement('br'))
    }
  }

  emptyParagraph(): HTMLParagraphElement {
    const p = this.root.ownerDocument.createElement('p')
    p.append(this.root.ownerDocument.createElement('br'))
    return p
  }

  // ---------------------------------------------------------------------------
  // Rendering and incoming changes
  // ---------------------------------------------------------------------------

  setDoc(doc: string): void {
    this.withoutObserver(() => {
      this.view.render(doc)
      this.ensureNotEmpty()
    })
    this.dirty.clear()
    this.touched.clear()
    this.queued = []
  }

  private ensureNotEmpty(): void {
    if (this.root.firstElementChild)
      return
    const p = this.emptyParagraph()
    this.root.append(p)
    this.view.setItems([{ el: p, raw: '', type: 'paragraph', gapBefore: '', map: null }], this.view.trailing)
  }

  /**
   * Changes the shell applied from another origin; `doc` is the result. The
   * caret stays where it was, or goes to `selection` when given. Edits typed
   * but not yet reported are rebased over them and reported afterwards.
   */
  applyChanges(changes: MarkdownTextChange[], doc: string, selection?: MarkdownEditorSelection | null): void {
    if (this.composing) {
      this.queued.push(changes)
      return
    }
    const base = this.view.doc
    if (!this.hasPendingInput() && applyMarkdownChanges(base, changes) !== doc) {
      // Out of step (should not happen): take the shell's document as it is.
      this.patchKeepingSelection(doc, null, selection)
      return
    }
    this.mergeRemote(base, [changes], selection)
  }

  private hasPendingInput(): boolean {
    this.flushRecords()
    return this.touched.size > 0
  }

  /** Brings concurrent changes into a DOM that may hold unreported local edits. */
  private mergeRemote(base: string, sets: MarkdownTextChange[][], selection?: MarkdownEditorSelection | null): void {
    const result = this.collect()
    if (result)
      this.view.setItems(result.items)
    const localDoc = this.view.doc
    let remote: MarkdownTextChange[] = sets[0] ?? []
    for (const next of sets.slice(1))
      remote = composeMarkdownChanges(remote, next, base.length)
    const local = diffMarkdown(base, localDoc)
    const [localPrime, remotePrime] = transformMarkdownChanges(local ? [local] : [], remote, base.length)
    this.patchKeepingSelection(applyMarkdownChanges(localDoc, remotePrime), remotePrime, selection)
    if (localPrime.length)
      this.host.onChange(localPrime, null, this.getSelection(), 'input')
  }

  /** Patches to `doc` and puts the selection back, by DOM point when its block survived. */
  private patchKeepingSelection(doc: string, changes: MarkdownTextChange[] | null, selection?: MarkdownEditorSelection | null): void {
    const domSelection = this.root.ownerDocument.getSelection()
    const focused = this.hasFocus()
    const saved = focused && domSelection?.anchorNode && domSelection.focusNode
      ? [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset] as const
      : null
    let mapped = focused ? this.getSelection() : null
    if (mapped && changes) {
      mapped = {
        anchor: mapMarkdownPosition(mapped.anchor, changes, 1),
        head: mapMarkdownPosition(mapped.head, changes, 1),
      }
    }
    let created: BlockItem[] = []
    this.withoutObserver(() => {
      // The block a command made in an empty paragraph takes its place.
      const opened = this.opened
      if (opened && this.view.items.includes(opened)) {
        opened.el.remove()
        this.view.setItems(this.view.items.filter(item => item !== opened))
      }
      this.opened = null
      created = this.view.patch(doc)
      this.ensureNotEmpty()
    })
    this.pruneDirty()
    if (!focused)
      return
    if (selection) {
      this.setSelection(selection)
      return
    }
    const survived = saved && saved[0].isConnected && saved[2].isConnected
      && !created.some(item => item.el.contains(saved[0]) || item.el.contains(saved[2]))
    if (survived && domSelection) {
      try {
        domSelection.setBaseAndExtent(saved[0], saved[1], saved[2], saved[3])
        return
      }
      catch {}
    }
    if (mapped)
      this.setSelection(mapped)
  }

  private pruneDirty(): void {
    for (const item of [...this.dirty]) {
      if (!this.view.items.includes(item))
        this.dirty.delete(item)
    }
  }

  /** KaTeX or the emoji set arrived. */
  refreshAssets(): void {
    if (this.composing)
      return
    // The element a span stands in for is out of the document, where hydration cannot reach it.
    this.reveal.conceal()
    this.flush()
    const selection = this.hasFocus() ? this.getSelection() : null
    this.withoutObserver(() => {
      if (!this.view.refresh([]))
        this.ensureNotEmpty()
      this.view.rehydrate()
    })
    this.pruneDirty()
    if (selection)
      this.setSelection(selection)
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  hasFocus(): boolean {
    const active = this.root.ownerDocument.activeElement
    return !!active && (active === this.root || this.root.contains(active))
  }

  focus(): void {
    this.root.focus({ preventScroll: true })
  }

  getSelection(): MarkdownEditorSelection | null {
    const selection = this.root.ownerDocument.getSelection()
    if (!selection?.anchorNode || !selection.focusNode)
      return null
    if (!this.root.contains(selection.anchorNode) || !this.root.contains(selection.focusNode))
      return null
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
    if (selection.isCollapsed) {
      const pos = this.view.domToSource(anchorNode, anchorOffset, 1)
      return { anchor: pos, head: pos }
    }
    const range = this.root.ownerDocument.createRange()
    range.setStart(anchorNode, anchorOffset)
    const forward = range.comparePoint(focusNode, focusOffset) >= 0
    const [startNode, startOffset, endNode, endOffset] = forward
      ? [anchorNode, anchorOffset, focusNode, focusOffset]
      : [focusNode, focusOffset, anchorNode, anchorOffset]
    const start = this.view.domToSource(startNode, startOffset, 1)
    const end = Math.max(start, this.view.domToSource(endNode, endOffset, -1))
    return forward ? { anchor: start, head: end } : { anchor: end, head: start }
  }

  setSelection(selection: MarkdownEditorSelection): void {
    const domSelection = this.root.ownerDocument.getSelection()
    if (!domSelection)
      return
    if (selection.anchor === selection.head) {
      this.placeCaret(selection.head)
      return
    }
    const anchor = this.view.sourceToDom(selection.anchor)
    const head = this.view.sourceToDom(selection.head)
    try {
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
    }
    catch {}
  }

  /** Puts the caret at a source position, stepping out of formatting the position is outside of. */
  placeCaret(pos: number): void {
    const domSelection = this.root.ownerDocument.getSelection()
    if (!domSelection)
      return
    const point = this.view.sourceToDom(pos)
    if (point.node === this.root) {
      this.caretBetweenBlocks(point.offset)
      return
    }
    let { node, offset } = point
    let outside = point.outside
    if (!outside && isElement(node)) {
      const before = node.childNodes[offset - 1]
      if (isMarkdownAtom(before) && !isText(before.nextSibling))
        outside = { element: before, side: 'after' }
    }
    if (outside) {
      const target = this.stepOut(outside.element, outside.side)
      node = target.node
      offset = target.offset
      if (point.item)
        point.item.map = null
    }
    try {
      domSelection.collapse(node, offset)
    }
    catch {}
  }

  /**
   * A text position just outside `element`, through a zero-width space: the
   * caret there types plain text, where the browser would extend the element.
   */
  stepOut(element: Element, side: 'before' | 'after'): CaretPoint {
    let point: CaretPoint = { node: element, offset: 0 }
    this.withoutObserver(() => {
      const sibling = side === 'after' ? element.nextSibling : element.previousSibling
      if (isText(sibling) && (side === 'after' ? sibling.data.startsWith(ZWSP) : sibling.data.endsWith(ZWSP))) {
        point = { node: sibling, offset: side === 'after' ? 1 : sibling.length - 1 }
        return
      }
      const space = this.root.ownerDocument.createTextNode(ZWSP)
      element.parentNode?.insertBefore(space, side === 'after' ? element.nextSibling : element)
      point = { node: space, offset: side === 'after' ? 1 : 0 }
    })
    return point
  }

  /** The caret at the root between two blocks: into a neighbour, or a new empty paragraph. */
  private caretBetweenBlocks(offset: number): void {
    const domSelection = this.root.ownerDocument.getSelection()
    const before = this.root.childNodes[offset - 1] ?? null
    const after = this.root.childNodes[offset] ?? null
    const beforeItem = isElement(before) && !isWholeBlock(before) ? this.view.itemFor(before) : null
    const afterItem = isElement(after) && !isWholeBlock(after) ? this.view.itemFor(after) : null
    // An empty paragraph's source position is the block's before it, which
    // would lead back here: the caret goes into it directly.
    const into = (item: BlockItem, end: boolean) => item.raw
      ? this.placeCaret(this.view.startOf(item) + (end ? item.raw.length : 0))
      : domSelection?.collapse(item.el, 0)
    if (afterItem && isWholeBlock(before)) {
      into(afterItem, false)
      return
    }
    if (beforeItem) {
      into(beforeItem, true)
      return
    }
    if (afterItem) {
      into(afterItem, false)
      return
    }
    const p = this.emptyParagraph()
    this.root.insertBefore(p, after)
    this.reconcile('structure')
    domSelection?.collapse(p, 0)
  }

  caretPoint(): CaretPoint | null {
    const selection = this.root.ownerDocument.getSelection()
    if (!selection?.isCollapsed || !selection.anchorNode || !this.root.contains(selection.anchorNode))
      return null
    return { node: selection.anchorNode, offset: selection.anchorOffset }
  }

  closest(node: Node | null, tags: readonly string[]): HTMLElement | null {
    for (let current: Node | null = node; current && current !== this.root; current = current.parentNode) {
      if (isElement(current) && tags.includes(current.tagName))
        return current
    }
    return null
  }

  /** Source range of a DOM range inside one text node. */
  textRange(node: Text, start: number, end: number): [number, number] {
    return [this.view.domToSource(node, start, 1), this.view.domToSource(node, end, -1)]
  }

  /** The text of the caret's text node up to the caret, for completions. */
  textBeforeCaret(): { node: Text, offset: number, text: string } | null {
    const caret = this.caretPoint()
    if (!caret || !isText(caret.node) || this.closest(caret.node, ['CODE', 'PRE']) || this.reveal.holds(caret.node))
      return null
    return { node: caret.node, offset: caret.offset, text: caret.node.data.slice(0, caret.offset) }
  }

  /**
   * The empty paragraph Enter made has no line in the source until something
   * is typed into it, so a command run there would land on the line before.
   * The change that gives it one, and the caret on that line; null when the
   * caret at `selection` is not in such a paragraph. When the command's edit
   * comes back, what it made replaces the paragraph.
   */
  openLine(selection: MarkdownEditorSelection): { changes: MarkdownTextChange[], caret: number } | null {
    const caret = this.caretPoint()
    const item = caret ? this.view.itemAt(caret.node) : null
    if (!item || item.raw || selection.anchor !== selection.head || selection.head !== this.view.startOf(item))
      return null
    const doc = this.view.doc
    const first = !this.view.items.slice(0, this.view.items.indexOf(item)).some(other => other.raw)
    if (first && !doc.trim())
      return null
    this.opened = item
    // Only for the edit that follows: a command that made none leaves it be.
    queueMicrotask(() => {
      this.opened = null
    })
    if (first)
      return { changes: [{ from: 0, to: 0, insert: '\n\n' }], caret: 0 }
    const end = doc.indexOf('\n', selection.head)
    const at = end < 0 ? doc.length : end
    return { changes: [{ from: at, to: at, insert: '\n\n' }], caret: at + 2 }
  }

  /** Bounding box of the DOM selection, or of the caret. */
  selectionRect(): DOMRect | null {
    const selection = this.root.ownerDocument.getSelection()
    if (!selection?.rangeCount || !selection.anchorNode || !this.root.contains(selection.anchorNode))
      return null
    const range = selection.getRangeAt(0)
    if (!selection.isCollapsed)
      return range.getBoundingClientRect()
    const rects = range.getClientRects()
    const rect = rects.length ? rects[rects.length - 1]! : null
    if (rect && rect.height > 0)
      return rect
    const container = isElement(range.startContainer) ? range.startContainer : range.startContainer.parentElement
    return container?.getBoundingClientRect() ?? null
  }

  /** Formats in effect at the caret, for the toolbar's pressed states. */
  activeFormats(): Set<string> {
    const formats = new Set<string>()
    const node = this.root.ownerDocument.getSelection()?.focusNode
    if (!node || !this.root.contains(node))
      return formats
    for (let current: Node | null = node; current && current !== this.root; current = current.parentNode) {
      if (!isElement(current))
        continue
      const tag = current.tagName
      if (tag === 'SPAN' && current.parentElement?.hasAttribute(REVEAL_ATTRIBUTE)) {
        for (const format of revealedFormats(current))
          formats.add(format)
      }
      else if (tag === 'STRONG' || tag === 'B')
        formats.add('bold')
      else if (tag === 'EM' || tag === 'I')
        formats.add('italic')
      else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE')
        formats.add('strike')
      else if (tag === 'MARK')
        formats.add('highlight')
      else if (tag === 'CODE')
        formats.add(current.parentElement?.tagName === 'PRE' ? 'codeBlock' : 'code')
      else if (tag === 'A')
        formats.add('link')
      else if (tag === 'BLOCKQUOTE')
        formats.add('quote')
      else if (tag === 'LI' && current.classList.contains('tx-markdown-editor__task'))
        formats.add('taskList')
      else if (tag === 'UL' && !formats.has('taskList'))
        formats.add('bulletList')
      else if (tag === 'OL')
        formats.add('orderedList')
      else if (tag === 'PRE')
        formats.add('codeBlock')
      else if (/^H[1-6]$/.test(tag))
        formats.add('heading')
    }
    return formats
  }

  private onSelectionChange(): void {
    if (this.composing)
      return
    const selection = this.root.ownerDocument.getSelection()
    const inside = !!selection?.anchorNode && this.root.contains(selection.anchorNode)
    if (inside && selection) {
      const anchorItem = this.view.itemAt(selection.anchorNode)
      if (selection.isCollapsed && anchorItem !== this.activeItem) {
        this.activeItem = anchorItem
        this.tidy([anchorItem])
      }
    }
    if (inside || this.selectionInside) {
      this.reveal.update()
      this.host.onSelectionChange()
    }
    this.selectionInside = inside
  }

  /** Re-renders blocks that were typed into, except `keep`. */
  private tidy(keep: Array<BlockItem | null>): void {
    if (this.composing || !this.dirty.size)
      return
    this.flush()
    const targets = [...this.dirty].filter(item => !keep.includes(item) && this.view.items.includes(item))
    if (!targets.length)
      return
    const selection = this.hasFocus() ? this.getSelection() : null
    let full = false
    this.withoutObserver(() => {
      full = !this.view.refresh(targets)
      this.ensureNotEmpty()
    })
    for (const item of targets)
      this.dirty.delete(item)
    if (full) {
      this.dirty.clear()
      if (selection)
        this.setSelection(selection)
    }
  }

  /** Renders the block holding `node` afresh from its source, keeping the selection. */
  rerender(node: Node): void {
    this.flush()
    const item = this.view.itemAt(node)
    if (!item?.raw)
      return
    const selection = this.hasFocus() ? this.getSelection() : null
    let full = false
    this.withoutObserver(() => {
      full = !this.view.refresh([item])
      this.ensureNotEmpty()
    })
    this.dirty.delete(item)
    if (full)
      this.dirty.clear()
    else
      this.pruneDirty()
    if (selection)
      this.setSelection(selection)
  }

  /** Re-renders the block holding the caret now, keeping the caret: after merges leave browser debris. */
  tidyActive(): void {
    const caret = this.caretPoint()
    const item = caret ? this.view.itemAt(caret.node) : null
    if (!item || !this.dirty.has(item) || !item.raw)
      return
    const selection = this.getSelection()
    this.withoutObserver(() => {
      if (!this.view.refresh([item]))
        this.ensureNotEmpty()
    })
    this.dirty.delete(item)
    this.pruneDirty()
    if (selection)
      this.setSelection(selection)
  }

  // ---------------------------------------------------------------------------
  // Typing: DOM to source
  // ---------------------------------------------------------------------------

  /** Wraps text and inline nodes that ended up directly under the root into paragraphs. */
  private normalize(): void {
    const root = this.root
    const doc = root.ownerDocument
    const selection = doc.getSelection()
    const saved = selection?.anchorNode && selection.focusNode && root.contains(selection.anchorNode)
      ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset] as const
      : null
    let run: Node[] = []
    let moved = false
    const flush = (before: Node | null) => {
      const keep = run.some(node => !isText(node) || /[^\s\u200B]|\u00A0/.test(node.data) || node === saved?.[0])
      if (keep) {
        const p = doc.createElement('p')
        root.insertBefore(p, before)
        p.append(...run)
        moved = true
      }
      else {
        for (const node of run)
          node.parentNode?.removeChild(node)
      }
      run = []
    }
    for (const child of Array.from(root.childNodes)) {
      if (isElement(child) && (TOP_LEVEL_BLOCKS.has(child.tagName) || isMarkdownAtom(child)))
        flush(child)
      else
        run.push(child)
    }
    flush(null)
    if (!root.firstChild) {
      root.append(this.emptyParagraph())
      moved = true
    }
    if (moved && saved && selection && saved[0].isConnected && saved[2].isConnected) {
      try {
        selection.setBaseAndExtent(saved[0], saved[1], saved[2], saved[3])
      }
      catch {}
    }
  }

  /** Serializes what changed in the DOM; returns the new items and document without committing. */
  private collect(): { items: BlockItem[], doc: string } | null {
    this.flushRecords()
    const old = this.view.items
    const elements = Array.from(this.root.children) as HTMLElement[]
    const sameShape = elements.length === old.length && elements.every((el, index) => old[index]!.el === el)
    if (!this.touched.size && sameShape)
      return null

    this.normalize()
    this.flushRecords()
    const serialize = { math: this.options.math, highlight: this.options.highlight }
    const items: BlockItem[] = []
    const fresh = new Set<BlockItem>()
    for (const el of Array.from(this.root.children) as HTMLElement[]) {
      const previous = this.view.itemFor(el)
      const kept = previous && old.includes(previous) ? previous : null
      if (kept && !this.touched.has(el)) {
        items.push(kept)
        continue
      }
      const raw = serializeMarkdownBlock(el, serialize)
      const item: BlockItem = kept ?? { el, raw, type: 'paragraph', gapBefore: '', map: null }
      item.raw = raw
      item.map = null
      fresh.add(item)
      items.push(item)
    }
    this.touched.clear()

    // Gaps: unchanged neighbours keep theirs; new neighbours get a blank line,
    // and a single-newline gap next to an edited block must still split there.
    const successor = new Map<BlockItem, BlockItem>()
    let previous: BlockItem | null = null
    for (const item of old) {
      if (!item.raw)
        continue
      if (previous)
        successor.set(previous, item)
      previous = item
    }
    const leading = old.find(item => item.raw)?.gapBefore ?? ''
    const oldGaps = new Map(old.map(item => [item, item.gapBefore]))
    previous = null
    for (const item of items) {
      if (!item.raw) {
        item.gapBefore = ''
        continue
      }
      if (!previous) {
        item.gapBefore = leading
        previous = item
        continue
      }
      let gap = successor.get(previous) === item ? oldGaps.get(item) ?? '\n\n' : '\n\n'
      if (!/\n[ \t]*\n/.test(gap) && (fresh.has(item) || fresh.has(previous))) {
        const raws = this.renderer.blockRaws(previous.raw + gap + item.raw)
        if (raws.length !== 2 || raws[0] !== previous.raw || raws[1] !== item.raw)
          gap = '\n\n'
      }
      item.gapBefore = gap
      previous = item
    }
    for (const item of fresh)
      this.dirty.add(item)
    let doc = ''
    for (const item of items)
      doc += item.gapBefore + item.raw
    return { items, doc: doc + this.view.trailing }
  }

  /** Commits DOM edits as a source change and reports it. */
  reconcile(kind: RichChangeKind): MarkdownTextChange | null {
    if (this.composing)
      return null
    const before = this.view.doc
    const result = this.collect()
    if (!result)
      return null
    this.view.setItems(result.items)
    const change = diffMarkdown(before, result.doc)
    if (change) {
      const selectionBefore = this.selectionBefore
      this.selectionBefore = null
      this.host.onChange([change], selectionBefore, this.getSelection(), kind)
    }
    return change
  }

  /** Reports pending DOM edits; the shell calls this before computing a command. */
  flush(): void {
    this.reconcile('input')
  }

  /**
   * Commits a source change the surface made itself (a shortcut, a toggle,
   * paste) and re-renders what it touched.
   */
  commit(changes: MarkdownTextChange[], after: MarkdownEditorSelection | null, kind: RichChangeKind): void {
    this.flush()
    const before = this.getSelection()
    const doc = applyMarkdownChanges(this.view.doc, changes)
    this.withoutObserver(() => {
      this.view.patch(doc)
      this.ensureNotEmpty()
    })
    this.pruneDirty()
    if (after)
      this.setSelection(after)
    this.host.onChange(changes, before, after, kind)
  }

  /** Replaces a source range, e.g. a completed `:shortcode`. */
  replaceRange(from: number, to: number, insert: string, kind: RichChangeKind = 'input'): void {
    const end = from + insert.length
    this.commit([{ from, to, insert }], { anchor: end, head: end }, kind)
  }

  /**
   * Re-renders the block holding `node` from its source, for a shortcode the
   * user typed: the typed text is already the source, so no change reaches
   * `commit`, which would leave the block as it is.
   */
  rerenderBlock(node: Node, after: MarkdownEditorSelection): void {
    this.flush()
    const item = this.view.itemAt(node)
    if (item)
      this.withoutObserver(() => this.view.refresh([item]))
    this.pruneDirty()
    this.setSelection(after)
  }

  /** Inserts Markdown over the selection, padding block content onto its own lines. */
  insertMarkdown(markdown: string, kind: RichChangeKind, at?: MarkdownEditorSelection): void {
    this.flush()
    const selection = at ?? this.getSelection()
    if (!selection)
      return
    const doc = this.view.doc
    const from = Math.min(selection.anchor, selection.head)
    const to = Math.max(selection.anchor, selection.head)
    let insert = markdown.replace(/\r\n?/g, '\n')
    const blocky = /\n[ \t]*\n/.test(insert.trim()) || /^(?:#{1,6} |[-*+] |\d{1,9}[.)] |> |```|~~~|\||\$\$)/m.test(insert)
    if (blocky) {
      insert = insert.replace(/^\n+|\n+$/g, '')
      const lineStart = doc.lastIndexOf('\n', from - 1) + 1
      let lineEnd = doc.indexOf('\n', to)
      if (lineEnd < 0)
        lineEnd = doc.length
      if (doc.slice(lineStart, from).trim())
        insert = `\n\n${insert}`
      if (doc.slice(to, lineEnd).trim())
        insert = `${insert}\n\n`
    }
    const end = from + insert.length
    this.commit([{ from, to, insert }], { anchor: end, head: end }, kind)
  }

  /** Mod+B and friends on a collapsed caret: the browser's typing style, serialized on the next input. */
  toggleTypingStyle(format: 'bold' | 'italic' | 'strike'): void {
    this.reveal.suspend()
    this.nativeFormat = true
    try {
      this.root.ownerDocument.execCommand(format === 'strike' ? 'strikeThrough' : format)
    }
    finally {
      this.nativeFormat = false
    }
  }

  private onBeforeInput(event: InputEvent): void {
    if (!this.editable) {
      event.preventDefault()
      return
    }
    switch (event.inputType) {
      case 'historyUndo':
      case 'historyRedo':
        event.preventDefault()
        this.host.onCommand(event.inputType === 'historyUndo' ? 'undo' : 'redo')
        return
      case 'formatBold':
      case 'formatItalic':
      case 'formatStrikeThrough':
        if (this.nativeFormat)
          return
        event.preventDefault()
        this.host.onCommand(event.inputType === 'formatBold' ? 'bold' : event.inputType === 'formatItalic' ? 'italic' : 'strike')
        return
      default:
        // Formatting Markdown has no syntax for: underline, colours, alignment.
        if (event.inputType?.startsWith('format') || event.inputType === 'insertLink') {
          event.preventDefault()
          return
        }
    }
    if (!this.composing && !this.selectionBefore)
      this.selectionBefore = this.getSelection()
  }

  private onInput(event: InputEvent): void {
    if (this.composing || event.isComposing)
      return
    const blocksBefore = this.view.items.length
    this.reconcile('input')
    this.selectionBefore = null
    // A merge (Backspace at a block start) can leave the browser's inline styles behind.
    if (event.inputType?.startsWith('delete') && this.view.items.length < blocksBefore)
      this.tidyActive()
    // Typed into revealed Markdown: that is the source already, no shortcut applies.
    if (!this.reveal.restyle())
      applyTypingRules(this, event)
    this.host.onTyped()
  }

  private onCompositionStart(): void {
    this.flush()
    this.composing = true
    this.compositionDoc = this.view.doc
    this.queued = []
  }

  private onCompositionEnd(): void {
    this.composing = false
    const queued = this.queued
    this.queued = []
    if (queued.length)
      this.mergeRemote(this.compositionDoc, queued)
    else
      this.flush()
    this.reveal.restyle()
    this.host.onTyped()
  }
}
