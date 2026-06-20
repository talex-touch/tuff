import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./[...slug].vue', import.meta.url), 'utf8')
const docsOutline = readFileSync(new URL('../../components/DocsOutline.vue', import.meta.url), 'utf8')
const docsSidebar = readFileSync(new URL('../../components/DocsSidebar.vue', import.meta.url), 'utf8')
const touchAurora = readFileSync(new URL('../../components/tuff/background/TouchAurora.vue', import.meta.url), 'utf8')
const avatarVariantsDemo = readFileSync(new URL('../../components/content/demos/AvatarVariantsAvatarVariantsGalleryDemo.vue', import.meta.url), 'utf8')

describe('docs page performance boundaries', () => {
  it('keys catch-all docs pages by route path to avoid stale content on client navigation', () => {
    expect(page).toMatch(/definePageMeta\(\{[\s\S]*key: route => route\.path[\s\S]*\}\)/)
    expect(page).toContain('const router = useRouter()')
    expect(page).toContain('const activeRoutePath = ref(route.path)')
    expect(page).toMatch(/activeRoutePath\.value = router\.currentRoute\.value\.path \|\| route\.path[\s\S]*const removeRouteSync = router\.afterEach\(\(to\) => \{[\s\S]*activeRoutePath\.value = to\.path[\s\S]*onBeforeUnmount\(removeRouteSync\)/)
    expect(page).toContain('const docsLocale = computed(() => resolveDocsLocaleFromRoute(activeRoutePath.value))')
    expect(page).toContain('const docPath = computed(() => normalizeDocsPagePath(activeRoutePath.value))')
    expect(page).toContain("const shouldSplitDocBody = computed(() => normalizeDocsPagePath(activeRoutePath.value).includes('/docs/dev/components'))")
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

  it('keeps the browser title reactive when a reused docs route changes', () => {
    expect(page).toMatch(/useHead\(\(\) => \(\{[\s\S]*title: docSeoHead\.value\.pageTitle[\s\S]*\}\)\)/)
  })

  it('preserves Vue Router history state when syncing the outline hash', () => {
    expect(docsOutline).not.toContain("history.replaceState(null, '', next)")
    expect(docsOutline).toMatch(/history\.replaceState\(history\.state, '', `\$\{window\.location\.pathname\}\$\{window\.location\.search\}\$\{next\}`\)/)
  })

  it('requests component sidebar metadata by locale instead of downloading both languages', () => {
    expect(docsSidebar).toContain("'/api/docs/sidebar-components'")
    expect(docsSidebar).toMatch(/key: computed\(\(\) => `docs-components-meta:\$\{docsLocale\.value\}`\)/)
    expect(docsSidebar).toMatch(/query: computed\(\(\) => \(\{[\s\S]*locale: docsLocale\.value,[\s\S]*\}\)\)/)
    expect(docsSidebar).toContain('const componentItems = computed(() => coerceJsonArray<SidebarComponentDoc>(componentDocsPayload.value) as any[])')
  })

  it('requests docs navigation by locale instead of hydrating both language trees', () => {
    expect(page).toContain("'/api/docs/navigation'")
    expect(docsSidebar).toContain("'/api/docs/navigation'")
    expect(page).toMatch(/key: computed\(\(\) => `docs-navigation:\$\{docsLocale\.value\}`\)/)
    expect(docsSidebar).toMatch(/key: computed\(\(\) => `docs-navigation:\$\{docsLocale\.value\}`\)/)
    expect(page).toMatch(/query: computed\(\(\) => \(\{[\s\S]*locale: docsLocale\.value,[\s\S]*\}\)/)
    expect(docsSidebar).toMatch(/query: computed\(\(\) => \(\{[\s\S]*locale: docsLocale\.value,[\s\S]*\}\)/)
  })

  it('keeps decorative footer aurora from throwing when WebGL2 is unavailable', () => {
    expect(touchAurora).toContain('let auroraDisabled = false')
    expect(touchAurora).toContain("const gl = canvas.getContext('webgl2')")
    expect(touchAurora).toContain('function hasAuroraWebglSupport()')
    expect(touchAurora).toMatch(/if \(!hasAuroraWebglSupport\(\)\) \{[\s\S]*auroraDisabled = true[\s\S]*return[\s\S]*\}/)
    expect(touchAurora).toMatch(/try \{[\s\S]*renderer = new Renderer[\s\S]*\}[\s\S]*catch \{[\s\S]*auroraDisabled = true[\s\S]*renderer = null[\s\S]*return[\s\S]*\}/)
  })

  it('keeps migrated avatar variants demos self-contained for client rendering', () => {
    expect(avatarVariantsDemo).toContain("import AvatarVariantCard from './AvatarVariantCard.vue'")
    expect(avatarVariantsDemo).toContain('<AvatarVariantCard')
  })

  it('caches split full-body docs on the client without deep AST reactivity', () => {
    expect(page).toContain("import { requestJson, useTypedFetch } from '~/utils/request'")
    expect(page).toContain('DOCS_FULL_BODY_CACHE_LIMIT = 24')
    expect(page).toContain("DOCS_CURRENT_PAGE_FETCH_KEY = 'docs-current-page'")
    expect(page).not.toContain('DOCS_CURRENT_FULL_BODY_FETCH_KEY')
    expect(page).toContain('const docsFullBodyCache = new Map<string, Record<string, any> | null>()')
    expect(page).toContain('function resolveFullDocCacheKey(value: Record<string, any> | null)')
    expect(page).toContain("const localeMatch = rawPath.match(/\\.(en|zh)$/)")
    expect(page).toContain('function readCachedFullDoc(key: string)')
    expect(page).toContain('function hasCachedFullDoc(key: string)')
    expect(page).toContain('function cacheFullDoc(value: Record<string, any> | null)')
    expect(page).toMatch(/return `doc-full:\$\{normalizedPath\}:\$\{locale\}`/)
    expect(page).toContain('while (docsFullBodyCache.size > DOCS_FULL_BODY_CACHE_LIMIT)')
    expect(page).toMatch(/const fullDocCacheKey = computed\(\(\) => `doc-full:\$\{docPath\.value\}:\$\{docsLocale\.value\}`\)/)
    expect(page).toContain('const fullDoc = shallowRef<Record<string, any> | null>(null)')
    expect(page).toContain('const fullDocLoading = ref(false)')
    expect(page).toContain('key: DOCS_CURRENT_PAGE_FETCH_KEY')
    expect(page).toMatch(/key: DOCS_CURRENT_PAGE_FETCH_KEY,[\s\S]*watch: false/)
    expect(page).toContain('let activeDocFetchId = 0')
    expect(page).toContain('async function loadFullDocForRoute(fetchId: number, path: string, locale: \'en\' | \'zh\')')
    expect(page).toMatch(/const cacheKey = `doc-full:\$\{path\}:\$\{locale\}`[\s\S]*if \(hasCachedFullDoc\(cacheKey\)\) \{[\s\S]*fullDoc\.value = readCachedFullDoc\(cacheKey\) \?\? null/)
    expect(page).toMatch(/fullDocLoading\.value = true[\s\S]*requestJson<Record<string, any> \| null>\('\/api\/docs\/page'[\s\S]*body: '1'/)
    expect(page).toContain('async function loadActiveDocForRoute()')
    expect(page).toMatch(/const fetchId = \+\+activeDocFetchId[\s\S]*const path = docPath\.value[\s\S]*const locale = docsLocale\.value/)
    expect(page).toMatch(/doc\.value = null[\s\S]*fullDoc\.value = splitBody && cachedFullDoc !== undefined \? cachedFullDoc : null[\s\S]*isLoading\.value = true[\s\S]*fullDocLoading\.value = splitBody && cachedFullDoc === undefined/)
    expect(page).toMatch(/requestJson<Record<string, any> \| null>\('\/api\/docs\/page'[\s\S]*body: splitBody \? '0' : '1'/)
    expect(page).toMatch(/if \(fetchId !== activeDocFetchId \|\| path !== docPath\.value \|\| locale !== docsLocale\.value\)[\s\S]*return/)
    expect(page).toMatch(/fullDoc\.value = cacheFullDoc\(nextFullDoc\)/)
    expect(page).toMatch(/watch\(requestKey, \(\) => \{[\s\S]*void loadActiveDocForRoute\(\)[\s\S]*\}\)/)
    expect(page).toMatch(/onMounted\(\(\) => \{[\s\S]*if \(shouldSplitDocBody\.value && !fullDoc\.value && !fullDocLoading\.value\)[\s\S]*void loadFullDocForRoute\(fetchId, docPath\.value, docsLocale\.value\)/)
    expect(page).toMatch(/return `\$\{path\}:\$\{docsLocale\.value\}:\$\{source\?\.body \? 'body' : 'meta'\}`/)
  })
})
