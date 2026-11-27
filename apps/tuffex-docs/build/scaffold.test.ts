import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { rehypeShikiJs } from '../modules/rehype-shiki-js'
import { remarkShikiCodeProps } from '../modules/remark-shiki-code-props'
import { highlightCodeToHtml } from '../modules/shiki-js-highlighter'
import { stageCfAssets } from '../scripts/stage-cf-assets.mjs'
import { trimServerI18nContext } from '../server/utils/i18nPreloadTrim'
import { createTuffexCodeSplittingConfig, resolveTuffexManualChunk } from './tuffex-manual-chunks'
import { buildTuffexNavigationFromDisk } from './tuffex-nav-builder'
import { createTuffexPrerenderRoutes } from './tuffex-prerender-routes'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(currentDir, '..')

describe('tuffex-docs phase 1 scaffold', () => {
  it('highlights Vue & Bash code with pure-JS Shiki dual themes (--shiki-light/--shiki-dark)', async () => {
    const vueHtml = await highlightCodeToHtml('<template><TxButton variant="primary">Hi</TxButton></template>', 'vue')
    expect(vueHtml).toContain('--shiki-light')
    expect(vueHtml).toContain('--shiki-dark')
    expect(vueHtml).toContain('github-light')
    expect(vueHtml).toContain('github-dark')

    const bashHtml = await highlightCodeToHtml('pnpm add @talex-touch/tuffex', 'sh')
    expect(bashHtml).toContain('--shiki-light')
    expect(bashHtml).toContain('--shiki-dark')
  })

  it('attaches pre-highlighted codeHtml to TuffDemoWrapper and TuffCodeBlock MDC nodes', async () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'containerComponent',
          name: 'TuffDemoWrapper',
          attributes: { demo: 'ButtonVariantsDemo', 'code-lang': 'vue' },
          fmAttributes: { code: '<template><TxButton>Go</TxButton></template>' },
          children: [],
        },
        {
          type: 'containerComponent',
          name: 'TuffCodeBlock',
          attributes: { lang: 'ts' },
          fmAttributes: { code: 'import { TxButton } from \'@talex-touch/tuffex/button\'' },
          children: [],
        },
      ],
    }

    await remarkShikiCodeProps()(tree)
    expect(typeof tree.children[0]!.attributes!.codeHtml).toBe('string')
    expect(tree.children[0]!.attributes!.codeHtml).toContain('--shiki-light')
    expect(tree.children[0]!.attributes!.codeHtml).toContain('--shiki-dark')
    expect(typeof tree.children[1]!.attributes!.codeHtml).toBe('string')
    expect(tree.children[1]!.attributes!.codeHtml).toContain('--shiki-light')
  })

  it('highlights fenced Markdown code blocks via rehype-shiki-js without Oniguruma WASM', async () => {
    const hast = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {
            language: 'typescript',
            code: 'const count: number = 42\n',
            className: ['language-typescript'],
          },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'const count: number = 42\n' }],
            },
          ],
        },
      ],
    }

    await rehypeShikiJs()(hast)
    const pre = hast.children[0]!
    expect(pre.properties.className).toContain('shiki')
    expect(pre.properties.className).toContain('github-dark')
    const serialized = JSON.stringify(pre)
    expect(serialized).toContain('--shiki-light')
    expect(serialized).toContain('--shiki-dark')
  })

  it('discovers all prerender routes and builds complete EN/ZH navigation trees', () => {
    const routes = createTuffexPrerenderRoutes(appRoot)
    expect(routes).toContain('/')
    expect(routes).toContain('/__not-found')
    expect(routes).toContain('/en')
    expect(routes).toContain('/zh')
    expect(routes).toContain('/en/button')
    expect(routes).toContain('/zh/button')
    expect(routes).toContain('/en/concepts')
    expect(routes).toContain('/en/concepts/curvature')
    expect(routes).toContain('/en/composition')
    expect(routes.length).toBeGreaterThanOrEqual(534)

    const enNav = buildTuffexNavigationFromDisk(join(appRoot, 'content/docs'), 'en')
    const zhNav = buildTuffexNavigationFromDisk(join(appRoot, 'content/docs'), 'zh')
    expect(enNav.items.length).toBe(266)
    expect(zhNav.items.length).toBe(266)
    expect(enNav.suites.map(s => s.key)).toEqual([
      'concepts',
      'templates',
      'base',
      'pro',
      'ai',
      'data',
      'flow',
      'motion',
    ])
  })

  it('stages .output/public to .dist-cf/tuffex with _headers, 404.html, llms.txt, search-index, sitemap, and strips build-only files', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'tuffex-stage-cf-'))
    try {
      mkdirSync(join(fixtureRoot, '.output/public/en'), { recursive: true })
      mkdirSync(join(fixtureRoot, '.output/public/zh'), { recursive: true })
      mkdirSync(join(fixtureRoot, '.output/public/_tuffex'), { recursive: true })
      mkdirSync(join(fixtureRoot, '.output/public/__nuxt_content/docs'), { recursive: true })
      mkdirSync(join(fixtureRoot, '.output/public/api/_build/page/en'), { recursive: true })
      mkdirSync(join(fixtureRoot, 'content/docs/components'), { recursive: true })

      const sampleHtml = '<!doctype html><html><head><link rel="stylesheet" href="/tuffex/_tuffex/entry.abc.css" crossorigin><script type="module" src="/tuffex/_tuffex/entry.abc.js" crossorigin></script></head><body><div id="__nuxt"><h1>Button</h1></div></body></html>'
      writeFileSync(join(fixtureRoot, '.output/public/en.html'), sampleHtml)
      writeFileSync(join(fixtureRoot, '.output/public/zh.html'), sampleHtml)
      writeFileSync(join(fixtureRoot, '.output/public/en/button.html'), sampleHtml)
      writeFileSync(join(fixtureRoot, '.output/public/zh/button.html'), sampleHtml)
      writeFileSync(join(fixtureRoot, '.output/public/__not-found.html'), '<!doctype html><html><body><div id="__nuxt"><main aria-label="404">404</main></div></body></html>')
      writeFileSync(join(fixtureRoot, '.output/public/dump.docs.sql'), 'CREATE TABLE docs;')
      writeFileSync(join(fixtureRoot, '.output/public/__nuxt_content/docs/sql_dump.txt'), 'dump')
      writeFileSync(join(fixtureRoot, '.output/public/api/_build/page/en/button.json'), '{}')

      writeFileSync(join(fixtureRoot, 'content/docs/components/index.en.mdc'), '---\ntitle: Overview\ndescription: TuffEx overview\ncategory: Foundations\n---\nHello')
      writeFileSync(join(fixtureRoot, 'content/docs/components/index.zh.mdc'), '---\ntitle: 概览\ndescription: TuffEx 概览\ncategory: Foundations\n---\n你好')
      writeFileSync(join(fixtureRoot, 'content/docs/components/button.en.mdc'), '---\ntitle: Button\ndescription: Action button\ncategory: Basic\n---\nButton doc')
      writeFileSync(join(fixtureRoot, 'content/docs/components/button.zh.mdc'), '---\ntitle: 按钮\ndescription: 操作按钮\ncategory: Basic\n---\n按钮文档')

      stageCfAssets(fixtureRoot)

      const stageRoot = join(fixtureRoot, '.dist-cf')
      expect(existsSync(join(stageRoot, '_headers'))).toBe(true)
      expect(existsSync(join(stageRoot, 'tuffex/en/button.html'))).toBe(true)
      expect(existsSync(join(stageRoot, 'tuffex/404.html'))).toBe(true)
      expect(existsSync(join(stageRoot, 'tuffex/__not-found.html'))).toBe(false)
      expect(existsSync(join(stageRoot, 'tuffex/dump.docs.sql'))).toBe(false)
      expect(existsSync(join(stageRoot, 'tuffex/__nuxt_content'))).toBe(false)
      expect(existsSync(join(stageRoot, 'tuffex/api/_build'))).toBe(false)
      expect(existsSync(join(stageRoot, 'tuffex/en/button.md'))).toBe(true)
      expect(existsSync(join(stageRoot, 'tuffex/search-index.en.json'))).toBe(true)
      expect(existsSync(join(stageRoot, 'tuffex/sitemap.xml'))).toBe(true)

      const headers = readFileSync(join(stageRoot, '_headers'), 'utf8')
      expect(headers).toContain('/tuffex/_tuffex/*')
      expect(headers).toContain('max-age=31536000, immutable')
      expect(headers).toContain('/tuffex/en/*')
      expect(headers).toContain('/tuffex/zh/*')
      expect(headers).not.toMatch(/^\/tuffex\/\*$/m)
      expect(headers).not.toContain('_payload.json')
      expect(headers).toContain('Link: </tuffex/_tuffex/entry.abc.js>; rel=modulepreload; crossorigin, </tuffex/_tuffex/entry.abc.css>; rel=preload; as=style; crossorigin')

      const llms = readFileSync(join(stageRoot, 'tuffex/llms.txt'), 'utf8')
      expect(llms).toContain('https://tuff.tagzxia.com/tuffex/en/button.md')
      expect(llms).not.toContain('localhost')
    }
    finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('configures Rolldown codeSplitting with minSize >= 16 KiB and safe eager/nav groups (zero tuffex-wc/vendor/demo groups) and trims SSG i18n preload', () => {
    const splitting = createTuffexCodeSplittingConfig()
    expect(splitting.minSize).toBeGreaterThanOrEqual(16384)
    expect(splitting.groups.map(g => g.name)).toEqual([
      'tuffex-nav-en',
      'tuffex-nav-zh',
      'nuxt-vue-core',
    ])
    expect(splitting.groups.some(g => /wc|vendor|demo|mermaid|three|echarts|react/i.test(g.name))).toBe(false)
    expect(splitting.groups.every(g => g.minSize === 0)).toBe(true)

    expect(resolveTuffexManualChunk('/repo/apps/tuffex-docs/app/components/content/demos/ButtonVariantsDemo.vue')).toBeUndefined()
    expect(resolveTuffexManualChunk('/repo/packages/tuffex-wc/dist/chunks/tier-a.js')).toBeUndefined()
    expect(resolveTuffexManualChunk('/repo/node_modules/three/build/three.module.js')).toBeUndefined()
    expect(resolveTuffexManualChunk('/repo/node_modules/mermaid/dist/mermaid.core.mjs')).toBeUndefined()
    expect(resolveTuffexManualChunk('/repo/apps/tuffex-docs/.nuxt/tuffex-docs-nav-en.mjs')).toBe('tuffex-nav-en')
    expect(resolveTuffexManualChunk('/repo/apps/tuffex-docs/.nuxt/tuffex-docs-nav-zh.mjs')).toBe('tuffex-nav-zh')

    const ctx = {
      messages: {
        en: {
          nav: { home: 'Tuff', store: 'Store' },
          common: { copy: 'Copy', unused: 'Drop me' },
          form: { required: 'Drop me too' },
        },
        zh: {
          nav: { home: 'Tuff', store: '商店' },
        },
      },
      trackMap: {
        en: new Set(['nav.home']),
        zh: new Set(['nav.home']),
      },
    }
    trimServerI18nContext(ctx, '/en/tabs')
    expect(Object.keys(ctx.messages)).toEqual(['en'])
    expect(ctx.messages.en).toEqual({
      nav: { home: 'Tuff' },
      common: { copy: 'Copy' },
    })
  })
})
