import type { MarkedExtension, RendererThis, Token, Tokens, TokenizerAndRendererExtension, TokenizerThis } from 'marked'
import type { MarkdownEmoji } from './emoji'
import type { CalloutToken, MarkdownCalloutTitles } from './markdown-callout'
import type { MarkdownEditorLabels } from './types'
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { createMathExtension } from '../../../../utils/markdown-math-syntax'
import { markdownEmojiText } from './emoji'
import { CALLOUT_CLASS, CALLOUT_TITLE_CLASS, calloutTitles, markCallout } from './markdown-callout'
import { highlightEnd } from './markdown-highlight'
import { MARKDOWN_EDITOR_CALLOUT_ICONS } from './toolbar-icons'
import { MARKDOWN_EDITOR_CALLOUT_TYPES, MARKDOWN_EDITOR_DEFAULT_LABELS } from './types'

/**
 * Markdown to DOM for the rich surface and the preview, one top-level block at
 * a time.
 *
 * Both views keep one element per block, so an edit re-renders only the blocks
 * whose source changed, and every element can say which slice of the source it
 * came from. Spans the surface cannot edit as text — a formula, an image, an
 * emoji shortcode, a callout's marker, raw HTML — render as atoms that carry
 * their exact source in `data-md-src`, which the serializer writes back
 * verbatim.
 *
 * KaTeX is applied after sanitizing: DOMPurify strips the MathML `semantics`
 * and `annotation` elements KaTeX emits, so formulas leave the parser as
 * placeholders and are typeset into the sanitized DOM.
 *
 * Source and TeX stay URI-encoded in the DOM (`data-md-src`, `data-tx-tex`):
 * DOMPurify drops any attribute whose value contains `]>` or `</style`, which
 * is ordinary in code, HTML and formulas, and decoded raw HTML in an attribute
 * would put a `<script>` back into the page's markup.
 */

export interface MarkdownRenderOptions {
  math: boolean
  emoji: boolean
  highlight: boolean
  callouts: boolean
  sanitize: boolean
}

export interface MarkdownSegment {
  type: string
  /** The block's source, without the newlines that end it. */
  raw: string
  from: number
  to: number
  token: Token
}

export interface MarkdownSegmentation {
  segments: MarkdownSegment[]
  /** `gaps[i]` is the source before `segments[i]`; the last entry trails the document. */
  gaps: string[]
}

export interface MarkdownHydrateOptions {
  editable: boolean
  /** Task checkboxes toggle their `[ ]` marker. */
  checkable: boolean
  /** The preview opens links in a new tab; on the editing surface they stay inert. */
  externalLinks: boolean
  decorateUpload?: (card: HTMLElement, id: string) => void
}

export const MARKDOWN_UPLOAD_PREFIX = '#upload-'

const EMOJI_RULE = /^:([a-z0-9_+-]{1,40}):/
// `start` must never point inside a URL scheme: cutting `https:` off its `//`
// is enough to stop marked from autolinking the address.
const EMOJI_START = /:[a-z0-9_+-]{1,40}:/
const CACHE_LIMIT = 2000
/** `- ` or `1. ` alone: an empty item in CommonMark, a paragraph to marked. */
const EMPTY_ITEM = /^[ \t]{0,3}(?:[-*+]|(\d{1,9})[.)])[ \t]+$/
/** A task item's box with nothing after it, which marked reads as the text `[ ]`. */
const EMPTY_TASK = /^\[([ xX])\][ \t]*$/

type Katex = typeof import('katex').default

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function trimBlockRaw(raw: string): string {
  return raw.replace(/\n+$/, '')
}

function sourceAttr(raw: string): string {
  return `data-md-atom="" data-md-src="${encodeURIComponent(raw)}"`
}

function emojiHtml(raw: string, emoji: MarkdownEmoji): string {
  if (emoji.src)
    return `<span class="tx-markdown-editor__emoji is-custom" ${sourceAttr(raw)} title="${escapeHtml(raw)}"><img src="${escapeHtml(emoji.src)}" alt="${escapeHtml(raw)}" draggable="false">\u200B</span>`
  return `<span class="tx-markdown-editor__emoji" ${sourceAttr(raw)} title="${escapeHtml(raw)}">${emoji.char}</span>`
}

