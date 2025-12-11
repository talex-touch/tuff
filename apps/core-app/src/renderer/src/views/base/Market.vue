<script lang="ts" name="Market" setup>
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { useToggle } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarketGridView from '~/components/market/MarketGridView.vue'
import MarketHeader from '~/components/market/MarketHeader.vue'
import { useMarketCategories } from '~/composables/market/useMarketCategories'
import type { MarketPluginListItem } from '~/composables/market/useMarketData'
import { useMarketData } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import { marketSourcesStorage } from '~/modules/storage/market-sources'
import { usePluginStore } from '~/stores/plugin'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'

const router = useRouter()

// Market data management
const { plugins: marketPlugins, stats: providerStats, loading, loadMarketPlugins } = useMarketData()

// Category management
const { tags: _tags, tagInd: _tagInd, selectedTag, updateCategoryTags } = useMarketCategories(marketPlugins)

// Installation management
const { handleInstall } = useMarketInstall()

// Installed plugins (for checking if a market plugin is already installed)
const pluginStore = usePluginStore()
const installedPluginNames = computed(() => new Set([...pluginStore.plugins.keys()]))

// UI state
const [sourceEditorShow, toggleSourceEditorShow] = useToggle()
const viewType = ref<'grid' | 'list'>('grid')
const searchKey = ref('')
const sourcesState = marketSourcesStorage.get()
const sourcesCount = computed(() => sourcesState.sources.length)

// Provider stats
const providerStatsComputed = computed(() => {
  const stats = providerStats.value
  return {
    total: stats.length,
    success: stats.filter(s => s.success).length,
    failed: stats.filter(s => !s.success).length,
    totalPlugins: stats.reduce((sum, s) => sum + s.itemCount, 0)
  }
})

// Renderer channel
let rendererChannel: ITouchClientChannel | undefined
let channelLoadFailed = false

async function getRendererChannel(): Promise<ITouchClientChannel | undefined> {
  if (rendererChannel) return rendererChannel
  if (channelLoadFailed || typeof window === 'undefined' || !window.process?.type) return undefined

  try {
    const module = await import('~/modules/channel/channel-core')
    rendererChannel = module.touchChannel as ITouchClientChannel
    return rendererChannel
  } catch (error) {
    channelLoadFailed = true
    console.warn('[Market] Failed to load channel-core module:', error)
    return undefined
  }
}

// Filtered plugins based on category and search
const displayedPlugins = computed(() => {
  const categoryFilter = selectedTag.value?.filter?.toLowerCase() ?? ''
  const normalizedKey = searchKey.value.trim().toLowerCase()

  return marketPlugins.value.filter((plugin) => {
    const pluginCategory = plugin.category?.toLowerCase() ?? ''
    const matchesCategory = !categoryFilter || pluginCategory === categoryFilter

    if (!matchesCategory) return false

    if (!normalizedKey) return true

    return (
      plugin.name.toLowerCase().includes(normalizedKey) ||
      (plugin.description ?? '').toLowerCase().includes(normalizedKey) ||
      (plugin.author ?? '').toLowerCase().includes(normalizedKey) ||
      plugin.id.toLowerCase().includes(normalizedKey)
    )
  })
})


function handleSearch(query: string): void {
  searchKey.value = query
}

async function onInstall(plugin: MarketPluginListItem): Promise<void> {
  const channel = await getRendererChannel()
  await handleInstall(plugin, channel)
}

function openPluginDetail(plugin: MarketPluginListItem): void {
  router.push(`/market/${plugin.id}`)
}

watch(
  () => marketPlugins.value,
  () => {
    updateCategoryTags()
  },
  { deep: true }
)

onMounted(() => {
  void loadMarketPlugins()
})
</script>

<template>
  <div class="market-container">
    <MarketHeader
      v-model:view-type="viewType"
      :loading="loading"
      :sources-count="sourcesCount"
      :provider-stats="providerStatsComputed"
      :provider-details="providerStats"
      @refresh="loadMarketPlugins(true)"
      @open-source-editor="toggleSourceEditorShow()"
      @search="handleSearch"
    />

    <MarketGridView
      :plugins="displayedPlugins"
      :view-type="viewType"
      :loading="loading"
      :installed-names="installedPluginNames"
      @install="onInstall"
      @open-detail="openPluginDetail"
    />
  </div>

  <MarketSourceEditor :toggle="toggleSourceEditorShow" :show="sourceEditorShow" />
</template>

<style lang="scss" scoped>
.market-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 1.5rem;
  background: var(--el-bg-color);
}
</style>
