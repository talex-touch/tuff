import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension, Range, Transaction } from '@codemirror/state'
import type { DecorationSet, KeyBinding } from '@codemirror/view'
import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { EditorOverlay } from './editor-overlay'
import type { MarkdownEmoji } from './emoji'
import type { RichChangeKind, RichCommand } from './rich-surface'
import type { MarkdownEditorCalloutType, MarkdownEditorHighlightColor } from './types'
import { autocompletion, insertCompletionText, pickedCompletion } from '@codemirror/autocomplete'
import { indentLess, indentMore } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { Annotation, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import { Tag, tags } from '@lezer/highlight'
import { composeMarkdownEmoji, loadMarkdownEmoji, markdownEmojiText, peekMarkdownEmoji, rememberMarkdownEmoji, searchMarkdownEmoji } from './emoji'
import { continueMarkdownList, indentMarkdownList } from './markdown-format'
import { isInsideMarkdownFence, markdownStreamParser } from './markdown-stream'
import { MARKDOWN_EDITOR_CALLOUT_TYPES, MARKDOWN_EDITOR_HIGHLIGHT_COLORS } from './types'

/**
 * CodeMirror pieces of the source mode. Only the lazily loaded source runtime
 * imports this module, so none of it reaches a page that never opens the
 * Markdown source.
 */

/** Changes the shell applied: they are already in its document and must not be reported back. */
export const externalChange = Annotation.define<boolean>()

export function changeKind(tr: Transaction): RichChangeKind {
  if (tr.isUserEvent('input.paste'))
    return 'paste'
  if (tr.isUserEvent('input.drop') || tr.isUserEvent('move.drop'))
    return 'drop'
  if (tr.isUserEvent('delete.cut'))
    return 'cut'
  if (tr.isUserEvent('input.type') || tr.isUserEvent('delete'))
    return 'input'
  return 'structure'
}

// ---------------------------------------------------------------------------
// Comments and peers
// ---------------------------------------------------------------------------

export const setSourceOverlay = StateEffect.define<EditorOverlay>()

class PeerCaretWidget extends WidgetType {
  readonly name: string
  readonly color: string
  readonly labelled: boolean

  constructor(name: string, color: string, labelled: boolean) {
    super()
    this.name = name
    this.color = color
    this.labelled = labelled
  }

  eq(other: PeerCaretWidget): boolean {
    return other.name === this.name && other.color === this.color && other.labelled === this.labelled
  }

  toDOM(): HTMLElement {
    const caret = document.createElement('span')
    caret.setAttribute('aria-hidden', 'true')
    this.updateDOM(caret)
    return caret
  }

  // Reusing the element lets the name tag fade out instead of vanishing.
  updateDOM(dom: HTMLElement): boolean {
    dom.className = this.labelled ? 'tx-markdown-editor__peer-caret is-labelled' : 'tx-markdown-editor__peer-caret'
    dom.style.setProperty('--tx-markdown-editor-peer', this.color)
    dom.dataset.name = this.name
    return true
  }

  ignoreEvent(): boolean {
    return true
  }
}

function overlayDecorations(overlay: EditorOverlay, length: number): DecorationSet {
  const clamp = (pos: number) => Math.max(0, Math.min(length, pos))
  const ranges: Range<Decoration>[] = []
  for (const comment of overlay.comments) {
    const from = clamp(comment.from)
    const to = clamp(comment.to)
    if (to <= from)
      continue
    ranges.push(Decoration.mark({
      class: comment.active ? 'tx-markdown-editor__comment-mark is-active' : 'tx-markdown-editor__comment-mark',
      attributes: { 'data-comment-id': comment.id },
    }).range(from, to))
  }
  for (const peer of overlay.peers) {
    const from = clamp(Math.min(peer.anchor, peer.head))
    const to = clamp(Math.max(peer.anchor, peer.head))
    if (to > from) {
      ranges.push(Decoration.mark({
        class: 'tx-markdown-editor__peer-selection',
        attributes: { style: `--tx-markdown-editor-peer: ${peer.color}` },
      }).range(from, to))
    }
    ranges.push(Decoration.widget({
      widget: new PeerCaretWidget(peer.name, peer.color, peer.labelled),
      side: 1,
    }).range(clamp(peer.head)))
  }
  return Decoration.set(ranges, true)
}

export const sourceOverlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setSourceOverlay))
        next = overlayDecorations(effect.value, tr.state.doc.length)
    }
    return next
  },
  provide: field => EditorView.decorations.from(field),
})

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

