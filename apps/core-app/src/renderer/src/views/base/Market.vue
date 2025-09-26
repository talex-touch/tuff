<template>
  <div class="market-container">
    <!-- Header Section -->
    <div class="market-header">
      <div class="market-header-title">
        <h2>{{ t('market.title') }}</h2>
        <span class="market-subtitle">{{ t('market.subtitle') }}</span>
        <span v-if="lastUpdatedLabel" class="market-last-updated">
          {{ t('market.lastUpdated', { time: lastUpdatedLabel }) }}
        </span>
      </div>

      <div class="market-header-search">
        <FlatCompletion :fetch="suggestionFetch" :placeholder="t('market.searchPlaceholder')" />
        <div
          :class="{ _disabled: sourceEditorShow }"
          class="market-sources"
          flex
          items-center
          gap-2
        >
          <FlatButton mini @click="toggleSourceEditorShow()">
            <div class="i-carbon-list" />
          </FlatButton>
          <span class="source-count"
            >{{ pluginSettings.source.list.length }} {{ t('market.sources') }}</span
          >
        </div>
      </div>

      <div class="market-header-controls">
        <div class="market-tags">
          <button
            v-for="(item, index) in tags"
            :key="item.tag || item.label || index"
            @click="tagInd = index"
            :class="{ active: tagInd === index }"
            class="tag-button"
          >
            {{ item.label ?? t(item.tag) }}
          </button>
        </div>
        <div class="market-view-toggle">
          <TLabelSelect v-model="orderType">
            <TLabelSelectItem value="grid" icon="i-carbon-table-split" />
            <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
          </TLabelSelect>
          <FlatButton
            mini
            class="refresh-button"
            :disabled="loading"
            @click="loadOfficialPlugins(true)"
          >
            <i :class="loading ? 'i-ri-loader-4-line animate-spin' : 'i-ri-refresh-line'" />
            <span>{{ loading ? t('market.loading') : t('market.refresh') }}</span>
          </FlatButton>
        </div>
      </div>
    </div>

    <!-- Market Items Grid -->
    <div class="market-content">
      <div v-if="loading" class="market-loading">
        <i class="i-ri-loader-4-line animate-spin" />
        <span>{{ t('market.loading') }}</span>
      </div>
      <template v-else>
        <transition-group
          name="market-items"
          tag="div"
          :class="['market-grid', { 'list-view': orderType === 'list' }]"
          @before-enter="onBeforeEnter"
          @enter="onEnter"
          @leave="onLeave"
        >
          <MarketItemCard
            v-for="(item, index) in displayedPlugins"
            :key="item.id || item.name || index"
            :item="item"
            :index="index"
            :installing="isInstalling(item.id)"
            :data-index="index"
            class="market-grid-item"
            @install="handleInstall(item)"
          />
        </transition-group>

        <!-- Empty State -->
        <div v-if="!displayedPlugins.length" class="market-empty">
          <div class="empty-icon">
            <i class="i-ri-search-line" />
          </div>
          <h3>{{ t('market.empty.title') }}</h3>
          <p>{{ errorMessage || t('market.empty.subtitle') }}</p>
        </div>
      </template>
    </div>
  </div>

  <MarketSourceEditor :toggle="toggleSourceEditorShow" :show="sourceEditorShow" />
</template>

<script lang="ts" name="Market" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToggle } from '@vueuse/core'
import gsap from 'gsap'
import FlatCompletion from '@comp/base/input/FlatCompletion.vue'
import MarketItemCard from '@comp/market/MarketItemCard.vue'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'
import { pluginSettings } from '~/modules/storage/plugin-settings'
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { forTouchTip } from '~/modules/mention/dialog-mention'

interface OfficialManifestVersionEntry {
  version: string
  path: string
  timestamp?: string
}

interface OfficialManifestEntry {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  path: string
  timestamp?: string
  metadata?: {
    readme_path?: string
    [key: string]: unknown
  }
  versions?: OfficialManifestVersionEntry[]
}

interface CategoryTag {
  tag: string
  filter: string
  label?: string
}

interface OfficialPluginListItem {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  downloadUrl: string
  readmeUrl?: string
  official: boolean
  metadata?: Record<string, unknown>
  timestamp?: string
}

const { t } = useI18n()

const MANIFEST_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json'
const MANIFEST_BASE_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/'

const orderType = ref<'grid' | 'list'>('grid')
const [sourceEditorShow, toggleSourceEditorShow] = useToggle()
const tagInd = ref(0)
const tags = ref<CategoryTag[]>([{ tag: 'market.tags.all', filter: '' }])

const loading = ref(false)
const errorMessage = ref('')
const lastUpdated = ref<number | null>(null)
const searchKey = ref('')

