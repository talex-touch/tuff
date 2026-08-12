import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildDocsSeoHead } from './docs-seo'

/**
 * The docs SEO head was built from `useRequestURL().origin`. During Nitro
 * prerender there is no real request host, so every prerendered HTML file baked
 * `http://localhost` into rel=canonical, og:url, all hreflang alternates and the
 * JSON-LD url/@id — and nothing in nuxt.config.ts supplied a fallback (#679).
 *
 * buildDocsSeoHead itself was never the problem: it takes whatever origin it is
 * handed. So the regression these guard is the *config* half — that an absolute,
 * non-localhost site URL exists to hand it in the first place.
 */

async function loadNuxtConfig(): Promise<{
  runtimeConfig?: { public?: { siteUrl?: string } }
}> {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const module = await import('../../nuxt.config')
  return module.default as { runtimeConfig?: { public?: { siteUrl?: string } } }
}

describe('docs SEO absolute origin', () => {
  it('configures an absolute site URL for prerendered pages to use', async () => {
    const config = await loadNuxtConfig()
    const siteUrl = config.runtimeConfig?.public?.siteUrl

    expect(siteUrl).toBeTruthy()
    expect(siteUrl).toMatch(/^https:\/\//)
    expect(siteUrl).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it('produces no localhost URLs anywhere in the head when given that origin', async () => {
    const config = await loadNuxtConfig()
    const seo = buildDocsSeoHead({
      appName: 'Tuff Docs',
      description: 'Official docs',
      origin: config.runtimeConfig?.public?.siteUrl ?? '',
      canonicalPath: '/docs/index',
      locale: 'en',
      title: 'Tuff Docs',
      hasContent: true,
      modifiedAt: '2026-06-13T10:00:00.000Z',
    })

    // Every absolute URL the head emits, not just the canonical: og:url, the
    // hreflang alternates and the JSON-LD all carried the same bad origin.
    const serialized = JSON.stringify(seo)
    expect(serialized).not.toContain('http://localhost')
    expect(seo.canonicalUrl).toMatch(/^https:\/\//)
  })

  it('页面在 setup 阶段取 runtimeConfig,而不是在 computed 里', () => {
    // The first version of this fix called useRuntimeConfig() inside the computed that feeds
    // useHead. unhead resolves those tags after the setup context is gone, so every prerendered
    // docs page died with `[nuxt] instance unavailable` and a 500.
    const page = readFileSync(
      new URL('../pages/docs/[...slug].vue', import.meta.url),
      'utf8',
    )

    // Positive control: the read produced the real page, so the absence check below means
    // something.
    expect(page).toContain('const seoOrigin = computed(')

    expect(page).toContain('const runtimeConfig = useRuntimeConfig()')
    expect(page).not.toMatch(/computed\([\s\S]{0,200}?useRuntimeConfig\(\)/)
  })

  it('still honours whatever origin it is handed', () => {
    // Control: the util stays origin-agnostic. The fix belongs in the caller and
    // the config, not in a hardcoded domain down here.
    const seo = buildDocsSeoHead({
      appName: 'Tuff Docs',
      description: 'Official docs',
      origin: 'https://preview.example.com',
      canonicalPath: '/docs/index',
      locale: 'en',
      title: 'Tuff Docs',
      hasContent: true,
      modifiedAt: '2026-06-13T10:00:00.000Z',
    })

    expect(seo.canonicalUrl).toBe('https://preview.example.com/en/docs')
  })
})
