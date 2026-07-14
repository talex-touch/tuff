import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const storePage = readFileSync(new URL('./store.vue', import.meta.url), 'utf8')
const storeSearch = readFileSync(new URL('../components/store/StoreSearch.vue', import.meta.url), 'utf8')

function extractFunctionBody(source: string, signature: string) {
  const signatureIndex = source.indexOf(signature)
  expect(signatureIndex).toBeGreaterThanOrEqual(0)

  const bodyStart = source.indexOf('{', signatureIndex)
  expect(bodyStart).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{')
      depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0)
        return source.slice(bodyStart, index + 1)
    }
  }

  throw new Error(`Could not extract function body for ${signature}`)
}

describe('store page remote search performance boundaries', () => {
  it('requests compact paged store search data on first load', () => {
    expect(storePage).toContain('const STORE_PLUGIN_PAGE_SIZE = 50')
    expect(storePage).toMatch(/function resolveStoreSearchQuery\(offset = 0\) \{[\s\S]*compact: 1,[\s\S]*q: activeSearch\.value \|\| undefined,[\s\S]*category: activeCategory\.value === 'all' \? undefined : activeCategory\.value,[\s\S]*limit: STORE_PLUGIN_PAGE_SIZE,[\s\S]*offset,[\s\S]*\}/)
    expect(storePage).toContain('const storeSearchQuery = computed(() => resolveStoreSearchQuery(0))')
    expect(storePage).toMatch(/await useAsyncData\('store-plugins', \(\) =>\s*requestJson<StorePluginSearchResponse>\('\/api\/store\/search', \{\s*query: storeSearchQuery\.value,\s*\}\),\s*\{\s*watch: \[storeSearchQuery\],\s*\}\)/)
    expect(storePage).not.toMatch(/await useAsyncData\('store-plugins',[\s\S]*requestJson<[^>]*>\('\/api\/store\/plugins'/)
  })

  it('refreshes searches through useAsyncData watch instead of local full-list filtering', () => {
    expect(storePage).toContain('watch: [storeSearchQuery]')
    expect(storePage).toContain('function applyStoreSearch(value: string)')
    expect(storePage).toMatch(/function applyStoreSearch\(value: string\) \{[\s\S]*const normalized = value\.trim\(\)[\s\S]*activeSearch\.value = normalized[\s\S]*\}/)
    expect(storePage).toContain('watch(() => filters.category, (category) => {')
    expect(storePage).toContain('activeCategory.value = category')
    expect(storePage).toContain('const allPlugins = computed(() => (pluginsPayload.value?.plugins ?? []).filter(plugin => plugin.latestVersion))')
    expect(storePage).not.toContain('matchesCategory')
    expect(storePage).not.toContain('haystack')
  })

  it('loads more results from store search with displayed-count offset and appends unique plugins', () => {
    const loadMorePlugins = extractFunctionBody(storePage, 'async function loadMorePlugins()')

    expect(loadMorePlugins).toContain("requestJson<StorePluginSearchResponse>('/api/store/search'")
    expect(loadMorePlugins).toContain('query: resolveStoreSearchQuery(displayedPluginCount.value)')
    expect(loadMorePlugins).toContain('const requestedSearch = activeSearch.value')
    expect(loadMorePlugins).toContain('const requestedCategory = activeCategory.value')
    expect(loadMorePlugins).toContain('const currentPlugins = pluginsPayload.value?.plugins ?? []')
    expect(loadMorePlugins).toContain('const seen = new Set(currentPlugins.map(plugin => plugin.id))')
    expect(loadMorePlugins).toContain('const nextPlugins = response.plugins.filter(plugin => plugin.latestVersion && !seen.has(plugin.id))')
    expect(loadMorePlugins).toContain('plugins: [...currentPlugins, ...nextPlugins]')
    expect(loadMorePlugins).toContain('total: response.total')
    expect(loadMorePlugins).toContain('offset: response.offset')
    expect(loadMorePlugins).not.toContain("'/api/store/plugins'")
  })

  it('passes remote debounce search intent from StoreSearch to the page', () => {
    expect(storePage).toContain('<StoreSearch v-model:filter="filters.category" v-model="filters.search" remote :search-debounce="180" class="w-full" @search="applyStoreSearch">')

    expect(storeSearch).toContain('remote?: boolean')
    expect(storeSearch).toContain('searchDebounce?: number')
    expect(storeSearch).toContain(":remote=\"props.remote\"")
    expect(storeSearch).toContain(":search-debounce=\"props.searchDebounce\"")
    expect(storeSearch).toContain("(event: 'search', value: string): void")
    expect(storeSearch).toContain("@search=\"value => emit('search', value)\"")
  })

  it('keeps plugin detail overlay code out of the initial store page imports', () => {
    expect(storePage).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(storePage).toContain("const LazyPluginMetaHeader = defineAsyncComponent(() => import('~/components/dashboard/PluginMetaHeader.vue'))")
    expect(storePage).toContain("const LazyTxTabs = defineAsyncComponent(() => import('@talex-touch/tuffex/tabs').then(module => module.TxTabs))")
    expect(storePage).toContain('v-if="selectedSlug || detailPending"')
    expect(storePage).toContain('<LazyFlipDialog')
    expect(storePage).toContain('<LazyTxTabs')
    expect(storePage).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(storePage).not.toContain("import PluginMetaHeader from '~/components/dashboard/PluginMetaHeader.vue'")
    expect(storePage).not.toContain("import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'")
    expect(storePage).not.toContain("import {\n  SharedPluginDetailReadme,\n  SharedPluginDetailVersions,\n} from '@talex-touch/utils/renderer/shared/components'")
  })
})
