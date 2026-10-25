import type { MarkedExtension } from 'marked'
import katex from 'katex'
import { createMathExtension } from '../../../../utils/markdown-math-syntax'

/**
 * `$…$` math for `marked`, rendered through KaTeX. The delimiter rules and
 * their false-positive guards live in `utils/markdown-math-syntax.ts`.
 */

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

export function mathExtension(): MarkedExtension {
  return createMathExtension((token, displayMode) => displayMode
    ? `<div class="tx-stream-md__math-block">${renderTex(token.text, true)}</div>`
    : `<span class="tx-stream-md__math-inline">${renderTex(token.text, false)}</span>`)
}
