import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { addTypeTemplate, defineNuxtModule } from 'nuxt/kit'
import type { Plugin, ViteDevServer } from 'vite'
import { buildTuffexNavigationFromDisk } from '../build/tuffex-nav-builder'
import { contentFileToAppRoute, type SupportedLocale } from '../build/tuffex-prerender-routes'
import {
  createMdcVuePlugin,
  type MdcComponentImportResolution,
  type MdcDocRouteEntry,
  type MdcMetaContext,
  type MdcPluginEntry,
} from './mdc-sfc-compiler'
import { rehypeShikiJs } from './rehype-shiki-js'
import { remarkCloseComponentTags } from './remark-close-component-tags'
import { remarkMath } from './remark-math'
import { remarkMermaid } from './remark-mermaid'
import { remarkShikiCodeProps } from './remark-shiki-code-props'

const VIRTUAL_DOC_PAGES_ID = 'virtual:tuffex-doc-pages'
const TUFFEX_BASE_URL = '/tuffex'

const TUFFEX_REMARK_PLUGINS: Record<string, MdcPluginEntry> = {
  'remark-mermaid': { instance: remarkMermaid },
  'remark-close-component-tags': { instance: remarkCloseComponentTags },
  'remark-math': { instance: remarkMath },
  'remark-shiki-code-props': { instance: remarkShikiCodeProps },
}

const TUFFEX_REHYPE_PLUGINS: Record<string, MdcPluginEntry> = {
  'rehype-shiki-js': { instance: rehypeShikiJs },
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

function walkMdcFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      files.push(...walkMdcFiles(full))
    else if (st.isFile() && /\.mdc$/i.test(entry))
      files.push(full)
  }
  return files.sort((a, b) => a.localeCompare(b))
}

function buildRawMarkdownPath(slug: string, locale: SupportedLocale): string {
  if (!slug || slug === 'index')
    return `${TUFFEX_BASE_URL}/${locale}/index.md`
  if (slug === 'concepts' || slug === 'concepts/index')
    return `${TUFFEX_BASE_URL}/${locale}/concepts/index.md`
  return `${TUFFEX_BASE_URL}/${locale}/${slug}.md`
}

function firstString(...values: unknown[]): string | null {
  for (const val of values) {
    if (typeof val === 'string' && val.trim())
      return val.trim()
  }
  return null
}

