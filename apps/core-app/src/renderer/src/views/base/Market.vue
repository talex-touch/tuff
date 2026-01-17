<script lang="ts" name="Market" setup>
import { useToggle } from '@vueuse/core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarketGridView from '~/components/market/MarketGridView.vue'
import MarketHeader from '~/components/market/MarketHeader.vue'
import { useMarketCategories } from '~/composables/market/useMarketCategories'
import type { MarketPluginListItem } from '~/composables/market/useMarketData'
import { useMarketData } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import { usePluginVersionStatus } from '~/composables/market/usePluginVersionStatus'
import { marketSourcesStorage } from '~/modules/storage/market-sources'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'

const router = useRouter()
const route = useRoute()

const { plugins: marketPlugins, stats: providerStats, loading, loadMarketPlugins } = useMarketData()

const { selectedTag, updateCategoryTags } = useMarketCategories(marketPlugins)

const { handleInstall } = useMarketInstall()

const { installedPluginNames, installedPluginVersions } = usePluginVersionStatus()

const [sourceEditorShow, toggleSourceEditorShow] = useToggle()
const viewType = ref<'grid' | 'list'>('grid')
const tabs = ref<'market' | 'installed'>(
  route.path === '/market/installed' ? 'installed' : 'market'
)
const searchKey = ref('')
const sourcesState = marketSourcesStorage.get()
const sourcesCount = computed(() => sourcesState.sources.length)

const PluginInstalled = defineAsyncComponent(() => import('~/views/base/Plugin.vue'))

const providerStatsComputed = computed(() => {
  const stats = providerStats.value
  return {
    total: stats.length,
    success: stats.filter((s) => s.success).length,
    failed: stats.filter((s) => !s.success).length,
    totalPlugins: stats.reduce((sum, s) => sum + s.itemCount, 0)
  }
})

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
  const installedVersion = installedPluginVersions.value.get(plugin.name)
  const isUpgrade = Boolean(installedVersion && plugin.version)
  await handleInstall(plugin, isUpgrade ? { isUpgrade: true, autoReEnable: true } : undefined)
}

function openPluginDetail(plugin: MarketPluginListItem): void {
  router.push({ path: `/market/${plugin.id}`, query: { provider: plugin.providerId } })
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
      v-model:tabs="tabs"
      v-model:view-type="viewType"
      :loading="loading"
      :sources-count="sourcesCount"
      :provider-stats="providerStatsComputed"
      :provider-details="providerStats"
      @refresh="loadMarketPlugins(true)"
      @open-source-editor="toggleSourceEditorShow()"
      @search="handleSearch"
    />

    <Transition name="market-tabs" mode="out-in">
      <MarketGridView
        v-if="tabs === 'market'"
        key="market"
        :plugins="displayedPlugins"
        :view-type="viewType"
        :loading="loading"
        :installed-names="installedPluginNames"
        :installed-versions="installedPluginVersions"
        @install="onInstall"
        @open-detail="openPluginDetail"
      />
      <PluginInstalled v-else key="installed" class="flex-1 min-h-0" />
    </Transition>
  </div>

  <MarketSourceEditor :toggle="toggleSourceEditorShow" :show="sourceEditorShow" />
</template>

<style lang="scss" scoped>
.market-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.market-tabs-enter-active,
.market-tabs-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    filter 0.18s ease;
  will-change: transform, opacity;
}

.market-tabs-enter-from {
  opacity: 0;
  transform: translateX(10px);
  filter: blur(2px);
}

.market-tabs-leave-to {
  opacity: 0;
  transform: translateX(-10px);
  filter: blur(2px);
}
</style>