const MONO = 'var(--tx-font-family-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace)'

export const sourceTheme = EditorView.theme({
  '&': {
    flex: '1 0 auto',
    color: 'var(--tx-markdown-editor-text)',
    backgroundColor: 'transparent',
    fontSize: '13px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    flex: '1 0 auto',
    fontFamily: MONO,
    lineHeight: '1.7',
  },
  '.cm-content': {
    padding: 'var(--tx-markdown-editor-pad-y) 0',
    caretColor: 'var(--tx-markdown-editor-accent)',
  },
  '.cm-line': {
    padding: '0 var(--tx-markdown-editor-pad-x)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '2px solid var(--tx-markdown-editor-accent)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--tx-markdown-editor-selection)',
  },
  '.cm-placeholder': {
    color: 'var(--tx-markdown-editor-placeholder)',
  },
  '.cm-tooltip': {
    border: 'none',
    borderRadius: '10px',
    background: 'var(--tx-markdown-editor-popover-bg)',
    boxShadow: '0 0 0 1px var(--tx-markdown-editor-border), 0 12px 32px -12px rgba(0, 0, 0, 0.35)',
    color: 'var(--tx-markdown-editor-text)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    maxHeight: '240px',
    padding: '4px',
    fontFamily: 'var(--tx-font-family, inherit)',
    fontSize: '13px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '28px',
    padding: '0 10px 0 6px',
    borderRadius: '6px',
    lineHeight: '28px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--tx-markdown-editor-selection)',
    color: 'var(--tx-markdown-editor-text)',
  },
  '.cm-completionLabel': {
    fontFamily: MONO,
    fontSize: '12px',
  },
})

/** The highlighter's colours and the callouts' types: the stream parser names them, these tags style them. */
const highlightTags = Object.fromEntries(MARKDOWN_EDITOR_HIGHLIGHT_COLORS.map(color => [color, Tag.define()])) as Record<MarkdownEditorHighlightColor, Tag>
const calloutTags = Object.fromEntries(MARKDOWN_EDITOR_CALLOUT_TYPES.map(type => [type, Tag.define()])) as Record<MarkdownEditorCalloutType, Tag>

const tokenTable = Object.fromEntries([
  ...MARKDOWN_EDITOR_HIGHLIGHT_COLORS.map(color => [color === 'yellow' ? 'highlight' : `highlight-${color}`, highlightTags[color]]),
  ...MARKDOWN_EDITOR_CALLOUT_TYPES.map(type => [`callout-${type}`, calloutTags[type]]),
])