function fallbackTitleFromSlug(slug: string): string {
  if (!slug)
    return 'TuffEx'
  const leaf = slug.split('/').filter(Boolean).pop() ?? slug
  return leaf
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

function discoverTuffexDocRoutes(contentDocsDir: string): MdcDocRouteEntry[] {
  const entries: MdcDocRouteEntry[] = []
  for (const filePath of walkMdcFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, filePath)
    const mapped = contentFileToAppRoute(rel)
    if (!mapped)
      continue
    entries.push({
      key: `${mapped.locale}:${mapped.slug}`,
      filePath: toPosix(filePath),
    })
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

function generateTuffexVirtualIndexCode(entries: MdcDocRouteEntry[]): string {
  const loaderLines = entries.map(
    entry => `  ${JSON.stringify(entry.key)}: () => import(${JSON.stringify(entry.filePath)}),`,
  )

  return [
    'const DOC_PAGE_LOADERS = {',
    ...loaderLines,
    '};',
    '',
    'export function resolveDocRouteKey(locale, slug) {',
    '  const loc = locale === \'zh\' ? \'zh\' : \'en\';',
    '  const clean = typeof slug === \'string\'',
    '    ? slug.replace(/\\\\/g, \'/\').replace(/^\\/+|\\/+$/g, \'\')',
    '    : \'\';',
    '  const normalized = clean === \'index\'',
    '    ? \'\'',
    '    : clean === \'concepts/index\'',
    '      ? \'concepts\'',
    '      : clean;',
    '  return `${loc}:${normalized}`;',
    '}',
    '',
    'export function hasDocPage(locale, slug) {',
    '  return Object.prototype.hasOwnProperty.call(DOC_PAGE_LOADERS, resolveDocRouteKey(locale, slug));',
    '}',
    '',
    'export async function loadDocPage(locale, slug) {',
    '  const loader = DOC_PAGE_LOADERS[resolveDocRouteKey(locale, slug)];',
    '  if (!loader)',
    '    return null;',
    '  const mod = await loader();',
    '  return {',
    '    default: mod.default,',
    '    docMeta: mod.docMeta,',
    '  };',
    '}',
    '',
  ].join('\n')
}

function buildTuffexDocMeta(contentDocsDir: string, ctx: MdcMetaContext) {
  const rel = ctx.filePath ? relative(contentDocsDir, ctx.filePath) : ''
  const mapped = rel ? contentFileToAppRoute(rel) : null
  const locale: SupportedLocale = mapped?.locale ?? 'en'
  const slug = mapped?.slug ?? ''
  const routePath = mapped?.route ?? `/${locale}`

  const fm = ctx.frontmatter
  const title = firstString(fm.title) ?? fallbackTitleFromSlug(slug)
  const description = firstString(fm.description) ?? ''
  const category = firstString(fm.category)
  const status = firstString(fm.status)
  const syncStatus = firstString(fm.syncStatus)
  const sinceRaw = fm.since
  const since = sinceRaw !== undefined && sinceRaw !== null && String(sinceRaw).trim()
    ? String(sinceRaw).trim()
    : null
  const verified = fm.verified === true
  const hideHero = fm.hideHero === true
  const hero = fm.hero === false ? false : undefined

  return {
    path: routePath,
    slug,
    locale,
    title,
    description,
    category,
    status,
    ...(syncStatus ? { syncStatus } : {}),
    since,
    verified,
    ...(hideHero ? { hideHero: true } : {}),
    ...(hero === false ? { hero: false } : {}),
    toc: ctx.toc,
    rawMarkdownPath: buildRawMarkdownPath(slug, locale),
    demoNames: ctx.demoNames,
    hasMath: ctx.hasMath,
    hasMermaid: ctx.hasMermaid,
  }
}

function seedLocalComponents(appDir: string, registry: Map<string, MdcComponentImportResolution>) {
  const dirs = [
    join(appDir, 'components/content'),
    join(appDir, 'components/docs'),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir))
      continue
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (!statSync(full).isFile() || extname(entry) !== '.vue')
        continue
      const stem = basename(entry, '.vue').replace(/\.(client|server)$/i, '')
      if (!stem || !/^[A-Z]/.test(stem))
        continue
      if (!registry.has(stem))
        registry.set(stem, { path: toPosix(full) })
    }
  }
}

function normalizeVueInclude(existing: unknown): Array<string | RegExp> {
  const list = Array.isArray(existing)
    ? [...existing]
    : existing
      ? [existing]
      : [/\.vue$/]

  const hasMdc = list.some(item => (
    (item instanceof RegExp && item.test('example.mdc'))
    || (typeof item === 'string' && item.includes('.mdc'))
  ))
  if (!hasMdc)
    list.push(/\.mdc$/)
  return list as Array<string | RegExp>
}

function createDevSearchIndexPlugin(contentDocsDir: string): Plugin {
  return {
    name: 'tuffex-dev-search-index',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const match = url.match(/^(?:\/tuffex)?\/search-index\.(en|zh)\.json$/)
        if (!match) {
          next()
          return
        }
        const locale = match[1] as SupportedLocale
        const nav = buildTuffexNavigationFromDisk(contentDocsDir, locale)
        const items = nav.items.map(item => ({
          id: item.path,
          path: item.path,
          slug: item.slug,
          locale,
          title: item.title,
          description: item.description,
          suite: item.suite,
          category: item.category,
          tags: item.tags,
        }))
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ locale, items }))
      })
    },
  }
}

/**
 * Nuxt 4 module wiring our reusable VitePress-style `.mdc → Vue 3 SFC` compiler into
 * `apps/tuffex-docs` (ZERO `@nuxt/content` v3, ZERO SQLite, ZERO `_payload.json`!).
 */
