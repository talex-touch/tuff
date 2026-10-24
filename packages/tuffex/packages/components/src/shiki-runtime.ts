/**
 * Fine-grained Shiki runtime shared by the markdown components.
 *
 * The `shiki` root entry bundles every grammar. Keep the engine, themes, and
 * grammars behind separate dynamic imports instead: the first code block only
 * pays for the requested theme and language.
 */

interface ShikiModule {
  default: unknown
}

type Loader = () => Promise<ShikiModule>

type Token = {
  content: string
  offset: number
  color?: string
}

export interface ShikiRuntime {
  loadTheme: (theme: string) => Promise<void>
  loadLanguage: (language: string) => Promise<void>
  getLoadedLanguages: () => string[]
  getTheme: (theme: string) => { bg: string, fg: string }
  codeToHtml: (code: string, options: { lang: string, theme: string }) => string
  codeToTokens: (code: string, options: { lang: string, theme: string }) => { tokens: Token[][] }
}

interface ShikiCore {
  loadTheme: (...themes: unknown[]) => Promise<void>
  loadLanguage: (...languages: unknown[]) => Promise<void>
  getLoadedLanguages: () => string[]
  getTheme: (theme: string) => { bg: string, fg: string }
  codeToHtml: (code: string, options: { lang: string, theme: string }) => string
  codeToTokens: (code: string, options: { lang: string, theme: string }) => { tokens: Token[][] }
}

const languageLoaders: Record<string, Loader> = {
  bash: () => import('shiki/langs/bash.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  csv: () => import('shiki/langs/csv.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  luau: () => import('shiki/langs/luau.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  mermaid: () => import('shiki/langs/mermaid.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
}

const languageAliases: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  sh: 'bash',
  shell: 'shellscript',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  mdc: 'markdown',
  svg: 'xml',
}

const plainLanguages: Record<string, true> = {
  plain: true,
  plaintext: true,
  text: true,
  txt: true,
}

const themeLoaders: Record<string, Loader> = {
  'catppuccin-latte': () => import('shiki/themes/catppuccin-latte.mjs'),
  'catppuccin-mocha': () => import('shiki/themes/catppuccin-mocha.mjs'),
  'github-dark': () => import('shiki/themes/github-dark.mjs'),
  'github-light': () => import('shiki/themes/github-light.mjs'),
  'one-dark-pro': () => import('shiki/themes/one-dark-pro.mjs'),
  'one-light': () => import('shiki/themes/one-light.mjs'),
  'solarized-dark': () => import('shiki/themes/solarized-dark.mjs'),
  'solarized-light': () => import('shiki/themes/solarized-light.mjs'),
  'vitesse-dark': () => import('shiki/themes/vitesse-dark.mjs'),
  'vitesse-light': () => import('shiki/themes/vitesse-light.mjs'),
}

let runtimePromise: Promise<ShikiRuntime | null> | null = null


export function createShikiRuntime(): Promise<ShikiRuntime | null> {
  runtimePromise ??= (async () => {
    try {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('@shikijs/engine-javascript'),
      ])
      const core = await createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }) as unknown as ShikiCore
      const languageLoads = new Map<string, Promise<void>>()
      const themeLoads = new Map<string, Promise<void>>()
      const loadedLanguages = new Set<string>()
      const loadedThemes = new Set<string>()

      const loadLanguage = (language: string): Promise<void> => {
        const normalizedLanguage = language.trim().toLowerCase()
        const id = languageAliases[normalizedLanguage] ?? normalizedLanguage
        if (plainLanguages[id] || loadedLanguages.has(id))
          return Promise.resolve()
        let pending = languageLoads.get(id)
        if (!pending) {
          const loader = languageLoaders[id]
          if (!loader)
            return Promise.reject(new Error(`Unsupported Shiki language: ${language}`))
          pending = loader().then(module => core.loadLanguage(module.default)).then(() => {
            loadedLanguages.add(id)
          })
          languageLoads.set(id, pending)
        }
        return pending
      }

      const loadTheme = (theme: string): Promise<void> => {
        const id = theme.trim().toLowerCase()
        if (loadedThemes.has(id))
          return Promise.resolve()
        let pending = themeLoads.get(id)
        if (!pending) {
          const loader = themeLoaders[id]
          if (!loader)
            return Promise.reject(new Error(`Unsupported Shiki theme: ${theme}`))
          pending = loader().then(module => core.loadTheme(module.default)).then(() => {
            loadedThemes.add(id)
          })
          themeLoads.set(id, pending)
        }
        return pending
      }

      return {
        loadLanguage,
        loadTheme,
        getLoadedLanguages: () => [...core.getLoadedLanguages(), ...loadedLanguages],
        getTheme: theme => core.getTheme(theme),
        codeToHtml: (code, options) => core.codeToHtml(code, options),
        codeToTokens: (code, options) => core.codeToTokens(code, options),
      }
    }
    catch {
      return null
    }
  })()
  return runtimePromise
}
