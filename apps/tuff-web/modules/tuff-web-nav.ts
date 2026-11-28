import { resolve } from 'node:path'
import { addTemplate, addTypeTemplate, defineNuxtModule, updateTemplates } from 'nuxt/kit'
import { buildTuffWebNavigationFromDisk } from '../build/tuff-web-nav-builder'
import type { SupportedLocale } from '../build/tuff-web-prerender-routes'

/**
 * Generates static build-time navigation modules inside `.nuxt/`:
 * - `#build/tuff-web-docs-nav-en`
 * - `#build/tuff-web-docs-nav-zh`
 * - `#build/tuff-web-docs-nav`
 *
 * Zero runtime `/api/docs/navigation/*` HTTP calls!
 */
export default defineNuxtModule({
  meta: { name: 'tuff-web-nav' },
  setup(_options, nuxt) {
    const contentDocsDir = resolve(nuxt.options.rootDir, 'content/docs')

    const emitLocaleTemplate = (locale: SupportedLocale) => {
      addTemplate({
        filename: `tuff-web-docs-nav-${locale}.mjs`,
        write: true,
        getContents: () => {
          const nav = buildTuffWebNavigationFromDisk(contentDocsDir, locale)
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
      filename: 'tuff-web-docs-nav.mjs',
      write: true,
      getContents: () => [
        'export async function loadTuffWebDocsNav(locale) {',
        '  if (locale === \'zh\') {',
        '    const mod = await import(\'#build/tuff-web-docs-nav-zh\');',
        '    return mod.navigation;',
        '  }',
        '  const mod = await import(\'#build/tuff-web-docs-nav-en\');',
        '  return mod.navigation;',
        '}',
        '',
      ].join('\n'),
    })

    addTypeTemplate({
      filename: 'types/tuff-web-docs-nav.d.ts',
      getContents: () => `
declare module '#build/tuff-web-docs-nav' {
  export type TuffWebNavLocale = 'en' | 'zh'
  export type DocsSectionKey = 'guide' | 'dev'

  export interface TuffWebNavItem {
    path: string
    slug: string
    section: DocsSectionKey | 'root'
    group: string
    title: string
    description: string
    tags: string[]
  }

  export interface TuffWebNavGroup {
    key: string
    title: string
    entryPath: string | null
    items: TuffWebNavItem[]
  }

  export interface TuffWebNavSection {
    key: DocsSectionKey
    entryPath: string
    standalone: TuffWebNavItem[]
    groups: TuffWebNavGroup[]
  }

  export interface TuffWebLocaleNavigation {
    locale: TuffWebNavLocale
    sections: TuffWebNavSection[]
    items: TuffWebNavItem[]
  }

  export function loadTuffWebDocsNav(locale: TuffWebNavLocale): Promise<TuffWebLocaleNavigation>
}

declare module '#build/tuff-web-docs-nav-en' {
  import type { TuffWebLocaleNavigation } from '#build/tuff-web-docs-nav'
  export const navigation: TuffWebLocaleNavigation
  export default navigation
}

declare module '#build/tuff-web-docs-nav-zh' {
  import type { TuffWebLocaleNavigation } from '#build/tuff-web-docs-nav'
  export const navigation: TuffWebLocaleNavigation
  export default navigation
}
`,
    })

    nuxt.hook('builder:watch', async (_event, relativePath) => {
      if (relativePath.replace(/\\/g, '/').startsWith('content/docs/')) {
        await updateTemplates({
          filter: template => template.filename.startsWith('tuff-web-docs-nav'),
        })
      }
    })
  },
})
