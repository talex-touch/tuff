import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { addTypeTemplate, defineNuxtModule } from 'nuxt/kit'
import type { Plugin, ViteDevServer } from 'vite'
import { buildTuffWebNavigationFromDisk, extractFrontmatterAndHeading } from '../build/tuff-web-nav-builder'
import {
  docContentFileToAppRoute,
  POLICY_DOC_NAMES,
  type PolicyDocName,
  type SupportedLocale,
} from '../build/tuff-web-prerender-routes'
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

const VIRTUAL_DOC_PAGES_ID = 'virtual:tuff-web-doc-pages'

const TUFF_WEB_REMARK_PLUGINS: Record<string, MdcPluginEntry> = {
  'remark-mermaid': { instance: remarkMermaid },
  'remark-close-component-tags': { instance: remarkCloseComponentTags },
  'remark-math': { instance: remarkMath },
  'remark-shiki-code-props': { instance: remarkShikiCodeProps },
}

const TUFF_WEB_REHYPE_PLUGINS: Record<string, MdcPluginEntry> = {
  'rehype-shiki-js': { instance: rehypeShikiJs },
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

function walkDocFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      files.push(...walkDocFiles(full))
    else if (st.isFile() && /\.(?:mdc|md)$/i.test(entry))
      files.push(full)
  }
  return files.sort((a, b) => a.localeCompare(b))
}

function firstString(...values: unknown[]): string | null {
  for (const val of values) {
    if (typeof val === 'string' && val.trim())
      return val.trim()
  }
  return null
}

function fallbackTitleFromSlug(slug: string, locale: SupportedLocale): string {
  if (!slug)
    return locale === 'zh' ? 'Tuff 文档' : 'Tuff Documentation'
  const leaf = slug.split('/').filter(Boolean).pop() ?? slug
  return leaf
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

function resolvePolicyFile(contentAppDir: string, name: PolicyDocName, locale: SupportedLocale): string | null {
  const candidates = locale === 'zh'
    ? [
        join(contentAppDir, `${name}.zh.md`),
        join(contentAppDir, `${name}.zh.mdc`),
        join(contentAppDir, `${name}.md`),
        join(contentAppDir, `${name}.en.md`),
      ]
    : [
        join(contentAppDir, `${name}.en.md`),
        join(contentAppDir, `${name}.md`),
        join(contentAppDir, `${name}.zh.md`),
      ]
  for (const cand of candidates) {
    if (existsSync(cand))
      return toPosix(cand)
  }
  return null
}

function discoverTuffWebContentRoutes(contentRootDir: string): MdcDocRouteEntry[] {
  const entries: MdcDocRouteEntry[] = []
  const contentDocsDir = join(contentRootDir, 'docs')
  const contentAppDir = join(contentRootDir, 'app')

  for (const filePath of walkDocFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, filePath)
    const mapped = docContentFileToAppRoute(rel)
    if (!mapped)
      continue
    entries.push({
      key: `doc:${mapped.locale}:${mapped.slug}`,
      filePath: toPosix(filePath),
    })
  }

  for (const name of POLICY_DOC_NAMES) {
    for (const locale of ['en', 'zh'] as const) {
      const filePath = resolvePolicyFile(contentAppDir, name, locale)
      if (filePath) {
        entries.push({
          key: `policy:${locale}:${name}`,
          filePath,
        })
      }
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

function generateTuffWebVirtualIndexCode(entries: MdcDocRouteEntry[]): string {
  const docLoaders: string[] = []
  const policyLoaders: string[] = []

  for (const entry of entries) {
    if (entry.key.startsWith('policy:')) {
      const policyKey = entry.key.slice('policy:'.length)
      policyLoaders.push(`  ${JSON.stringify(policyKey)}: () => import(${JSON.stringify(entry.filePath)}),`)
    }
    else if (entry.key.startsWith('doc:')) {
      const docKey = entry.key.slice('doc:'.length)
      docLoaders.push(`  ${JSON.stringify(docKey)}: () => import(${JSON.stringify(entry.filePath)}),`)
    }
  }

  return [
    'const DOC_PAGE_LOADERS = {',
    ...docLoaders,
    '};',
    '',
    'const POLICY_PAGE_LOADERS = {',
    ...policyLoaders,
    '};',
    '',
    'export function resolveDocRouteKey(locale, slug) {',
    '  const loc = locale === \'zh\' ? \'zh\' : \'en\';',
    '  const clean = typeof slug === \'string\'',
    '    ? slug.replace(/\\\\/g, \'/\').replace(/^\\/+|\\/+$/g, \'\').replace(/\\/index$/i, \'\')',
    '    : \'\';',
    '  const normalized = clean === \'index\' ? \'\' : clean;',
    '  return loc + \':\' + normalized;',
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
    'export async function loadPolicyPage(locale, name) {',
    '  const loc = locale === \'zh\' ? \'zh\' : \'en\';',
    '  const key = loc + \':\' + String(name || \'\').toLowerCase();',
    '  const loader = POLICY_PAGE_LOADERS[key] || POLICY_PAGE_LOADERS[\'en:\' + String(name || \'\').toLowerCase()];',
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

function buildTuffWebDocMeta(contentRootDir: string, ctx: MdcMetaContext) {
  const contentDocsDir = join(contentRootDir, 'docs')
  const filePath = ctx.filePath ?? ''
  const raw = filePath && existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const extracted = raw ? extractFrontmatterAndHeading(raw) : { headingTitle: null, firstParagraph: '' }

  const posixFile = toPosix(filePath)
  const posixDocsDir = `${toPosix(contentDocsDir)}/`
  const isDocFile = posixFile.startsWith(posixDocsDir)

  if (isDocFile) {
    const rel = relative(contentDocsDir, filePath)
    const mapped = docContentFileToAppRoute(rel)
    const locale: SupportedLocale = mapped?.locale ?? 'en'
    const slug = mapped?.slug ?? ''
    const routePath = mapped?.route ?? `/${locale}/docs`

    const fm = ctx.frontmatter
    const title = firstString(fm.title, extracted.headingTitle) ?? fallbackTitleFromSlug(slug, locale)
    const description = firstString(fm.description, extracted.firstParagraph) ?? ''
    const category = firstString(fm.category)
    const hideHero = fm.hideHero === true
    const hero = fm.hero === false ? false : undefined

    return {
      kind: 'doc' as const,
      path: routePath,
      slug,
      locale,
      title,
      description,
      category,
      ...(hideHero ? { hideHero: true } : {}),
      ...(hero === false ? { hero: false } : {}),
      toc: ctx.toc,
      rawMarkdownPath: mapped?.canonicalRawPath ?? `/${locale}/docs/index.md`,
      sourceRelativePath: toPosix(rel),
      hasMath: ctx.hasMath,
      hasMermaid: ctx.hasMermaid,
    }
  }

  // Legal / policy markdown under `content/app/`
  const baseName = basename(filePath).replace(/\.(?:zh|en)?\.(?:mdc|md)$/i, '')
  const locale: SupportedLocale = /\.zh\.(?:mdc|md)$/i.test(filePath) ? 'zh' : 'en'
  const fm = ctx.frontmatter
  const title = firstString(fm.title, extracted.headingTitle) ?? fallbackTitleFromSlug(baseName, locale)
  const description = firstString(fm.description, extracted.firstParagraph) ?? ''

  return {
    kind: 'policy' as const,
    path: `/${locale}/${baseName}`,
    slug: baseName,
    locale,
    title,
    description,
    category: 'Legal',
    toc: ctx.toc,
    rawMarkdownPath: '',
    sourceRelativePath: toPosix(relative(contentRootDir, filePath)),
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

  const hasMd = list.some(item => (
    (item instanceof RegExp && item.test('example.md'))
    || (typeof item === 'string' && item.includes('.md'))
  ))
  if (!hasMd)
    list.push(/\.md$/)

  return list as Array<string | RegExp>
}

function createDevSearchIndexPlugin(contentDocsDir: string): Plugin {
  return {
    name: 'tuff-web-dev-search-index',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const match = url.match(/^\/docs\/search-index\.(en|zh)\.json$/)
        if (!match) {
          next()
          return
        }
        const locale = match[1] as SupportedLocale
        const nav = buildTuffWebNavigationFromDisk(contentDocsDir, locale)
        const items = nav.items.map(item => ({
          id: item.path,
          path: item.path,
          slug: item.slug,
          locale,
          section: item.section,
          group: item.group,
          title: item.title,
          description: item.description,
          tags: item.tags,
        }))
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ locale, items }))
      })
    },
  }
}