export const sourceHighlight = syntaxHighlighting(HighlightStyle.define([
  ...MARKDOWN_EDITOR_HIGHLIGHT_COLORS.map(color => ({
    tag: highlightTags[color],
    borderRadius: '2px',
    background: `color-mix(in srgb, var(--tx-markdown-editor-highlight-${color}) var(--tx-markdown-editor-highlight-alpha), transparent)`,
  })),
  { tag: tags.heading1, fontSize: '1.2em', fontWeight: '600' },
  { tag: tags.heading2, fontSize: '1.1em', fontWeight: '600' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, color: 'var(--tx-markdown-editor-muted)' },
  { tag: tags.link, color: 'var(--tx-markdown-editor-accent)' },
  { tag: tags.url, color: 'var(--tx-markdown-editor-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: tags.monospace, color: 'var(--tx-markdown-editor-code)' },
  { tag: tags.special(tags.string), color: 'var(--tx-markdown-editor-math)' },
  { tag: tags.string, color: 'var(--tx-markdown-editor-muted)' },
  { tag: [tags.list, tags.atom, tags.labelName], color: 'var(--tx-markdown-editor-accent)' },
  { tag: tags.meta, color: 'var(--tx-markdown-editor-code)' },
  { tag: tags.comment, color: 'var(--tx-markdown-editor-placeholder)', fontStyle: 'italic' },
  // After the quote's colour, which the marker's line also has.
  ...MARKDOWN_EDITOR_CALLOUT_TYPES.map(type => ({ tag: calloutTags[type], color: `var(--tx-markdown-editor-callout-${type})`, fontWeight: '600' })),
  // Last, so a heading's `#` or a bold run's `**` is dimmed like every other marker.
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.escape], color: 'var(--tx-markdown-editor-marker)' },
]))

const languages = new Map<string, Extension>()

export function sourceLanguage(math: boolean, highlight: boolean, callouts: boolean): Extension {
  const key = `${math}:${highlight}:${callouts}`
  let language = languages.get(key)
  if (!language) {
    language = StreamLanguage.define({ ...markdownStreamParser({ math, highlight, callouts }), tokenTable })
    languages.set(key, language)
  }
  return language
}

// ---------------------------------------------------------------------------
// `:` emoji completion
// ---------------------------------------------------------------------------

interface EmojiOption extends Completion {
  emoji: MarkdownEmoji
}

const SHORTCODE_BEFORE = /(?:^|[\s(]):[a-z0-9_+-]{2,40}$/
// Stream token names join their styles with `_`.
const LITERAL_TOKEN = /(?:^|_)(?:monospace|url|meta|comment|string\.special)(?:_|$)/

function applyEmoji(view: EditorView, completion: Completion, from: number, to: number): void {
  const text = markdownEmojiText((completion as EmojiOption).emoji)
  rememberMarkdownEmoji(text)
  view.dispatch({
    ...insertCompletionText(view.state, text, from, to),
    annotations: pickedCompletion.of(completion),
  })
}

function emojiSource(packs: () => readonly TxEmojiPack[] | undefined) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = context.matchBefore(SHORTCODE_BEFORE)
    if (!match)
      return null
    if (LITERAL_TOKEN.test(syntaxTree(context.state).resolveInner(context.pos, -1).name))
      return null
    const base = peekMarkdownEmoji() ?? await loadMarkdownEmoji()
    if (context.aborted)
      return null
    const from = match.from + match.text.indexOf(':')
    const index = composeMarkdownEmoji(base, packs())
    const results = searchMarkdownEmoji(index, context.state.sliceDoc(from + 1, context.pos), 30)
    if (!results.length)
      return null
    return {
      from,
      filter: false,
      options: results.map((emoji): EmojiOption => ({ label: `:${emoji.name}:`, emoji, apply: applyEmoji })),
    }
  }
}

export function emojiCompletion(packs: () => readonly TxEmojiPack[] | undefined): Extension {
  return autocompletion({
    override: [emojiSource(packs)],
    icons: false,
    maxRenderedOptions: 30,
    addToOptions: [{
      position: 20,
      render: (completion) => {
        const { emoji } = completion as EmojiOption
        const glyph = document.createElement('span')
        glyph.className = 'tx-markdown-editor__completion-glyph'
        if (emoji.src) {
          const image = document.createElement('img')
          image.src = emoji.src
          image.alt = ''
          glyph.append(image)
        }
        else {
          glyph.textContent = emoji.char
        }
        return glyph
      },
    }],
  })
}

// ---------------------------------------------------------------------------
// Keys and DOM events
// ---------------------------------------------------------------------------

export interface SourceInputHandlers {
  command: (command: RichCommand) => void
  /** Image files pasted or dropped at a source position; false when nothing takes them. */
  files: (files: File[], at: number) => boolean
  math: () => boolean
}

