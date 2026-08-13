import type { MarkedExtension, TokenizerAndRendererExtension } from 'marked'
import katex from 'katex'

/**
 * `$…$` math for `marked`.
 *
 * The whole difficulty is the delimiter. `$` is ordinary prose — prices,
 * shell variables, regex anchors — so a naive rule turns "it costs $5 to $9"
 * into a formula and eats the text between. The guards below exist to make
 * false positives rare, accepting that some real math written sloppily will
 * render as plain text. That trade is deliberate: unrendered math is a small
 * disappointment, swallowed prose is data loss on screen.
 */

/** KaTeX is happy to grow without bound; a runaway `$` should not hang the render. */
const MAX_TEX_LENGTH = 2000

export interface MathToken {
  type: 'mathInline' | 'mathBlock'
  raw: string
  text: string
}

/**
 * Whether `$…$` spanning `text` reads as math rather than as two currency
 * amounts. Exported for tests: it is the entire risk surface of this feature.
 */
export function looksLikeInlineMath(tex: string): boolean {
  if (!tex || tex.length > MAX_TEX_LENGTH) return false
  // `$ x $` is prose spacing, not math delimiters — CommonMark-adjacent
  // implementations all require the delimiters to hug their content.
  if (/^\s/.test(tex) || /\s$/.test(tex)) return false
  // Inline math is inline: a newline means the opening `$` was never closed on
  // this line and something further down happened to match.
  if (tex.includes('\n')) return false
  // "$5 to 9$" — a bare number on each side is overwhelmingly currency.
  if (/^\d+(?:[.,]\d+)?$/.test(tex)) return false
  return true
}

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      // A malformed formula must not take the whole reply down with it; KaTeX
      // renders the offending source in its error colour instead.
      throwOnError: false,
      output: 'html'
    })
  } catch {
    // `throwOnError: false` covers parse errors, not internal failures.
    return displayMode ? `<pre>${tex}</pre>` : `<code>${tex}</code>`
  }
}

const blockRule = /^ {0,3}\$\$([\s\S]+?)\$\$(?:\n|$)/
const inlineRule = /^\$((?:\\.|[^$\\])+?)\$/

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    return src.indexOf('$$')
  },
  tokenizer(src: string) {
    const match = blockRule.exec(src)
    if (!match) return undefined
    const tex = match[1]!.trim()
    if (!tex || tex.length > MAX_TEX_LENGTH) return undefined
    return { type: 'mathBlock', raw: match[0], text: tex }
  },
  renderer(token) {
    return `<div class="tx-stream-md__math-block">${renderTex((token as MathToken).text, true)}</div>`
  }
}

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src: string) {
    return src.indexOf('$')
  },
  tokenizer(src: string) {
    const match = inlineRule.exec(src)
    if (!match) return undefined
    const tex = match[1]!
    if (!looksLikeInlineMath(tex)) return undefined
    return { type: 'mathInline', raw: match[0], text: tex }
  },
  renderer(token) {
    return `<span class="tx-stream-md__math-inline">${renderTex((token as MathToken).text, false)}</span>`
  }
}

/**
 * Block first: `$$` would otherwise be consumed as an empty inline span before
 * the block tokenizer ever sees it.
 */
export function mathExtension(): MarkedExtension {
  return { extensions: [mathBlock, mathInline] }
}