export function rewriteCompiledDocHref(href: string, sourceFilePath: string, contentDocsDir: string): string {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:)/i.test(trimmed))
    return trimmed

  const posixFile = toPosix(sourceFilePath)
  const posixDocsDir = `${toPosix(contentDocsDir)}/`
  const isDocFile = posixFile.startsWith(posixDocsDir)
  const rel = isDocFile ? relative(contentDocsDir, sourceFilePath) : ''
  const mapped = rel ? docContentFileToAppRoute(rel) : null
  const locale: SupportedLocale = mapped?.locale ?? (/\.zh\.(?:mdc|md)$/i.test(sourceFilePath) ? 'zh' : 'en')

  const match = trimmed.match(/^([^?#]*)([?#].*)?$/)
  let pathPart = match?.[1] ?? trimmed
  const suffix = match?.[2] ?? ''

  // Resolve relative markdown links (`./foo.zh.mdc`, `../bar.en.md`) against the doc's source path.
  if (isDocFile && /^\.{1,2}\//.test(pathPart)) {
    const sourceDir = `/docs/${toPosix(rel).replace(/[^/]+$/, '')}`
    try {
      pathPart = decodeURI(new URL(pathPart, `https://docs.invalid${sourceDir}`).pathname)
    }
    catch {
      return trimmed
    }
  }

  // Strip `.en.mdc` / `.zh.mdc` / `.md` suffixes on internal doc paths (keep raw `.md` only if no locale suffix)
  if (/^\/(?:(?:en|zh)\/)?docs(?:\/|$)/i.test(pathPart)) {
    pathPart = pathPart
      .replace(/\.(en|zh)\.(?:mdc|md)$/i, '')
      .replace(/\.mdc$/i, '')
      .replace(/\/index$/i, '')
  }

  // Rewrite legacy TuffEx component/concept links directly to `/tuffex/{locale}/...`
  const withoutLocale = pathPart.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'
  if (withoutLocale === '/docs/dev/components')
    return `/tuffex/${locale}${suffix}`
  if (withoutLocale.startsWith('/docs/dev/components/'))
    return `/tuffex/${locale}/${withoutLocale.slice('/docs/dev/components/'.length)}${suffix}`
  if (withoutLocale === '/docs/dev/concepts')
    return `/tuffex/${locale}/concepts${suffix}`
  if (withoutLocale.startsWith('/docs/dev/concepts/'))
    return `/tuffex/${locale}/concepts/${withoutLocale.slice('/docs/dev/concepts/'.length)}${suffix}`
  if (withoutLocale === '/docs/dev/getting-started/tuffex-composition')
    return `/tuffex/${locale}/composition${suffix}`

  // Localize unprefixed `/docs` links
  if (pathPart === '/docs' || pathPart.startsWith('/docs/'))
    return `/${locale}${pathPart}${suffix}`

  return `${pathPart}${suffix}`
}

/**
 * Nuxt 4 module wiring VitePress-style `.mdc/.md -> Vue 3 SFC` compilation into
 * `apps/tuff-web` for ALL 214 product & SDK docs AND all legal markdown pages
 * (ZERO `@nuxt/content`, ZERO SQLite/WASM, ZERO `_payload.json`, ZERO `/api/docs/*`!).
 */
export default defineNuxtModule({
  meta: { name: 'tuff-web-mdc-sfc' },
  setup(_options, nuxt) {
    const rootDir = nuxt.options.rootDir
    const appDir = resolve(rootDir, 'app')
    const contentRootDir = resolve(rootDir, 'content')
    const contentDocsDir = resolve(contentRootDir, 'docs')

    const componentRegistry = new Map<string, MdcComponentImportResolution>()
    let componentMapRevision = 0

    seedLocalComponents(appDir, componentRegistry)

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

        const base = basename(comp.filePath, extname(comp.filePath)).replace(/\.(client|server)$/i, '')
        if (base && /^[A-Z]/.test(base) && !componentRegistry.has(base))
          componentRegistry.set(base, entry)
      }
      componentMapRevision += 1
    })

    addTypeTemplate({
      filename: 'types/tuff-web-doc-pages.d.ts',
      getContents: () => `
declare module '${VIRTUAL_DOC_PAGES_ID}' {
  import type { Component } from 'vue'

  export type TuffWebDocLocale = 'en' | 'zh'
  export type TuffWebPolicyName = 'license' | 'privacy' | 'protocol'

  export interface TuffWebCompiledDocTocLink {
    id: string
    text: string
    depth: number
    children?: TuffWebCompiledDocTocLink[]
  }

  export interface TuffWebCompiledDocToc {
    title: string
    searchDepth: number
    depth: number
    links: TuffWebCompiledDocTocLink[]
  }

  export interface TuffWebCompiledDocMeta {
    kind: 'doc' | 'policy'
    path: string
    slug: string
    locale: TuffWebDocLocale
    title: string
    description: string
    category: string | null
    hideHero?: boolean
    hero?: boolean
    toc: TuffWebCompiledDocToc
    rawMarkdownPath: string
    sourceRelativePath: string
    hasMath: boolean
    hasMermaid: boolean
  }

  export interface TuffWebCompiledDocModule {
    default: Component
    docMeta: TuffWebCompiledDocMeta
  }

  export function resolveDocRouteKey(locale: TuffWebDocLocale, slug?: string): string
  export function hasDocPage(locale: TuffWebDocLocale, slug?: string): boolean
  export function loadDocPage(locale: TuffWebDocLocale, slug?: string): Promise<TuffWebCompiledDocModule | null>
  export function loadPolicyPage(locale: TuffWebDocLocale, name: TuffWebPolicyName): Promise<TuffWebCompiledDocModule | null>
}
`,
    })

    const mdcVuePlugin = createMdcVuePlugin({
      contentDir: contentRootDir,
      virtualIndexId: VIRTUAL_DOC_PAGES_ID,
      discoverRoutes: discoverTuffWebContentRoutes,
      generateVirtualIndexCode: generateTuffWebVirtualIndexCode,
      getCacheKeySalt: () => String(componentMapRevision),
      getCompileOptions: filePath => ({
        baseURL: '',
        rootClass: 'tuff-web-mdc-doc',
        remarkPlugins: TUFF_WEB_REMARK_PLUGINS,
        rehypePlugins: TUFF_WEB_REHYPE_PLUGINS,
        rewriteHref: href => rewriteCompiledDocHref(href, filePath, contentDocsDir),
        resolveComponentImport: pascalName => componentRegistry.get(pascalName) ?? null,
        buildMeta: ctx => buildTuffWebDocMeta(contentRootDir, ctx),
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