const officialPlugins = ref<OfficialPluginListItem[]>([])
const installingState = reactive(new Map<string, boolean>())
let rendererChannel: ITouchClientChannel | undefined
let channelLoadFailed = false

const suggestionFetch = (key = ''): string[] => {
  const normalized = key.trim()
  searchKey.value = normalized

  if (!normalized) {
    return officialPlugins.value.slice(0, 6).map((plugin) => plugin.name)
  }

  const lower = normalized.toLowerCase()
  return officialPlugins.value
    .filter((plugin) => plugin.name.toLowerCase().includes(lower))
    .map((plugin) => plugin.name)
}

const selectedTag = computed(() => tags.value[tagInd.value] ?? tags.value[0])

const displayedPlugins = computed(() => {
  const categoryFilter = selectedTag.value?.filter?.toLowerCase() ?? ''
  const normalizedKey = searchKey.value.trim().toLowerCase()

  return officialPlugins.value.filter((plugin) => {
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

const lastUpdatedLabel = computed(() => {
  if (!lastUpdated.value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(lastUpdated.value))
  } catch (error) {
    console.warn('[Market] Failed to format last updated timestamp', error)
    return new Date(lastUpdated.value).toLocaleString()
  }
})

const isInstalling = (id: string): boolean => installingState.get(id) === true

function updateCategoryTags(): void {
  const categories = Array.from(
    new Set(
      officialPlugins.value
        .map((plugin) => plugin.category)
        .filter((category): category is string => typeof category === 'string' && category.trim().length > 0)
    )
  )

  const base: CategoryTag[] = [{ tag: 'market.tags.all', filter: '' }]

  for (const category of categories) {
    const lower = category.toLowerCase()
    if (lower === 'tools') {
      base.push({ tag: 'market.tags.tools', filter: lower })
      continue
    }

    base.push({
      tag: '',
      filter: lower,
      label: category
    })
  }

  tags.value = base
  if (tagInd.value >= tags.value.length) tagInd.value = 0
}

function mapManifestEntry(entry: OfficialManifestEntry): OfficialPluginListItem {
  const normalizedPath = entry.path.replace(/^\//, '')
  const downloadUrl = new URL(normalizedPath, MANIFEST_BASE_URL).toString()

  let readmeUrl: string | undefined
  const readmePath = entry.metadata?.readme_path
  if (readmePath && readmePath.trim().length > 0) {
    readmeUrl = new URL(readmePath.replace(/^\//, ''), MANIFEST_BASE_URL).toString()
  }

  return {
    id: entry.id,
    name: entry.name,
    author: entry.author,
    version: entry.version,
    category: entry.category,
    description: entry.description,
    downloadUrl,
    readmeUrl,
    official: true,
    metadata: entry.metadata,
    timestamp: entry.timestamp
  }
}

async function fetchManifestDirect(): Promise<{ plugins: OfficialPluginListItem[]; fetchedAt: number }>
{
  const response = await fetch(MANIFEST_URL, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`OFFICIAL_PLUGIN_HTTP_${response.status}`)
  }

  const body = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('OFFICIAL_PLUGIN_INVALID_MANIFEST')
  }

  const plugins = body.map((entry: OfficialManifestEntry) => mapManifestEntry(entry))
  return { plugins, fetchedAt: Date.now() }
}

function isElectronRenderer(): boolean {
  return Boolean(typeof window !== 'undefined' && window.process?.type === 'renderer')
}

async function getRendererChannel(): Promise<ITouchClientChannel | undefined> {
  if (rendererChannel) return rendererChannel
  if (channelLoadFailed || !isElectronRenderer()) return undefined

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

async function loadOfficialPlugins(force = false): Promise<void> {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    let result: { plugins: OfficialPluginListItem[]; fetchedAt: number } | null = null

    const channel = await getRendererChannel()
    if (channel) {
      try {
        const response: any = await channel.send('plugin:official-list', { force })

        if (!response || !Array.isArray(response.plugins)) {
          throw new Error(response?.error || 'OFFICIAL_PLUGIN_FETCH_FAILED')
        }

        result = {
          plugins: response.plugins as OfficialPluginListItem[],
          fetchedAt: typeof response.fetchedAt === 'number' ? response.fetchedAt : Date.now()
        }
      } catch (error) {
        console.warn('[Market] Failed to load official plugins via IPC, fallback to HTTP:', error)
      }
    }

    if (!result) {
      result = await fetchManifestDirect()
    }

    officialPlugins.value = result.plugins
    lastUpdated.value = result.fetchedAt

    updateCategoryTags()
  } catch (error: any) {
    console.error('[Market] Failed to load official plugins:', error)
    const reason =
      typeof error?.message === 'string' && error.message.trim().length > 0
        ? error.message.trim()
        : ''
    const shouldExposeReason =
      reason && !reason.startsWith('OFFICIAL_PLUGIN_') && reason !== 'OFFICIAL_PLUGIN_FETCH_FAILED'

    errorMessage.value = shouldExposeReason ? reason : t('market.error.loadFailed')
  } finally {
    loading.value = false
  }
}

async function handleInstall(plugin: OfficialPluginListItem): Promise<void> {
  if (isInstalling(plugin.id)) return

  const channel = await getRendererChannel()

  if (!channel) {
    await forTouchTip(t('market.installation.failureTitle'), t('market.installation.browserNotSupported'))
    return
  }

  installingState.set(plugin.id, true)

  try {
    const payload: Record<string, unknown> = {
      source: plugin.downloadUrl,
      metadata: {
        officialId: plugin.id,
        officialVersion: plugin.version,
        officialSource: 'talex-touch/tuff-official-plugins'
      }
    }

    const result: any = await channel.send('plugin:install-source', payload)

    if (result?.status === 'success') {
      await forTouchTip(
        t('market.installation.successTitle'),
        t('market.installation.successMessage', { name: plugin.name })
      )
    } else {
      const reason = result?.message || 'INSTALL_FAILED'
      throw new Error(reason)
    }
  } catch (error: any) {
    console.error('[Market] Plugin install failed:', error)
    await forTouchTip(
      t('market.installation.failureTitle'),
      t('market.installation.failureMessage', {
        name: plugin.name,
        reason: error?.message || 'UNKNOWN_ERROR'
      })
    )
  } finally {
    installingState.delete(plugin.id)
  }
}

watch(
  () => officialPlugins.value,
  () => {
    updateCategoryTags()
  },
  { deep: true }
)

onMounted(() => {
  void loadOfficialPlugins()
})

// Smooth animation functions using GSAP
function onBeforeEnter(el) {
  gsap.set(el, {
    opacity: 0,
    y: 30,
    scale: 0.9,
    rotateX: -15
  })
}

function onEnter(el, done) {
  const index = parseInt(el.dataset.index) || 0

  gsap.to(el, {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    duration: 0.6,
    delay: index * 0.1,
    ease: 'back.out(1.2)',
    onComplete: done
  })
}

function onLeave(el, done) {
  const index = parseInt(el.dataset.index) || 0

  gsap.to(el, {
    opacity: 0,
    y: -20,
    scale: 0.95,
    duration: 0.4,
    delay: index * 0.05,
    ease: 'power2.in',
    onComplete: done
  })
}
</script>

<style lang="scss" scoped>
.market-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}

/* Header Styles */
.market-header {
  position: relative;
  padding: 2rem 2.5rem 1.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-extra-light);
}

.market-header-title {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  h2 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
    letter-spacing: -0.025em;
  }

  .market-subtitle {
    font-size: 1rem;
    color: var(--el-text-color-regular);
    opacity: 0.8;
  }

  .market-last-updated {
    font-size: 0.8rem;
    color: var(--el-text-color-secondary);
    opacity: 0.85;
  }
}

.market-header-search {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;

  :deep(.FlatInput-Container) {
    flex: 1;
    max-width: 500px;
    margin: 0;
  }

  .market-sources {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: opacity 0.3s ease;

    &._disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .source-count {
      font-size: 0.875rem;
      color: var(--el-text-color-regular);
      opacity: 0.7;
    }
  }
}

.market-header-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.market-tags {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.tag-button {
  position: relative;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--el-border-color);
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    transform: translateY(-1px);
  }

  &.active {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
  }
}

