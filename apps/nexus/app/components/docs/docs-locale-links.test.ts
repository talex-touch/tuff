import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every docs link a reader clicks must carry the locale it was rendered in. An unprefixed
 * `/docs/...` link is a client-side navigation that the server's `/docs → /en/docs` redirect
 * never sees, so the route resolved to English: a Chinese reader clicking the sidebar was
 * switched to English, and a directory route on top of that fell through to "Document not
 * found". Relative content links (`./installation.zh.mdc`) reached the router verbatim and
 * landed on the not-found page.
 *
 * These components lean on Nuxt auto-imports (`useRoute`, `NuxtLink`), so the bindings are
 * pinned line by line, like the rest of the docs suite.
 */
function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const docsSidebar = read('../DocsSidebar.vue')
const syncTable = read('./DocsComponentSyncTable.vue')
const gallery = read('./DocsComponentsGallery.vue')
const proseA = read('../content/ProseA.vue')
const docsPage = read('../../pages/docs/[...slug].vue')

describe('docs links keep the reader\'s locale', () => {
  it('localizes every sidebar link, the section headers included', () => {
    expect(docsSidebar).toMatch(/^\s*:link="linkTarget\(section\) \? localizedDocsPath\(linkTarget\(section\)\) : undefined"$/m)

    const bindings = docsSidebar.split('\n').filter(line => /^\s*:(?:to|link|href)="/.test(line))
    expect(bindings).toHaveLength(4)
    for (const line of bindings)
      expect(line).toMatch(/="(?:linkTarget\([^)]*\) \? )?localizedDocsPath\(/)
  })

  it('localizes the component sync table', () => {
    expect(syncTable).toMatch(/^import \{ toLocalizedDocsPath \} from '#shared\/utils\/docs-path'$/m)
    expect(syncTable).toMatch(/^\s*<NuxtLink :to="toLocalizedDocsPath\(row\.path, localeKey\)" class="docs-sync-table__link">$/m)
  })

  it('localizes the gallery cell labels, which build their own paths', () => {
    // Every cell label goes through docPath; the content-path form `/docs/dev/components/button.zh`
    // opened the English page from a Chinese one.
    expect(gallery).toMatch(/^import \{ toLocalizedDocsPath \} from '#shared\/utils\/docs-path'$/m)
    expect(gallery).toMatch(/^function docPath\(slug: string\) \{\n {2}return toLocalizedDocsPath\(`\/docs\/dev\/components\/\$\{slug\}`, localeKey\.value\)$/m)
    expect(gallery).not.toMatch(/['"`]\/docs\/dev\/components\/\$\{[^}]+\}\.\$\{/)
  })

  it('renders content links through ProseA and resolves relative ones against the document', () => {
    // `:prose="false"` renders native tags; without this mapping every content link was a bare
    // `<a>` and none of the rest of this test ran.
    expect(docsPage).toMatch(/^import ProseA from '~\/components\/content\/ProseA\.vue'$/m)
    expect(docsPage).toMatch(/^const docsProseComponents = \{\n {2}a: ProseA,$/m)

    expect(docsPage).toMatch(/^import \{ DOCS_SOURCE_PATH_KEY \} from '~\/utils\/docs-source-path'$/m)
    expect(docsPage).toMatch(/^provide\(DOCS_SOURCE_PATH_KEY, computed\(\(\) => \{$/m)

    expect(proseA).toMatch(/^const sourcePath = inject\(DOCS_SOURCE_PATH_KEY, null\)$/m)
    expect(proseA).toMatch(/^\s*const sourceLink = resolveDocsSourceLinkHref\(props\.href, sourcePath\?\.value, locale\)$/m)
  })
})
