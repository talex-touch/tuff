<script lang="ts" name="Store" setup>
import type { StorePluginListItem } from '~/composables/store/useStoreData'
import { usePlatformSdk } from '@talex-touch/utils/renderer'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import StoreGridView from '~/components/store/StoreGridView.vue'
import StoreHeader from '~/components/store/StoreHeader.vue'
import StoreInstallButton from '~/components/store/StoreInstallButton.vue'
import StorePluginMetaHeader from '~/components/store/StorePluginMetaHeader.vue'
import { useStoreCategories } from '~/composables/store/useStoreCategories'
import { useStoreData } from '~/composables/store/useStoreData'
import { useStoreInstall } from '~/composables/store/useStoreInstall'
import { usePluginVersionStatus } from '~/composables/store/usePluginVersionStatus'
import { storeSourcesStorage } from '~/modules/storage/store-sources'
import StoreDetailOverlay from '~/views/base/store/StoreDetailOverlay.vue'
import StoreSourceEditor from '~/views/base/store/StoreSourceEditor.vue'

const router = useRouter()
const route = useRoute()
const platformSdk = usePlatformSdk()

type StoreTab = 'store' | 'installed' | 'docs' | 'cli'
const TUFF_CLI_CAPABILITY_ID = 'platform.tuff-cli'
const STORE_BASE_PATHS = new Set(['/store', '/store/installed', '/store/docs', '/store/cli'])

function resolveTabByPath(path: string): StoreTab {
  if (path === '/store/installed') return 'installed'
  if (path === '/store/docs') return 'docs'
  if (path === '/store/cli') return 'cli'
  return 'store'
}

function resolvePathByTab(tab: StoreTab): string {
  if (tab === 'installed') return '/store/installed'
  if (tab === 'docs') return '/store/docs'
  if (tab === 'cli') return '/store/cli'
  return '/store'
}

function isStoreDetailPath(path: string): boolean {
  return path.startsWith('/store/') && !STORE_BASE_PATHS.has(path)
}

const { plugins: storePlugins, stats: providerStats, loading, loadStorePlugins } = useStoreData()

const { selectedTag, updateCategoryTags } = useStoreCategories(storePlugins)

const { handleInstall, getInstallTask } = useStoreInstall()

const {
  installedPluginNames,
  installedPluginVersions,
  getInstalledVersionForStore,
  getPluginVersionStatus
} = usePluginVersionStatus()

const sourceEditorShow = ref(false)
const sourceEditorSource = ref<HTMLElement | null>(null)
const selectedPluginId = ref<string | null>(null)
const selectedProviderId = ref<string | null>(null)
const detailVisible = ref(false)
const detailOverlaySource = ref<HTMLElement | null>(null)
const viewType = ref<'grid' | 'list'>('grid')
const initialTab: StoreTab = resolveTabByPath(route.path)
const tabs = ref<StoreTab>(initialTab)
const showCliTab = ref(false)
const searchKey = ref('')
const sourcesState = storeSourcesStorage.get()
const sourcesCount = computed(() => sourcesState.sources.length)

