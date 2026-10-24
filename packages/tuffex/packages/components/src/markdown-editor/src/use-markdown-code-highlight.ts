import { createShikiRuntime } from '../../shiki-runtime'
import type { MarkdownEditorCodeTheme } from './types'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/**
 * Syntax colours for code blocks, drawn with the CSS Custom Highlight API.
 *
 * The colours are ranges over a block's own text nodes, not spans, so the
 * surfaces go on editing, mapping and serializing exactly the DOM they
 * rendered. shiki loads with the first code block, then a theme and a grammar
 * at a time; a block is coloured again on the frame after its text changes,
 * and until then the live ranges follow the edit. A preset also gives the
 * blocks its theme's background and text colour.
 *
 * Without `CSS.highlights`, code keeps the editor's own colours.
 */

export interface MarkdownCodeHighlightOptions {
  /** The surfaces whose code blocks are coloured. */
  roots: () => Array<HTMLElement | null | undefined>
  theme: () => 'light' | 'dark'
  codeTheme: () => MarkdownEditorCodeTheme
}

interface ThemedToken {
  content: string
  offset: number
  color?: string
}

/** shiki's highlighter, as far as it is used here; shiki itself is only imported lazily. */
interface CodeHighlighter {
  loadTheme: (theme: string) => Promise<void>
  loadLanguage: (lang: string) => Promise<void>
  getTheme: (theme: string) => { bg: string, fg: string }
  codeToTokens: (code: string, options: { lang: string, theme: string }) => { tokens: ThemedToken[][] }
}

interface CodePreset {
  light: string
  dark: string
  /** In place of the theme's own background, which for GitHub is the page's white. */
  background?: Record<'light' | 'dark', string>
}

const PRESETS: Record<Exclude<MarkdownEditorCodeTheme, 'none'>, CodePreset> = {
  github: { light: 'github-light', dark: 'github-dark', background: { light: '#f6f8fa', dark: '#151b23' } },
  one: { light: 'one-light', dark: 'one-dark-pro' },
  vitesse: { light: 'vitesse-light', dark: 'vitesse-dark' },
  catppuccin: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  solarized: { light: 'solarized-light', dark: 'solarized-dark' },
}

/** Languages that are only text: nothing to colour. */
const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext'])

/** Longer blocks stay plain. */
const MAX_CODE = 20_000

/**
 * Blocks longer than this are coloured again only once typing pauses: one
 * pass over 20 000 characters takes some 30 ms, two frames.
 */
const EAGER_CODE = 4_000
const SETTLE = 250

const COLOR = /^#[\da-f]{3,8}$/

type Painted = Array<[Highlight, Range]>

interface CodeBlockState {
  key: string
  text: string
  ranges: Painted
}

let runtime: Promise<CodeHighlighter | null> | null = null
let highlighter: CodeHighlighter | null = null
const loads = new Map<string, Promise<void>>()
const loaded = new Set<string>()
const missing = new Set<string>()

function loadRuntime(): Promise<CodeHighlighter | null> {
  runtime ??= createShikiRuntime().then((created) => {
    highlighter = created
    return created
  })
  return runtime
}

/** Loads a theme or a grammar once; it ends up either loaded or missing for good. */
function load(key: string, run: (highlighter: CodeHighlighter) => Promise<void>): Promise<void> {
  let pending = loads.get(key)
  if (!pending) {
    pending = loadRuntime()
      .then(async (ready) => {
        if (!ready)
          throw new Error('shiki is unavailable')
        await run(ready)
        loaded.add(key)
      })
      .catch(() => {
        missing.add(key)
      })
    loads.set(key, pending)
  }
  return pending
}

// One highlight per colour, shared by every editor on the page; each editor
// adds and removes only its own ranges.
const highlights = new Map<string, Highlight>()
let colorSheet: CSSStyleSheet | null = null

function highlightFor(color: string): Highlight | null {
  let highlight = highlights.get(color)
  if (highlight)
    return highlight
  try {
    if (!colorSheet) {
      // A constructed sheet, so a style-src policy cannot block it.
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      colorSheet = sheet
    }
    const name = `tx-markdown-code-${color.slice(1)}`
    colorSheet.insertRule(`::highlight(${name}) { color: ${color}; }`, colorSheet.cssRules.length)
    highlight = new Highlight()
    CSS.highlights.set(name, highlight)
    highlights.set(color, highlight)
    return highlight
  }
  catch {
    return null
  }
}

function supported(): boolean {
  return typeof document !== 'undefined' && typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS
}

function languageOf(code: HTMLElement): string {
  for (const name of code.classList) {
    if (name.startsWith('language-'))
      return name.slice('language-'.length).toLowerCase()
  }
  return ''
}

interface CodeText {
  text: string
  /** Each text node, and where it starts in `text`. */
  nodes: Array<[Text, number]>
}

/** The block's text as the grammar reads it: a line break is a newline. */
function readCode(code: HTMLElement): CodeText {
  const walker = code.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  const nodes: Array<[Text, number]> = []
  let text = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push([node as Text, text.length])
      text += (node as Text).data
    }
    else if ((node as Element).tagName === 'BR') {
      text += '\n'
    }
  }
  return { text, nodes }
}

