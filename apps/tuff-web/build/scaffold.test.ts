import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { compileMdcToSfc } from '../modules/mdc-sfc-compiler'
import { rehypeShikiJs } from '../modules/rehype-shiki-js'
import { remarkCloseComponentTags } from '../modules/remark-close-component-tags'
import { remarkMath } from '../modules/remark-math'
import { remarkMermaid } from '../modules/remark-mermaid'
import { remarkShikiCodeProps } from '../modules/remark-shiki-code-props'
import { highlightCodeToHtml } from '../modules/shiki-js-highlighter'
import { rewriteCompiledDocHref } from '../modules/tuff-web-mdc-sfc'
import {
  buildRedirectsFile,
  LEGACY_REDIRECTS,
  stageCfAssets,
} from '../scripts/stage-cf-assets.mjs'
import { createTuffWebCodeSplittingConfig, resolveTuffWebManualChunk } from './tuff-web-manual-chunks'
import { buildTuffWebNavigationFromDisk } from './tuff-web-nav-builder'
import {
  createPublicPrerenderRoutes,
  createTuffWebDocPrerenderRoutes,
  createTuffWebPrerenderRoutes,
  docContentFileToAppRoute,
  LEGACY_REDIRECT_RULES,
  NOT_FOUND_PRERENDER_ROUTE,
} from './tuff-web-prerender-routes'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_DOCS_DIR = join(APP_ROOT, 'content/docs')
const CONTENT_APP_DIR = join(APP_ROOT, 'content/app')

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      out.push(...walkFiles(full))
    else if (st.isFile())
      out.push(full)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