const PluginInstalled = defineAsyncComponent(() => import('~/views/base/Plugin.vue'))
const StoreDocs = defineAsyncComponent(() => import('~/views/base/store/StoreDocs.vue'))
const StoreCliBeta = defineAsyncComponent(() => import('~/views/base/store/StoreCliBeta.vue'))

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

  return storePlugins.value.filter((plugin) => {
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

const activeDetailPlugin = computed<StorePluginListItem | null>(() => {
  if (!selectedPluginId.value) {
    return null
  }

  return (
    storePlugins.value.find(
      (plugin) =>
        plugin.id === selectedPluginId.value &&
        (!selectedProviderId.value || plugin.providerId === selectedProviderId.value)
    ) || null
  )
})

const activeDetailPluginStatus = computed(() => getPluginVersionStatus(activeDetailPlugin.value))
const activeDetailInstallTask = computed(() =>
  activeDetailPlugin.value
    ? getInstallTask(activeDetailPlugin.value.id, activeDetailPlugin.value.providerId)
    : undefined
)

function handleSearch(query: string): void {
  searchKey.value = query
}

function openSourceEditor(source: HTMLElement | null): void {
  sourceEditorSource.value = source
  sourceEditorShow.value = true
}

async function onInstall(plugin: StorePluginListItem): Promise<void> {
  const installedVersion = getInstalledVersionForStore(plugin)
  const isUpgrade = Boolean(installedVersion && plugin.version)
  await handleInstall(plugin, isUpgrade ? { isUpgrade: true, autoReEnable: true } : undefined)
}

async function onInstallActiveDetail(): Promise<void> {
  if (!activeDetailPlugin.value) {
    return
  }

  const isUpgrade = activeDetailPluginStatus.value.hasUpgrade
  await handleInstall(
    activeDetailPlugin.value,
    isUpgrade ? { isUpgrade: true, autoReEnable: true } : undefined
  )
}

function openPluginDetail(plugin: StorePluginListItem, source: HTMLElement | null): void {
  detailOverlaySource.value = source
  selectedPluginId.value = plugin.id
  selectedProviderId.value = plugin.providerId ?? null
  detailVisible.value = true

  void router.push({
    path: `/store/${plugin.id}`,
    query: plugin.providerId ? { provider: plugin.providerId } : undefined
  })
}

function closePluginDetail(): void {
  detailVisible.value = false
  detailOverlaySource.value = null

  if (isStoreDetailPath(route.path)) {
    void router.replace({ path: '/store' })
  }
}

async function refreshCliTabVisibility(): Promise<void> {
  try {
    const capabilities = await platformSdk.listCapabilities({ scope: 'plugin' })
    showCliTab.value = capabilities.some(
      (item) => item.id === TUFF_CLI_CAPABILITY_ID && item.supportLevel !== 'unsupported'
    )
  } catch (error) {
    showCliTab.value = false
    console.warn('[Store] Failed to check Tuff CLI capability:', error)
  }

  if (!showCliTab.value && tabs.value === 'cli') {
    tabs.value = 'store'
  }
}

watch(
  () => storePlugins.value,
  () => {
    updateCategoryTags()
  },
  { deep: true }
)

watch(
  () => route.fullPath,
  () => {
    const path = route.path
    const nextTab = resolveTabByPath(path)
    if (tabs.value !== nextTab) {
      tabs.value = nextTab
    }

    if (isStoreDetailPath(path)) {
      const id = route.params.id
      selectedPluginId.value = typeof id === 'string' ? id : null
      selectedProviderId.value =
        typeof route.query.provider === 'string' ? route.query.provider : null
      detailVisible.value = Boolean(selectedPluginId.value)
      return
    }

    detailVisible.value = false
    selectedPluginId.value = null
    selectedProviderId.value = null
    detailOverlaySource.value = null
  },
  { immediate: true }
)

watch(tabs, (nextTab) => {
  if (nextTab === 'store' && isStoreDetailPath(route.path)) {
    return
  }

  const targetPath = resolvePathByTab(nextTab)
  if (route.path !== targetPath) {
    void router.replace({ path: targetPath })
  }
})

onMounted(() => {
  void loadStorePlugins()
  void refreshCliTabVisibility()
})
</script>

<template>
  <div class="store-container">
    <StoreHeader
      v-model:tabs="tabs"
      v-model:view-type="viewType"
      :loading="loading"
      :sources-count="sourcesCount"
      :show-cli-tab="showCliTab"
      :provider-stats="providerStatsComputed"
      :provider-details="providerStats"
      @refresh="loadStorePlugins(true)"
      @open-source-editor="openSourceEditor"
      @search="handleSearch"
    />

    <Transition name="store-tabs" mode="out-in">
      <StoreGridView
        v-if="tabs === 'store'"
        key="store"
        :plugins="displayedPlugins"
        :view-type="viewType"
        :loading="loading"
        :installed-names="installedPluginNames"
        :installed-versions="installedPluginVersions"
        @install="onInstall"
        @open-detail="openPluginDetail"
      />
      <StoreDocs v-else-if="tabs === 'docs'" key="docs" class="flex-1 min-h-0" />
      <StoreCliBeta v-else-if="tabs === 'cli'" key="cli" class="flex-1 min-h-0" />
      <PluginInstalled v-else key="installed" class="flex-1 min-h-0" />
    </Transition>
  </div>

  <StoreSourceEditor v-model="sourceEditorShow" :source="sourceEditorSource" />

  <FlipDialog
    v-model="detailVisible"
    :reference="detailOverlaySource"
    size="lg"
    @closed="closePluginDetail"
  >
    <template #header-display>
      <StorePluginMetaHeader v-if="activeDetailPlugin" :plugin="activeDetailPlugin" />
      <div v-else class="StoreDetailOverlay-HeaderPlaceholder">
        <p class="StoreDetailOverlay-HeaderTitle">
          {{ selectedPluginId || 'Plugin Details' }}
        </p>
      </div>
    </template>
    <template #header-actions>
      <StoreInstallButton
        v-if="activeDetailPlugin"
        :plugin-name="activeDetailPlugin.name"
        :is-installed="activeDetailPluginStatus.isInstalled"
        :has-upgrade="activeDetailPluginStatus.hasUpgrade"
        :installed-version="activeDetailPluginStatus.installedVersion"
        :store-version="activeDetailPluginStatus.storeVersion"
        :install-task="activeDetailInstallTask"
        :mini="false"
        @install="onInstallActiveDetail"
      />
    </template>
    <StoreDetailOverlay
      :plugin-id="selectedPluginId"
      :provider-id="selectedProviderId"
      @close="closePluginDetail"
    />
  </FlipDialog>
</template>

<style lang="scss" scoped>
.store-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.store-tabs-enter-active,
.store-tabs-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    filter 0.18s ease;
  will-change: transform, opacity;
}

.store-tabs-enter-from {
  opacity: 0;
  transform: translateX(10px);
  filter: blur(2px);
}

.store-tabs-leave-to {
  opacity: 0;
  transform: translateX(-10px);
  filter: blur(2px);
}

.StoreDetailOverlay-HeaderPlaceholder {
  min-width: 0;
}

.StoreDetailOverlay-HeaderTitle {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--tx-text-color, #111827);
}
</style>
