import { createShikiRuntime } from '../../shiki-runtime'
import type { ShikiRuntime } from '../../shiki-runtime'

const THEMES = {
  light: 'github-light',
  dark: 'github-dark',
} as const

let highlighterPromise: Promise<ShikiRuntime | null> | null = null

/**
 * Lazy singleton around shiki so the grammar/theme machinery never enters the
 * initial chunk: everything loads through dynamic imports on the first
 * settled code block, and a failed load degrades permanently to plain text
 * instead of retry-looping.
 *
 * The shared runtime uses the core entry instead of the root `shiki` bundle,
 * so grammars and themes remain separate network chunks.
 */

/**
 * Highlights to shiki HTML, or returns null for every case that should keep
 * the caller's escaped plain-text rendering: no language, unknown language,
 * or an unavailable runtime.
 */
export async function highlightToHtml(
  code: string,
  lang: string,
  theme: 'light' | 'dark',
): Promise<string | null> {
  const id = lang.trim().toLowerCase()
  if (!id)
    return null

  const highlighter = await (highlighterPromise ??= createShikiRuntime())
  if (!highlighter)
    return null

  try {
    await highlighter.loadTheme(theme === 'dark' ? THEMES.dark : THEMES.light)
    await highlighter.loadLanguage(id)
  }
  catch {
    return null
  }

  try {
    return highlighter.codeToHtml(code, {
      lang: id,
      theme: theme === 'dark' ? THEMES.dark : THEMES.light,
    })
  }
  catch {
    return null
  }
}
