/**
 * Build-time pure-JS Shiki highlighter shared by:
 * 1. `remark-shiki-code-props.ts` (`::TuffDemoWrapper` & `:::TuffCodeBlock` YAML `code` props)
 * 2. `rehype-shiki-js.ts` (fenced markdown code blocks)
 *
 * Uses `shiki/core` + `@shikijs/engine-javascript` (ZERO Oniguruma WASM), restricted to the
 * 10 grammars used across TuffEx docs, emitting dual-theme CSS vars (`--shiki-light` / `--shiki-dark`).
 */
import type { HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import { createHighlighterCore } from 'shiki/core'

export const ALLOWED_SHIKI_LANGS = [
  'vue',
  'ts',
  'typescript',
  'js',
  'javascript',
  'bash',
  'sh',
  'scss',
  'css',
  'html',
  'xml',
  'json',
] as const

const LANG_ALIASES: Record<string, string> = {
  vue: 'vue',
  'vue-html': 'vue',
  'vue-template': 'vue',
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  scss: 'scss',
  sass: 'scss',
  css: 'css',
  html: 'html',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  jsonc: 'json',
}

export function normalizeShikiLang(raw?: string | null): string {
  if (!raw || typeof raw !== 'string')
    return 'text'
  const key = raw.trim().toLowerCase()
  return Object.hasOwn(LANG_ALIASES, key) ? LANG_ALIASES[key]! : 'text'
}

export function escapeCodeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let highlighterPromise: Promise<HighlighterCore> | null = null

export function getShikiJsHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [
        githubLight,
        githubDark,
        langVue,
        langTs,
        langJs,
        langBash,
        langScss,
        langCss,
        langHtml,
        langXml,
        langJson,
      ] = await Promise.all([
        import('shiki/themes/github-light.mjs').then(m => m.default ?? m),
        import('shiki/themes/github-dark.mjs').then(m => m.default ?? m),
        import('shiki/langs/vue.mjs').then(m => m.default ?? m),
        import('shiki/langs/typescript.mjs').then(m => m.default ?? m),
        import('shiki/langs/javascript.mjs').then(m => m.default ?? m),
        import('shiki/langs/bash.mjs').then(m => m.default ?? m),
        import('shiki/langs/scss.mjs').then(m => m.default ?? m),
        import('shiki/langs/css.mjs').then(m => m.default ?? m),
        import('shiki/langs/html.mjs').then(m => m.default ?? m),
        import('shiki/langs/xml.mjs').then(m => m.default ?? m),
        import('shiki/langs/json.mjs').then(m => m.default ?? m),
      ])

      return createHighlighterCore({
        themes: [githubLight, githubDark],
        langs: [
          langVue,
          langTs,
          langJs,
          langBash,
          langScss,
          langCss,
          langHtml,
          langXml,
          langJson,
        ],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      })
    })()
  }

  return highlighterPromise
}

const DUAL_THEME_OPTIONS = {
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
  defaultColor: false as const,
}

export async function highlightCodeToHtml(code: string, lang?: string | null): Promise<string> {
  const trimmed = code.replace(/\r\n/g, '\n').trimEnd()
  const normalizedLang = normalizeShikiLang(lang)

  if (!trimmed)
    return '<pre class="shiki shiki-themes github-light github-dark" tabindex="0"><code></code></pre>'

  if (normalizedLang === 'text')
    return `<pre class="shiki shiki-themes github-light github-dark" tabindex="0"><code>${escapeCodeHtml(trimmed)}</code></pre>`

  try {
    const highlighter = await getShikiJsHighlighter()
    return highlighter.codeToHtml(trimmed, {
      lang: normalizedLang,
      ...DUAL_THEME_OPTIONS,
    })
  }
  catch {
    return `<pre class="shiki shiki-themes github-light github-dark" tabindex="0"><code>${escapeCodeHtml(trimmed)}</code></pre>`
  }
}

export async function highlightCodeToHast(code: string, lang?: string | null) {
  const trimmed = code.replace(/\r\n/g, '\n').trimEnd()
  const normalizedLang = normalizeShikiLang(lang)
  if (!trimmed || normalizedLang === 'text')
    return null

  try {
    const highlighter = await getShikiJsHighlighter()
    return highlighter.codeToHast(trimmed, {
      lang: normalizedLang,
      ...DUAL_THEME_OPTIONS,
    })
  }
  catch {
    return null
  }
}