const LIST_LINE = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/

function inFence(view: EditorView, pos: number, math: boolean): boolean {
  const { state } = view
  return isInsideMarkdownFence(state.doc.toString(), state.doc.lineAt(pos).from, math)
}

function continueList(view: EditorView, handlers: SourceInputHandlers): boolean {
  const { state } = view
  if (state.readOnly || state.selection.ranges.length > 1)
    return false
  const range = state.selection.main
  if (inFence(view, range.head, handlers.math()))
    return false
  const edit = continueMarkdownList(state.doc.toString(), { anchor: range.anchor, head: range.head })
  if (!edit)
    return false
  view.dispatch({ changes: edit.changes, selection: edit.selection, scrollIntoView: true, userEvent: 'input' })
  return true
}

function indentList(view: EditorView, direction: 1 | -1, handlers: SourceInputHandlers): boolean {
  const { state } = view
  if (state.readOnly)
    return false
  const range = state.selection.main
  if (inFence(view, range.from, handlers.math())) {
    if (direction < 0 || !range.empty)
      return (direction < 0 ? indentLess : indentMore)(view)
    view.dispatch(state.update(state.replaceSelection('  '), { scrollIntoView: true, userEvent: 'input.type' }))
    return true
  }
  // Everywhere else Tab leaves the editor, so the keyboard can get out.
  if (!LIST_LINE.test(state.doc.lineAt(range.from).text))
    return false
  const edit = indentMarkdownList(state.doc.toString(), { anchor: range.anchor, head: range.head }, direction)
  if (edit)
    view.dispatch({ changes: edit.changes, selection: edit.selection, userEvent: 'input.indent' })
  return true
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data)
    return []
  const files = Array.from(data.files ?? [])
  if (!files.length) {
    for (const item of Array.from(data.items ?? [])) {
      const file = item.kind === 'file' ? item.getAsFile() : null
      if (file)
        files.push(file)
    }
  }
  return files.filter(file => file.type.startsWith('image/'))
}

export function sourceInput(handlers: SourceInputHandlers): Extension {
  const run = (command: RichCommand) => () => {
    handlers.command(command)
    return true
  }
  const bindings: KeyBinding[] = [
    { key: 'Mod-z', run: run('undo'), preventDefault: true },
    { key: 'Mod-Shift-z', run: run('redo'), preventDefault: true },
    { win: 'Mod-y', linux: 'Mod-y', run: run('redo'), preventDefault: true },
    { key: 'Mod-b', run: run('bold') },
    { key: 'Mod-i', run: run('italic') },
    { key: 'Mod-k', run: run('link') },
    { key: 'Mod-e', run: run('code') },
    { key: 'Mod-Shift-x', run: run('strike') },
    { key: 'Mod-Shift-h', run: run('highlight') },
    { key: 'Mod-Alt-m', run: run('comment') },
    ...[0, 1, 2, 3, 4, 5, 6].map(level => ({ key: `Mod-Alt-${level}`, run: run(`heading${level}` as RichCommand) })),
    { key: 'Enter', run: view => continueList(view, handlers) },
    { key: 'Tab', run: view => indentList(view, 1, handlers) },
    { key: 'Shift-Tab', run: view => indentList(view, -1, handlers) },
  ]
  return [
    keymap.of(bindings),
    EditorView.domEventHandlers({
      beforeinput(event) {
        if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')
          return false
        event.preventDefault()
        handlers.command(event.inputType === 'historyUndo' ? 'undo' : 'redo')
        return true
      },
      paste(event, view) {
        const files = imageFiles(event.clipboardData)
        if (!files.length || !handlers.files(files, view.state.selection.main.from))
          return false
        event.preventDefault()
        return true
      },
      drop(event, view) {
        const files = imageFiles(event.dataTransfer)
        if (!files.length)
          return false
        const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
        if (!handlers.files(files, at))
          return false
        event.preventDefault()
        return true
      },
    }),
  ]
}