.market-view-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  .refresh-button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;

    :deep(.FlatButton-Container) {
      min-width: 0;
      padding: 0 0.75rem;
    }

    i {
      font-size: 1rem;
    }
  }
}

/* Content Styles */
.market-content {
  flex: 1;
  overflow: auto;
  padding: 2rem 2.5rem;
}

.market-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 0;
  color: var(--el-text-color-secondary);

  i {
    font-size: 2rem;
    color: var(--el-color-primary);
  }
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 1400px) {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 2rem;
  }

  &.list-view {
    grid-template-columns: 1fr;
    gap: 1rem;

    .market-grid-item {
      height: 100px;
    }
  }
}

.market-grid-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Transition Animations */
.market-items-move,
.market-items-enter-active,
.market-items-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.market-items-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

.market-items-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.market-items-leave-active {
  position: absolute;
  width: 100%;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Empty State */
.market-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;

  .empty-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--el-fill-color-light);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;

    i {
      font-size: 2rem;
      color: var(--el-text-color-placeholder);
    }
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    color: var(--el-text-color-regular);
    opacity: 0.8;
    max-width: 400px;
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .market-header {
    padding: 1.5rem 1rem;
  }

  .market-content {
    padding: 1.5rem 1rem;
  }

  .market-header-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .market-tags {
    order: 2;
  }

  .market-view-toggle {
    order: 1;
    justify-content: flex-end;
  }
}
</style>
