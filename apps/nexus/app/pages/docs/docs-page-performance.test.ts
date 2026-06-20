import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./[...slug].vue', import.meta.url), 'utf8')

describe('docs page performance boundaries', () => {
  it('keys catch-all docs pages by route path to avoid stale content on client navigation', () => {
    expect(page).toMatch(/definePageMeta\(\{[\s\S]*key: route => route\.path[\s\S]*\}\)/)
  })

  it('keeps bottom engagement panels behind idle or near-viewport activation', () => {
    expect(page).toContain('shouldMountDocEngagementPanels')
    expect(page).toContain('docEngagementAnchorRef')
    expect(page).toContain('IntersectionObserver')
    expect(page).toContain('requestIdleCallback')
    expect(page).toContain('DOC_ENGAGEMENT_PANEL_DELAY_MS = 3200')
    expect(page).toContain('DOC_ENGAGEMENT_PANEL_IDLE_TIMEOUT_MS = 5000')
    expect(page).toMatch(/setTimeout\(\(\) => \{[\s\S]*IntersectionObserver[\s\S]*DOC_ENGAGEMENT_PANEL_DELAY_MS/)
    expect(page).toContain('<LazyDocsFeedback v-if="shouldMountDocEngagementPanels"')
    expect(page).toContain('<LazyDocsComments v-if="shouldMountDocEngagementPanels"')
  })

  it('keeps lightweight docs tracking separate from bottom engagement widgets', () => {
    expect(page).toContain('<LazyDocsEngagementClient')
    expect(page).toContain('v-if="shouldMountDocClientPanels"')
    expect(page).toContain('<LazyDocsFeedback v-if="shouldMountDocEngagementPanels"')
    expect(page).toContain('<LazyDocsComments v-if="shouldMountDocEngagementPanels"')
  })

  it('caches split full-body docs on the client without deep AST reactivity', () => {
    expect(page).toContain('DOCS_FULL_BODY_CACHE_LIMIT = 24')
    expect(page).toContain('const docsFullBodyCache = new Map<string, Record<string, any> | null>()')
    expect(page).toContain('function resolveFullDocCacheKey(value: Record<string, any> | null)')
    expect(page).toContain("const localeMatch = rawPath.match(/\\.(en|zh)$/)")
    expect(page).toContain('function readCachedFullDoc(key: string)')
    expect(page).toContain('function cacheFullDoc(value: Record<string, any> | null)')
    expect(page).toMatch(/return `doc-full:\$\{normalizedPath\}:\$\{locale\}`/)
    expect(page).toContain('while (docsFullBodyCache.size > DOCS_FULL_BODY_CACHE_LIMIT)')
    expect(page).toContain('getCachedData: (key: string) => readCachedFullDoc(key)')
    expect(page).toContain('transform: (value: Record<string, any> | null) => cacheFullDoc(value)')
    expect(page).toMatch(/key: requestKey,[\s\S]*watch: \[docPath, docsLocale, shouldSplitDocBody\]/)
    expect(page).toMatch(/key: fullDocRequestKey,[\s\S]*watch: \[docPath, docsLocale, shouldSplitDocBody\]/)
    expect(page).toContain('deep: false')
    expect(page).toContain("dedupe: 'defer'")
  })
})