/** The text node holding `offset`, searching on from `from`: tokens come in order. */
function seek(nodes: Array<[Text, number]>, offset: number, from: number): number {
  let index = from
  while (index + 1 < nodes.length && nodes[index + 1]![1] <= offset)
    index++
  return index
}

function paint({ text, nodes }: CodeText, lang: string, theme: string, fg: string): Painted {
  if (!nodes.length)
    return []
  let lines: ThemedToken[][]
  try {
    lines = highlighter!.codeToTokens(text, { lang, theme }).tokens
  }
  catch {
    return []
  }
  const painted: Painted = []
  let at = 0
  for (const line of lines) {
    for (const token of line) {
      const color = token.color?.toLowerCase()
      // Text in the theme's own colour needs no range: the block already has it.
      if (!color || color === fg || !COLOR.test(color) || !token.content.trim())
        continue
      const end = token.offset + token.content.length
      at = seek(nodes, token.offset, at)
      const last = seek(nodes, end - 1, at)
      const [startNode, startAt] = nodes[at]!
      const [endNode, endAt] = nodes[last]!
      const highlight = highlightFor(color)
      if (!highlight)
        continue
      const range = startNode.ownerDocument.createRange()
      range.setStart(startNode, Math.min(token.offset - startAt, startNode.length))
      range.setEnd(endNode, Math.min(end - endAt, endNode.length))
      highlight.add(range)
      painted.push([highlight, range])
    }
  }
  return painted
}

function erase(ranges: Painted): void {
  for (const [highlight, range] of ranges)
    highlight.delete(range)
}

export function useMarkdownCodeHighlight(options: MarkdownCodeHighlightOptions) {
  /** The preset's background and text colours, for the root. */
  const style = shallowRef<Record<string, string>>({})
  const blocks = new Map<HTMLElement, CodeBlockState>()
  let observer: MutationObserver | null = null
  let frame = 0
  let active = false
  let changedAt = 0
  let settle: ReturnType<typeof setTimeout> | undefined

  function schedule(): void {
    if (active && !frame)
      frame = requestAnimationFrame(scan)
  }

  function changed(): void {
    changedAt = Date.now()
    schedule()
  }

  function setStyle(next: Record<string, string>): void {
    const current = style.value
    const keys = Object.keys(next)
    if (keys.length !== Object.keys(current).length || keys.some(key => current[key] !== next[key]))
      style.value = next
  }

  function clear(): void {
    for (const block of blocks.values())
      erase(block.ranges)
    blocks.clear()
  }

  function scan(): void {
    frame = 0
    const preset: CodePreset | undefined = PRESETS[options.codeTheme() as keyof typeof PRESETS]
    if (!preset) {
      clear()
      setStyle({})
      return
    }
    const codes = new Set(options.roots().flatMap(root => Array.from(root?.querySelectorAll<HTMLElement>('pre > code') ?? [])))
    for (const [code, block] of blocks) {
      if (!codes.has(code)) {
        erase(block.ranges)
        blocks.delete(code)
      }
    }
    if (!codes.size)
      return

    const mode = options.theme()
    const theme = preset[mode]
    const themeKey = `theme:${theme}`
    if (!loaded.has(themeKey)) {
      // The colours already drawn stay until the new theme is in.
      if (!missing.has(themeKey))
        void load(themeKey, ready => ready.loadTheme(theme)).then(schedule)
      return
    }
    const { bg, fg } = highlighter!.getTheme(theme)
    setStyle({
      '--tx-markdown-editor-code-bg': preset.background?.[mode] ?? bg,
      '--tx-markdown-editor-code-fg': fg,
    })

    const wanted = new Set<string>()
    let deferred = false
    for (const code of codes) {
      const lang = languageOf(code)
      const read = readCode(code)
      const key = `${theme}:${lang}`
      const block = blocks.get(code)
      if (block && block.key === key && block.text === read.text)
        continue
      if (block && read.text.length > EAGER_CODE && Date.now() - changedAt < SETTLE) {
        deferred = true
        continue
      }
      const langKey = `lang:${lang}`
      const colourable = !!lang && !PLAIN.has(lang) && read.text.length <= MAX_CODE && !missing.has(langKey)
      if (colourable && !loaded.has(langKey)) {
        wanted.add(lang)
        continue
      }
      erase(block?.ranges ?? [])
      blocks.set(code, { key, text: read.text, ranges: colourable ? paint(read, lang, theme, fg.toLowerCase()) : [] })
    }
    for (const lang of wanted)
      void load(`lang:${lang}`, ready => ready.loadLanguage(lang)).then(schedule)
    if (deferred) {
      clearTimeout(settle)
      settle = setTimeout(schedule, SETTLE)
    }
  }

  watch([options.theme, options.codeTheme], schedule)

  onMounted(() => {
    if (!supported() || typeof MutationObserver === 'undefined' || typeof requestAnimationFrame !== 'function')
      return
    active = true
    observer = new MutationObserver(changed)
    for (const root of options.roots()) {
      if (root)
        observer.observe(root, { childList: true, subtree: true, characterData: true })
    }
    schedule()
  })

  onBeforeUnmount(() => {
    active = false
    observer?.disconnect()
    observer = null
    if (frame)
      cancelAnimationFrame(frame)
    frame = 0
    clearTimeout(settle)
    clear()
  })

  return { style }
}