export default defineNuxtModule({
  meta: { name: 'tuffex-mdc-sfc' },
  setup(_options, nuxt) {
    const rootDir = nuxt.options.rootDir
    const appDir = resolve(rootDir, 'app')
    const contentDocsDir = resolve(rootDir, 'content/docs')

    const componentRegistry = new Map<string, MdcComponentImportResolution>()
    let componentMapRevision = 0

    seedLocalComponents(appDir, componentRegistry)

    // Keep component import registry synced with Nuxt's resolved component map.
    nuxt.hook('components:extend', (components) => {
      componentRegistry.clear()
      seedLocalComponents(appDir, componentRegistry)
      for (const comp of components) {
        const name = comp.pascalName || (comp as { name?: string }).name
        if (!name || !comp.filePath)
          continue
        const entry: MdcComponentImportResolution = {
          path: toPosix(comp.filePath),
          ...(comp.export && comp.export !== 'default' ? { export: comp.export } : {}),
        }
        componentRegistry.set(name, entry)

        // Also index unprefixed basename for `app/components/content/**` & `app/components/docs/**`
        // (e.g. `DocsDocHero` -> `DocHero`, `ContentTuffDemoWrapper` -> `TuffDemoWrapper`).
        const base = basename(comp.filePath, extname(comp.filePath)).replace(/\.(client|server)$/i, '')
        if (base && /^[A-Z]/.test(base) && !componentRegistry.has(base))
          componentRegistry.set(base, entry)
      }
      componentMapRevision += 1
    })

    // Emit ambient TypeScript declaration for `virtual:tuffex-doc-pages`
    // (NO top-level `export` so TypeScript treats this `.d.ts` as ambient!).
    addTypeTemplate({
      filename: 'types/tuffex-doc-pages.d.ts',
      getContents: () => `
declare module '${VIRTUAL_DOC_PAGES_ID}' {
  import type { Component } from 'vue'

  export type TuffexDocLocale = 'en' | 'zh'

  export interface TuffexCompiledDocTocLink {
    id: string
    text: string
    depth: number
    children?: TuffexCompiledDocTocLink[]
  }

  export interface TuffexCompiledDocToc {
    title: string
    searchDepth: number
    depth: number
    links: TuffexCompiledDocTocLink[]
  }

  export interface TuffexCompiledDocMeta {
    path: string
    slug: string
    locale: TuffexDocLocale
    title: string
    description: string
    category: string | null
    status: string | null
    syncStatus?: string | null
    since: string | null
    verified: boolean
    hideHero?: boolean
    hero?: boolean
    toc: TuffexCompiledDocToc
    rawMarkdownPath: string
    demoNames: string[]
    hasMath: boolean
    hasMermaid: boolean
  }

  export interface TuffexCompiledDocModule {
    default: Component
    docMeta: TuffexCompiledDocMeta
  }

  export function resolveDocRouteKey(locale: TuffexDocLocale, slug?: string): string
  export function hasDocPage(locale: TuffexDocLocale, slug?: string): boolean
  export function loadDocPage(locale: TuffexDocLocale, slug?: string): Promise<TuffexCompiledDocModule | null>
}
`,
    })

    // Share one compiler plugin instance (and its compiled-SFC mtime cache!) across both
    // client and server Vite builds during `nuxt generate` so each `.mdc` compiles once.
    const mdcVuePlugin = createMdcVuePlugin({
      contentDir: contentDocsDir,
      virtualIndexId: VIRTUAL_DOC_PAGES_ID,
      discoverRoutes: discoverTuffexDocRoutes,
      generateVirtualIndexCode: generateTuffexVirtualIndexCode,
      getCacheKeySalt: () => String(componentMapRevision),
      getCompileOptions: () => ({
        baseURL: TUFFEX_BASE_URL,
        rootClass: 'tuffex-mdc-doc',
        remarkPlugins: TUFFEX_REMARK_PLUGINS,
        rehypePlugins: TUFFEX_REHYPE_PLUGINS,
        resolveComponentImport: pascalName => componentRegistry.get(pascalName) ?? null,
        buildMeta: ctx => buildTuffexDocMeta(contentDocsDir, ctx),
      }),
    })

    const devSearchIndexPlugin = createDevSearchIndexPlugin(contentDocsDir)

    nuxt.hook('vite:extendConfig', (config) => {
      const mutableConfig = config as {
        vue?: { include?: unknown } & Record<string, unknown>
        plugins?: unknown[]
      }
      mutableConfig.vue = {
        ...(mutableConfig.vue ?? {}),
        include: normalizeVueInclude(mutableConfig.vue?.include as never),
      }
      mutableConfig.plugins = mutableConfig.plugins ?? []
      mutableConfig.plugins.unshift(mdcVuePlugin)
      if (nuxt.options.dev)
        mutableConfig.plugins.push(devSearchIndexPlugin)
    })
  },
})
