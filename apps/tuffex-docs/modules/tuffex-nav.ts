import { resolve } from 'node:path'
import { addTemplate, addTypeTemplate, defineNuxtModule, updateTemplates } from 'nuxt/kit'
import { buildTuffexNavigationFromDisk, type TuffexNavLocale } from '../build/tuffex-nav-builder'

/**
 * Generates static build-time navigation modules inside `.nuxt/`:
 * - `#build/tuffex-docs-nav-en`  (exports `navigation` + default)
 * - `#build/tuffex-docs-nav-zh`  (exports `navigation` + default)
 * - `#build/tuffex-docs-nav`     (exports `loadTuffexDocsNav(locale)` lazy per-locale loader)
 *
 * Benefits:
 * 1. Synchronous SSR rendering with zero HTTP calls.
 * 2. Exactly 1 shared immutable client chunk per locale (`tuffex-nav-en` / `tuffex-nav-zh`).
 * 3. Zero nav duplication inside per-page `_payload.json` files.
 */
export default defineNuxtModule({
  meta: { name: 'tuffex-nav' },
  setup(_options, nuxt) {
    const contentDocsDir = resolve(nuxt.options.rootDir, 'content/docs')

    const emitLocaleTemplate = (locale: TuffexNavLocale) => {
      addTemplate({
        filename: `tuffex-docs-nav-${locale}.mjs`,
        write: true,
        getContents: () => {
          const nav = buildTuffexNavigationFromDisk(contentDocsDir, locale)
          return [
            `export const navigation = ${JSON.stringify(nav)};`,
            'export default navigation;',
            '',
          ].join('\n')
        },
      })
    }

    emitLocaleTemplate('en')
    emitLocaleTemplate('zh')

    addTemplate({
      filename: 'tuffex-docs-nav.mjs',
      write: true,
      getContents: () => [
        'export async function loadTuffexDocsNav(locale) {',
        '  if (locale === \'zh\') {',
        '    const mod = await import(\'#build/tuffex-docs-nav-zh\');',
        '    return mod.navigation;',
        '  }',
        '  const mod = await import(\'#build/tuffex-docs-nav-en\');',
        '  return mod.navigation;',
        '}',
        '',
      ].join('\n'),
    })

    addTypeTemplate({
      filename: 'types/tuffex-docs-nav.d.ts',
      getContents: () => `
declare module '#build/tuffex-docs-nav' {
  export type TuffexNavLocale = 'en' | 'zh'
  export type TuffexSuiteKey = 'concepts' | 'templates' | 'base' | 'pro' | 'ai' | 'data' | 'flow' | 'motion'
  export type TuffexSyncStatus = 'not_started' | 'in_progress' | 'migrated' | 'verified'

  export interface TuffexNavItem {
    path: string
    slug: string
    title: string
    description: string
    suite: TuffexSuiteKey
    category: string | null
    status: string | null
    since: string | null
    syncStatus: TuffexSyncStatus
    verified: boolean
    tags: string[]
    order: number
  }

  export interface TuffexNavGroup {
    key: string
    i18nKey: string
    kind: 'category' | 'concept-group'
    items: TuffexNavItem[]
  }

  export interface TuffexNavSuite {
    key: TuffexSuiteKey
    entryPath: string
    standalone: TuffexNavItem[]
    groups: TuffexNavGroup[]
  }

  export interface TuffexLocaleNavigation {
    locale: TuffexNavLocale
    suites: TuffexNavSuite[]
    items: TuffexNavItem[]
  }

  export function loadTuffexDocsNav(locale: TuffexNavLocale): Promise<TuffexLocaleNavigation>
}

declare module '#build/tuffex-docs-nav-en' {
  import type { TuffexLocaleNavigation } from '#build/tuffex-docs-nav'
  export const navigation: TuffexLocaleNavigation
  export default navigation
}

declare module '#build/tuffex-docs-nav-zh' {
  import type { TuffexLocaleNavigation } from '#build/tuffex-docs-nav'
  export const navigation: TuffexLocaleNavigation
  export default navigation
}
`,
    })

    nuxt.hook('builder:watch', async (_event, relativePath) => {
      if (relativePath.replace(/\\/g, '/').startsWith('content/docs/')) {
        await updateTemplates({
          filter: template => template.filename.startsWith('tuffex-docs-nav'),
        })
      }
    })
  },
})