/** `querySelectorAll`, plus `root` itself when it matches: a block can be its own atom. */
function selectAll<T extends Element>(root: ParentNode, selector: string): T[] {
  const found = Array.from(root.querySelectorAll<T>(selector))
  if ((root as Element).nodeType === 1 && (root as Element).matches(selector))
    found.unshift(root as T)
  return found
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/** Whether the host loaded KaTeX's stylesheet; without it the HTML output is unreadable. */
function hasKatexStylesheet(): boolean {
  if (typeof document === 'undefined' || !document.body || typeof getComputedStyle !== 'function')
    return false
  const probe = document.createElement('span')
  probe.className = 'katex'
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const family = getComputedStyle(probe).fontFamily
  probe.remove()
  return /katex/i.test(family)
}

function highlightExtension(): TokenizerAndRendererExtension {
  return {
    name: 'mark',
    level: 'inline',
    start: (src: string) => src.indexOf('=='),
    tokenizer(this: TokenizerThis, src: string) {
      const line = src.indexOf('\n')
      const end = highlightEnd(src, 0, line < 0 ? src.length : line)
      if (end < 0)
        return undefined
      const text = src.slice(2, end)
      return { type: 'mark', raw: src.slice(0, end + 2), text, tokens: this.lexer.inlineTokens(text) }
    },
    renderer(this: RendererThis, token) {
      return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`
    },
  }
}

export class MarkdownRenderer {
  private readonly marked = new Marked({ gfm: true, breaks: true })
  private readonly html = new Map<string, string>()
  private readonly typeset = new Map<string, string>()
  private linksKey = '{}'
  private katex: Katex | null = null
  private katexRequested = false
  private katexOutput: 'htmlAndMathml' | 'mathml' | null = null
  private emojiMap: ReadonlyMap<string, MarkdownEmoji> | null = null
  private calloutTitles: MarkdownCalloutTitles = calloutTitles(MARKDOWN_EDITOR_DEFAULT_LABELS)
  /**
   * Bumped whenever the same block source can render differently: reference
   * definitions changed, the emoji set arrived, the labels changed. Views
   * re-render on a change.
   */
  version = 0

  /** Called when a lazily loaded asset (KaTeX) arrives and placeholders can be upgraded. */
  onAssetsReady: (() => void) | null = null
  readonly options: MarkdownRenderOptions

  constructor(options: MarkdownRenderOptions) {
    this.options = options
    const extensions: TokenizerAndRendererExtension[] = []
    if (options.math) {
      const math = createMathExtension((token, display) => {
        const source = sourceAttr(trimBlockRaw(token.raw))
        const tex = `data-tx-tex="${encodeURIComponent(token.text)}"`
        const fallback = escapeHtml(token.text)
        return display
          ? `<div class="tx-markdown-editor__math is-block" ${source} ${tex}>${fallback}</div>`
          : `<span class="tx-markdown-editor__math" ${source} ${tex}>${fallback}</span>`
      })
      extensions.push(...(math.extensions as TokenizerAndRendererExtension[]))
    }
    if (options.emoji)
      extensions.push(this.emojiExtension())
    if (options.highlight)
      extensions.push(highlightExtension())
    const titles = () => this.calloutTitles

    const use: MarkedExtension = {
      extensions,
      renderer: {
        blockquote(this: RendererThis, token: Tokens.Blockquote) {
          const type = (token as CalloutToken).callout
          if (!type)
            return false
          const [paragraph, ...rest] = token.tokens as [Tokens.Paragraph, ...Token[]]
          const [marker, ...inline] = paragraph.tokens
          const icon = `<span class="tx-markdown-editor__callout-icon ${MARKDOWN_EDITOR_CALLOUT_ICONS[type]}" aria-hidden="true"></span>`
          const title = `<span class="${CALLOUT_TITLE_CLASS}" ${sourceAttr(marker!.raw.trim())}>${icon}${escapeHtml(titles()[type])}</span>`
          // `> [!NOTE]` over an empty `> `: that line is there, for the caret,
          // as the surface makes it on Enter after the title.
          const body = !inline.length && /\n$/.test(paragraph.raw) && rest.every(item => item.type === 'space')
            ? '<br><br>'
            : this.parser.parseInline(inline)
          return `<blockquote class="${CALLOUT_CLASS} is-${type}">\n<p>${title}${body}</p>\n${this.parser.parse(rest)}</blockquote>\n`
        },
        // An empty item, so the caret can stand in it: what the toolbar and
        // the slash commands make on an empty line.
        paragraph({ raw }: Tokens.Paragraph) {
          const marker = EMPTY_ITEM.exec(raw.replace(/\n+$/, ''))
          if (!marker)
            return false
          const start = marker[1] ? Number(marker[1]) : 1
          const open = marker[1] ? `<ol${start === 1 ? '' : ` start="${start}"`}>` : '<ul>'
          return `${open}\n<li></li>\n${marker[1] ? '</ol>' : '</ul>'}\n`
        },
        // marked's own, with the language on the block too, for its label,
        // and keeping a blank last line, which marked drops: the caret has to
        // be able to stand on it.
        code({ text, lang, escaped }: Tokens.Code) {
          const language = lang?.match(/^\S*/)?.[0]
          const name = language ? escapeHtml(language) : ''
          const body = `${text}\n`
          const pre = name ? `<pre data-lang="${name}"><code class="language-${name}">` : '<pre><code>'
          return `${pre}${escaped ? body : escapeHtml(body)}</code></pre>\n`
        },
        checkbox({ checked }: Tokens.Checkbox) {
          return `<input type="checkbox" class="tx-markdown-editor__checkbox"${checked ? ' checked=""' : ''}> `
        },
        listitem(item: Tokens.ListItem) {
          // With its box, as the surface makes it on Enter in a task.
          const empty = item.task ? null : EMPTY_TASK.exec(item.text)
          if (empty)
            return `<li class="tx-markdown-editor__task"><input type="checkbox" class="tx-markdown-editor__checkbox"${empty[1] === ' ' ? '' : ' checked=""'}> <br></li>\n`
          if (!item.task)
            return false
          return `<li class="tx-markdown-editor__task">${this.parser.parse(item.tokens)}</li>\n`
        },
        image({ href, title, text, raw }: Tokens.Image) {
          const source = sourceAttr(raw)
          if (href.startsWith(MARKDOWN_UPLOAD_PREFIX)) {
            const id = escapeHtml(href.slice(MARKDOWN_UPLOAD_PREFIX.length))
            return `<span class="tx-markdown-editor__upload" ${source} data-upload-id="${id}"><span class="tx-markdown-editor__upload-name">${escapeHtml(text)}</span></span>`
          }
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
          return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr} ${source}>`
        },
        html(token: Tokens.HTML | Tokens.Tag) {
          if (!token.block)
            return false
          return `<div class="tx-markdown-editor__html" ${sourceAttr(trimBlockRaw(token.raw))}>${token.text}</div>`
        },
      },
    }
    this.marked.use(use)
  }

  private emojiExtension(): TokenizerAndRendererExtension {
    return {
      name: 'emoji',
      level: 'inline',
      start: (src: string) => {
        const index = src.search(EMOJI_START)
        return index < 0 ? undefined : index
      },
      tokenizer: (src: string) => {
        const match = EMOJI_RULE.exec(src)
        const emoji = match ? this.emojiMap?.get(match[1]!) : undefined
        if (!match || !emoji)
          return undefined
        return { type: 'emoji', raw: match[0], text: markdownEmojiText(emoji), emoji }
      },
      renderer: token => emojiHtml(token.raw, token.emoji),
    }
  }

  /** Shortcodes render once the map is in; until then they stay literal text. */
  setEmoji(map: ReadonlyMap<string, MarkdownEmoji> | null): void {
    if (map === this.emojiMap)
      return
    this.emojiMap = map
    this.html.clear()
    this.version++
  }

  /** The words the renderer writes into documents: callout titles. True when they changed. */
  setLabels(labels: MarkdownEditorLabels): boolean {
    const next = calloutTitles(labels)
    if (MARKDOWN_EDITOR_CALLOUT_TYPES.every(type => next[type] === this.calloutTitles[type]))
      return false
    this.calloutTitles = next
    this.html.clear()
    this.version++
    return true
  }

  segment(doc: string): MarkdownSegmentation {
    const tokens = this.marked.lexer(doc)
    // Reference links resolve against definitions anywhere in the document, so
    // a block's HTML depends on more than its own source.
    const linksKey = JSON.stringify(tokens.links ?? {})
    if (linksKey !== this.linksKey) {
      this.linksKey = linksKey
      this.html.clear()
      this.version++
    }

    const segments: MarkdownSegment[] = []
    const gaps: string[] = []
    let pos = 0
    let gap = ''
    for (const token of tokens) {
      let start = pos
      if (!doc.startsWith(token.raw, pos)) {
        const found = doc.indexOf(token.raw, pos)
        if (found >= 0)
          start = found
      }
      gap += doc.slice(pos, start)
      pos = start + token.raw.length
      // Gaps come from the document, not the token: marked can hand back a
      // raw that is not in it, `- a\n` for a list that ends it in one space.
      if (token.type === 'space') {
        gap += doc.slice(start, pos)
        continue
      }
      const raw = trimBlockRaw(token.raw)
      gaps.push(gap)
      segments.push({ type: token.type, raw, from: start, to: start + raw.length, token })
      gap = doc.slice(start + raw.length, pos)
    }
    gaps.push(gap + doc.slice(Math.min(pos, doc.length)))
    return { segments, gaps }
  }

  /** Sanitized HTML of one block, before hydration. */
  blockHtml(segment: MarkdownSegment): string {
    const key = segment.raw
    let html = this.html.get(key)
    if (html !== undefined)
      return html

    if (segment.token.type === 'def') {
      // marked renders definitions as nothing; the surface shows them so they
      // can be seen and deleted, the preview hides them.
      html = `<div class="tx-markdown-editor__def" ${sourceAttr(segment.raw)}>${escapeHtml(segment.raw)}</div>`
    }
    else {
      if (this.options.callouts)
        markCallout(segment.token)
      try {
        html = this.marked.parser([segment.token])
      }
      catch {
        html = `<p>${escapeHtml(segment.raw)}</p>`
      }
      if (this.options.sanitize)
        html = DOMPurify.sanitize(html)
    }

    if (this.html.size >= CACHE_LIMIT)
      this.html.clear()
    this.html.set(key, html)
    return html
  }

  /** The block sources of a short snippet lexed on its own, for checks that need block boundaries. */
  blockRaws(source: string): string[] {
    return this.marked.lexer(source).filter(token => token.type !== 'space').map(token => trimBlockRaw(token.raw))
  }

  /** Inline tokens of one line of source, with this renderer's extensions. */
  inlineTokens(source: string): Token[] {
    try {
      return this.marked.Lexer.lexInline(source, this.marked.defaults)
    }
    catch {
      return []
    }
  }

  private ensureKatex(): void {
    if (this.katex || this.katexRequested)
      return
    this.katexRequested = true
    import('katex')
      .then((mod) => {
        this.katex = ((mod as { default?: Katex }).default ?? mod) as Katex
        this.onAssetsReady?.()
      })
      .catch(() => {
        // Formulas stay as their TeX source.
      })
  }

  /** KaTeX markup for `tex`, or null while KaTeX is still loading. */
  typesetTex(tex: string, display: boolean): string | null {
    if (!this.katex) {
      this.ensureKatex()
      return null
    }
    const key = `${display ? 'D' : 'I'}${tex}`
    let html = this.typeset.get(key)
    if (html === undefined) {
      this.katexOutput ??= hasKatexStylesheet() ? 'htmlAndMathml' : 'mathml'
      try {
        html = this.katex.renderToString(tex, {
          displayMode: display,
          throwOnError: false,
          output: this.katexOutput,
          strict: 'ignore',
        })
      }
      catch {
        html = escapeHtml(tex)
      }
      if (this.typeset.size >= CACHE_LIMIT)
        this.typeset.clear()
      this.typeset.set(key, html)
    }
    return html
  }

  /** Upgrade placeholders and set the DOM-only attributes the sanitizer would have stripped. */
  hydrate(root: ParentNode, options: MarkdownHydrateOptions): void {
    for (const el of selectAll<HTMLElement>(root, '[data-tx-tex]')) {
      if (el.dataset.txTypeset === '1')
        continue
      const html = this.typesetTex(safeDecode(el.dataset.txTex ?? ''), el.classList.contains('is-block'))
      if (html === null)
        continue
      el.innerHTML = html
      el.dataset.txTypeset = '1'
    }
    if (options.editable) {
      for (const atom of selectAll<HTMLElement>(root, '[data-md-atom]'))
        atom.contentEditable = 'false'
    }
    for (const img of Array.from(root.querySelectorAll('img'))) {
      img.loading = 'lazy'
      img.decoding = 'async'
      img.draggable = false
    }
    if (options.externalLinks) {
      for (const link of Array.from(root.querySelectorAll('a[href]'))) {
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
      }
    }
    for (const box of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
      box.disabled = !options.checkable
      box.tabIndex = -1
    }
    if (options.decorateUpload) {
      for (const card of selectAll<HTMLElement>(root, '[data-upload-id]'))
        options.decorateUpload(card, card.dataset.uploadId ?? '')
    }
  }
}
