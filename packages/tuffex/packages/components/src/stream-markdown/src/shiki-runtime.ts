/**
 * Lazy singleton around shiki so the grammar/theme machinery never enters the
 * initial chunk: everything loads through dynamic imports on the first
 * settled code block, and a failed load degrades permanently to plain text
 * instead of retry-looping.
 *
 * Structural interface instead of shiki's own types so this file stays
 * type-checkable without reaching into the (lazily loaded) package.
 */
interface ShikiHighlighter {
  loadLanguage: (lang: string) => Promise<void>
  getLoadedLanguages: () => string[]
  codeToHtml: (code: string, options: { lang: string, theme: string }) => string
}

const THEMES = {
  light: 'github-light',
  dark: 'github-dark',
} as const

let highlighterPromise: Promise<ShikiHighlighter | null> | null = null

async function createRuntime(): Promise<ShikiHighlighter | null> {
  try {
    // The root `shiki` bundle registry is tiny — grammars and themes stay
    // behind their own dynamic imports and only load when requested. The JS
    // regex engine avoids shipping the oniguruma wasm entirely.
    const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki'),
      import('@shikijs/engine-javascript'),
    ])

    const highlighter = await createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    })

    return highlighter as unknown as ShikiHighlighter
  }
  catch {
    return null
  }
}

function getHighlighter(): Promise<ShikiHighlighter | null> {
  if (!highlighterPromise)
    highlighterPromise = createRuntime()
  return highlighterPromise
}

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

  const highlighter = await getHighlighter()
  if (!highlighter)
    return null

  if (!highlighter.getLoadedLanguages().includes(id)) {
    try {
      await highlighter.loadLanguage(id)
    }
    catch {
      return null
    }
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