describe('tuff-web pure-SSG architecture & contracts', () => {
  it('enforces strict 3-module ceiling with zero Auth/Pinia/Nuxt-Content/Sentry/PWA runtime', () => {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    }

    for (const forbidden of [
      '@nuxt/content',
      '@nuxtjs/i18n',
      '@sidebase/nuxt-auth',
      'pinia',
      '@pinia/nuxt',
      '@sentry/nuxt',
      '@vite-pwa/nuxt',
      'better-sqlite3',
      'sql.js',
    ]) {
      expect(allDeps[forbidden], `Forbidden dependency ${forbidden} found in package.json`).toBeUndefined()
    }
    expect(allDeps['vue-i18n']).toBeTruthy()

    const nuxtConfig = readFileSync(join(APP_ROOT, 'nuxt.config.ts'), 'utf8')
    expect(nuxtConfig).toContain("buildAssetsDir: '/_tuff-web/'")
    expect(nuxtConfig).toContain('payloadExtraction: false')
    expect(nuxtConfig).toContain("preset: 'static'")
    expect(nuxtConfig).not.toMatch(/['"]@nuxt\/content['"]/)
    expect(nuxtConfig).not.toMatch(/['"]@nuxtjs\/i18n['"]/)
    expect(nuxtConfig).not.toMatch(/['"]@sidebase\/nuxt-auth['"]/)
    expect(nuxtConfig).not.toMatch(/['"]@pinia\/nuxt['"]/)
    expect(nuxtConfig).not.toMatch(/['"]@sentry\/nuxt['"]/)
  })

  it('imports TuffHome directly on homepage routes without defineAsyncComponent wrapper', () => {
    for (const rel of ['app/pages/index.vue', 'app/pages/[locale]/index.vue']) {
      const source = readFileSync(join(APP_ROOT, rel), 'utf8')
      expect(source).toContain("import TuffHome from '~/components/tuff/TuffHome.vue'")
      expect(source).not.toContain('defineAsyncComponent')
    }
  })

  it('inlines bilingual EN + ZH locales synchronously via pure vue-i18n plugin with zero /_i18n/ fetches', () => {
    const configSource = readFileSync(join(APP_ROOT, 'i18n/i18n.config.ts'), 'utf8')
    expect(configSource).toContain("from './locales/en'")
    expect(configSource).toContain("from './locales/zh'")
    expect(configSource).toContain('messages: {')

    const pluginSource = readFileSync(join(APP_ROOT, 'app/plugins/i18n.ts'), 'utf8')
    expect(pluginSource).toContain("from 'vue-i18n'")
    expect(pluginSource).toContain('createI18n')
    expect(pluginSource).toContain('resolveLocaleFromPath')

    const enLocaleSource = readFileSync(join(APP_ROOT, 'i18n/locales/en.ts'), 'utf8')
    const zhLocaleSource = readFileSync(join(APP_ROOT, 'i18n/locales/zh.ts'), 'utf8')
    expect(enLocaleSource).toContain('auth: _auth')
    expect(zhLocaleSource).toContain('auth: _auth')
  })

  it('configures wrangler.jsonc for Cloudflare Workers Static Assets', () => {
    const raw = readFileSync(join(APP_ROOT, 'wrangler.jsonc'), 'utf8')
    const jsonText = raw
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const cfg = JSON.parse(jsonText) as {
      name: string
      assets: {
        directory: string
        html_handling: string
        not_found_handling: string
      }
    }

    expect(cfg.name).toBe('tuff-web')
    expect(cfg.assets.directory).toBe('.dist-cf')
    expect(cfg.assets.html_handling).toBe('drop-trailing-slash')
    expect(cfg.assets.not_found_handling).toBe('404-page')
  })

  it('uses non-recursive Rolldown codeSplitting without forbidden catch-all groups', () => {
    const config = createTuffWebCodeSplittingConfig()
    expect(config.includeDependenciesRecursively).toBe(false)
    for (const group of config.groups) {
      expect(group.includeDependenciesRecursively).toBe(false)
      expect(group.name).not.toMatch(/tuffex-vendor|tuffex-demos|nuxt-content/)
    }

    expect(resolveTuffWebManualChunk('/app/.nuxt/tuff-web-docs-nav-en.mjs')).toBe('tuff-web-nav-en')
    expect(resolveTuffWebManualChunk('/app/.nuxt/tuff-web-docs-nav-zh.mjs')).toBe('tuff-web-nav-zh')
    expect(resolveTuffWebManualChunk('/app/foo.css')).toBeUndefined()
  })
})

describe('prerender routes, navigation & link rewriting', () => {
  it('enumerates all public routes, 214 product/SDK docs, and excludes all deleted legacy routes', () => {
    const publicRoutes = createPublicPrerenderRoutes()
    for (const required of [
      '/',
      '/en',
      '/zh',
      '/pricing',
      '/en/pricing',
      '/zh/pricing',
      '/updates',
      '/en/updates',
      '/zh/updates',
      '/updates/all',
      '/en/updates/all',
      '/zh/updates/all',
      '/store',
      '/en/store',
      '/zh/store',
      '/license',
      '/en/license',
      '/zh/license',
      '/privacy',
      '/en/privacy',
      '/zh/privacy',
      '/protocol',
      '/en/protocol',
      '/zh/protocol',
    ]) {
      expect(publicRoutes).toContain(required)
    }

    const docRoutes = createTuffWebDocPrerenderRoutes(APP_ROOT)
    expect(docRoutes.length).toBe(214)
    expect(docRoutes.filter(r => r.startsWith('/en/docs')).length).toBe(107)
    expect(docRoutes.filter(r => r.startsWith('/zh/docs')).length).toBe(107)
    expect(docRoutes).toContain('/en/docs')
    expect(docRoutes).toContain('/zh/docs')
    expect(docRoutes).toContain('/en/docs/guide/start')
    expect(docRoutes).toContain('/zh/docs/guide/start')
    expect(docRoutes).toContain('/en/docs/dev/release')
    expect(docRoutes).toContain('/zh/docs/dev/release')
    expect(docRoutes).toContain('/en/docs/dev/release/performance-persistence')
    expect(docRoutes).toContain('/zh/docs/dev/release/performance-persistence')

    const allRoutes = createTuffWebPrerenderRoutes(APP_ROOT)
    expect(allRoutes).toContain(NOT_FOUND_PRERENDER_ROUTE)
    for (const forbiddenPattern of [
      /^\/(?:en|zh)?\/?(?:new|next)(?:\/|$)/,
      /^\/(?:en|zh)?\/?test\//,
      /^\/(?:en|zh)?\/?notes\//,
      /^\/(?:en|zh)?\/?(?:dashboard|admin|sign-in)(?:\/|$)/,
    ]) {
      expect(allRoutes.filter(r => forbiddenPattern.test(r))).toEqual([])
    }
  })

  it('builds complete bilingual navigation trees including frontmatter-less release markdown docs', () => {
    const enNav = buildTuffWebNavigationFromDisk(CONTENT_DOCS_DIR, 'en')
    const zhNav = buildTuffWebNavigationFromDisk(CONTENT_DOCS_DIR, 'zh')

    expect(enNav.items.length).toBe(107)
    expect(zhNav.items.length).toBe(107)
    expect(enNav.sections.map(s => s.key)).toEqual(['guide', 'dev'])
    expect(zhNav.sections.map(s => s.key)).toEqual(['guide', 'dev'])

    for (const item of [...enNav.items, ...zhNav.items]) {
      expect(item.title.trim().length, `Missing title for ${item.path}`).toBeGreaterThan(0)
      expect(item.path).toMatch(/^\/(?:en|zh)\/docs(?:\/|$)/)
    }

    const enRelease = enNav.items.find(i => i.slug === 'dev/release/performance-persistence')
    const zhRelease = zhNav.items.find(i => i.slug === 'dev/release/performance-persistence')
    expect(enRelease?.title).toBeTruthy()
    expect(zhRelease?.title).toBeTruthy()
  })

  it('rewrites relative doc links, unprefixed /docs links, and legacy TuffEx links accurately', () => {
    const enDoc = join(CONTENT_DOCS_DIR, 'dev/api/search.en.mdc')
    const zhDoc = join(CONTENT_DOCS_DIR, 'dev/api/search.zh.mdc')

    expect(rewriteCompiledDocHref('./box.en.mdc#api', enDoc, CONTENT_DOCS_DIR)).toBe('/en/docs/dev/api/box#api')
    expect(rewriteCompiledDocHref('../release/publish.zh.md', zhDoc, CONTENT_DOCS_DIR)).toBe('/zh/docs/dev/release/publish')
    expect(rewriteCompiledDocHref('/docs/guide/start', zhDoc, CONTENT_DOCS_DIR)).toBe('/zh/docs/guide/start')
    expect(rewriteCompiledDocHref('/docs/dev/components/button', enDoc, CONTENT_DOCS_DIR)).toBe('/tuffex/en/button')
    expect(rewriteCompiledDocHref('/docs/dev/components/button', zhDoc, CONTENT_DOCS_DIR)).toBe('/tuffex/zh/button')
    expect(rewriteCompiledDocHref('/docs/dev/concepts/glass', zhDoc, CONTENT_DOCS_DIR)).toBe('/tuffex/zh/concepts/glass')
    expect(rewriteCompiledDocHref('/docs/dev/getting-started/tuffex-composition', enDoc, CONTENT_DOCS_DIR)).toBe('/tuffex/en/composition')
    expect(rewriteCompiledDocHref('https://github.com/talex-touch/tuff', enDoc, CONTENT_DOCS_DIR)).toBe('https://github.com/talex-touch/tuff')
  })

  it('maps doc file paths cleanly for root, folder index, and leaf .mdc/.md files', () => {
    expect(docContentFileToAppRoute('index.en.mdc')?.route).toBe('/en/docs')
    expect(docContentFileToAppRoute('guide/index.zh.mdc')?.route).toBe('/zh/docs/guide')
    expect(docContentFileToAppRoute('dev/release/publish.en.md')?.route).toBe('/en/docs/dev/release/publish')
    expect(docContentFileToAppRoute('notes.txt')).toBeNull()
  })
})

describe('build-time pure-JS Shiki & MDC -> Vue 3 SFC compilation', () => {
  it('highlights code via pure-JS Shiki with dual-theme CSS variables', async () => {
    const html = await highlightCodeToHtml('const x: number = 42', 'ts')
    expect(html).toContain('class="shiki')
    expect(html).toContain('--shiki-light:')
    expect(html).toContain('--shiki-dark:')
  })

  it('compiles all 214 product/SDK docs and all 5 legal markdown files into valid Vue 3 SFCs', async () => {
    const docFiles = walkFiles(CONTENT_DOCS_DIR).filter(f => /\.(?:mdc|md)$/i.test(f))
    const legalFiles = walkFiles(CONTENT_APP_DIR).filter(f => /\.(?:mdc|md)$/i.test(f))
    expect(docFiles.length).toBe(214)
    expect(legalFiles.length).toBe(5)

    const remarkPlugins = {
      'remark-mermaid': { instance: remarkMermaid },
      'remark-close-component-tags': { instance: remarkCloseComponentTags },
      'remark-math': { instance: remarkMath },
      'remark-shiki-code-props': { instance: remarkShikiCodeProps },
    }
    const rehypePlugins = {
      'rehype-shiki-js': { instance: rehypeShikiJs },
    }

    const resolveComponentImport = (pascalName: string) => {
      if (pascalName === 'TuffCodeBlock')
        return { path: '/app/components/content/TuffCodeBlock.vue' }
      if (pascalName === 'Alert')
        return { path: '/app/components/content/Alert.vue' }
      return null
    }

    for (const filePath of [...docFiles, ...legalFiles]) {
      const source = readFileSync(filePath, 'utf8')
      const result = await compileMdcToSfc(source, {
        filePath,
        rootClass: 'tuff-web-mdc-doc',
        remarkPlugins,
        rehypePlugins,
        rewriteHref: href => rewriteCompiledDocHref(href, filePath, CONTENT_DOCS_DIR),
        resolveComponentImport,
        buildMeta: ctx => ({
          path: relative(APP_ROOT, filePath),
          toc: ctx.toc,
          hasMath: ctx.hasMath,
          hasMermaid: ctx.hasMermaid,
        }),
      })

      expect(result.sfc).toContain('export const docMeta = ')
      const parsed = parseSfc(result.sfc, { filename: filePath })
      expect(parsed.errors, `Vue SFC parse errors in ${relative(APP_ROOT, filePath)}`).toEqual([])
      expect(parsed.descriptor.template?.content.length ?? 0).toBeGreaterThan(0)
    }
  }, 60_000)
})

describe('Cloudflare Workers Static Assets staging pipeline', () => {
  it('keeps _redirects parity between build module and staging script with TuffEx before /docs/*', () => {
    expect(LEGACY_REDIRECTS.length).toBe(LEGACY_REDIRECT_RULES.length)
    expect(LEGACY_REDIRECTS).toEqual(LEGACY_REDIRECT_RULES)

    const redirects = buildRedirectsFile()
    const rules = redirects
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    const tuffexCompIdx = rules.findIndex(line => line.startsWith('/docs/dev/components/* '))
    const tuffexConceptIdx = rules.findIndex(line => line.startsWith('/docs/dev/concepts/* '))
    const docsWildcardIdx = rules.findIndex(line => line.startsWith('/docs/* '))
    expect(tuffexCompIdx).toBeGreaterThanOrEqual(0)
    expect(tuffexConceptIdx).toBeGreaterThanOrEqual(0)
    expect(docsWildcardIdx).toBeGreaterThan(tuffexCompIdx)
    expect(docsWildcardIdx).toBeGreaterThan(tuffexConceptIdx)
    expect(rules).toContain('/llms.txt /tuffex/llms.txt 308')
    expect(rules).toContain('/docs /en/docs 308')
    expect(rules).toContain('/terms /license 308')
  })

  it('stages .dist-cf/, strips forbidden artifacts, materializes SSR 404, and emits atomic _headers & search indexes', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'tuff-web-stage-test-'))
    try {
      const outputPublic = join(tmpRoot, '.output/public')
      mkdirSync(join(outputPublic, '_tuff-web'), { recursive: true })
      mkdirSync(join(outputPublic, '__nuxt_content'), { recursive: true })
      mkdirSync(join(outputPublic, '_i18n/abc123'), { recursive: true })
      mkdirSync(join(outputPublic, 'en/docs/guide'), { recursive: true })
      mkdirSync(join(outputPublic, 'zh/docs/guide'), { recursive: true })
      mkdirSync(join(outputPublic, 'en/updates'), { recursive: true })
      mkdirSync(join(outputPublic, 'zh/updates'), { recursive: true })
      mkdirSync(join(outputPublic, 'updates'), { recursive: true })

      symlinkSync(join(APP_ROOT, 'content'), join(tmpRoot, 'content'))

      writeFileSync(join(outputPublic, '_tuff-web/entry.abc123.js'), 'export const ok = true;\n')
      writeFileSync(join(outputPublic, '_tuff-web/entry.abc123.css'), 'body{margin:0}\n')

      // Plant forbidden artifacts to verify they are stripped cleanly
      writeFileSync(join(outputPublic, '_payload.json'), '{}')
      writeFileSync(join(outputPublic, 'en/_payload.json'), '{}')
      writeFileSync(join(outputPublic, '_tuff-web/fake.wasm'), 'wasm')
      writeFileSync(join(outputPublic, 'dump.docs.sql'), 'CREATE TABLE x;')
      writeFileSync(join(outputPublic, '__nuxt_content/cache.json'), '{}')
      writeFileSync(join(outputPublic, '_i18n/abc123/messages.json'), '{}')

      const sampleHtml = [
        '<!doctype html><html><head>',
        '<link rel="stylesheet" href="/_tuff-web/entry.abc123.css" crossorigin>',
        '<script type="module" src="/_tuff-web/entry.abc123.js" crossorigin></script>',
        '</head><body><div id="__nuxt"><h1>Tuff</h1></div></body></html>',
      ].join('')

      const requiredHtmlFiles = [
        'index.html',
        'en.html',
        'zh.html',
        'pricing.html',
        'en/pricing.html',
        'zh/pricing.html',
        'updates.html',
        'en/updates.html',
        'zh/updates.html',
        'updates/all.html',
        'en/updates/all.html',
        'zh/updates/all.html',
        'store.html',
        'en/store.html',
        'zh/store.html',
        'license.html',
        'en/license.html',
        'zh/license.html',
        'privacy.html',
        'en/privacy.html',
        'zh/privacy.html',
        'protocol.html',
        'en/protocol.html',
        'zh/protocol.html',
        'en/docs.html',
        'zh/docs.html',
        'en/docs/guide/start.html',
        'zh/docs/guide/start.html',
      ]
      for (const rel of requiredHtmlFiles) {
        const dest = join(outputPublic, rel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, sampleHtml)
      }

      writeFileSync(
        join(outputPublic, '__not-found.html'),
        '<!doctype html><html><body><div id="__nuxt"><main aria-label="404">Not Found</main></div></body></html>',
      )

      stageCfAssets(tmpRoot)

      const stageRoot = join(tmpRoot, '.dist-cf')
      expect(existsSync(join(stageRoot, '404.html'))).toBe(true)
      expect(existsSync(join(stageRoot, '__not-found.html'))).toBe(false)
      expect(existsSync(join(stageRoot, '_payload.json'))).toBe(false)
      expect(existsSync(join(stageRoot, 'en/_payload.json'))).toBe(false)
      expect(existsSync(join(stageRoot, '_tuff-web/fake.wasm'))).toBe(false)
      expect(existsSync(join(stageRoot, 'dump.docs.sql'))).toBe(false)
      expect(existsSync(join(stageRoot, '__nuxt_content'))).toBe(false)
      expect(existsSync(join(stageRoot, '_i18n'))).toBe(false)

      const headers = readFileSync(join(stageRoot, '_headers'), 'utf8')
      expect(headers).toContain('Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400')
      expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable')
      expect(headers).toContain('</_tuff-web/entry.abc123.js>; rel=modulepreload; crossorigin')
      expect(headers).toContain('</_tuff-web/entry.abc123.css>; rel=preload; as=style; crossorigin')

      const enIndex = JSON.parse(readFileSync(join(stageRoot, 'docs/search-index.en.json'), 'utf8')) as {
        locale: string
        items: Array<{ path: string, title: string }>
      }
      const zhIndex = JSON.parse(readFileSync(join(stageRoot, 'docs/search-index.zh.json'), 'utf8')) as {
        locale: string
        items: Array<{ path: string, title: string }>
      }
      expect(enIndex.locale).toBe('en')
      expect(zhIndex.locale).toBe('zh')
      expect(enIndex.items.length).toBe(107)
      expect(zhIndex.items.length).toBe(107)

      const llms = readFileSync(join(stageRoot, 'docs/llms.txt'), 'utf8')
      expect(llms).toContain('https://tuff.tagzxia.com/en/docs/')
      expect(llms).not.toMatch(/localhost/i)

      const sitemap = readFileSync(join(stageRoot, 'sitemap.xml'), 'utf8')
      expect(sitemap).toContain('https://tuff.tagzxia.com/en/docs/guide/start')
      expect(sitemap).toContain('https://tuff.tagzxia.com/zh/docs/guide/start')
      expect(sitemap).toContain('hreflang="zh"')

      expect(existsSync(join(stageRoot, 'en/docs/guide/start.md'))).toBe(true)
      expect(existsSync(join(stageRoot, 'zh/docs/guide/start.md'))).toBe(true)
      expect(existsSync(join(stageRoot, 'en/docs/index.md'))).toBe(true)
      expect(existsSync(join(stageRoot, 'zh/docs/index.md'))).toBe(true)
    }
    finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
