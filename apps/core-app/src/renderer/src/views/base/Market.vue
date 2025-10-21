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
            :installing="isPluginInstalling(item.id)"
            :install-task="getInstallTask(item.id)"
            :data-index="index"
            class="market-grid-item"
            @install="handleInstall(item)"
            @open="openPluginDetail(item)"
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

  <Transition name="market-detail-overlay" @after-leave="onDetailAfterLeave">
    <div
      v-if="detailVisible && activePlugin"
      class="market-detail-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div class="market-detail-backdrop" @click="closePluginDetail" />

      <div class="market-detail-shell">
        <div class="market-detail-panel" :key="activePlugin.id" @click.stop>
          <button class="detail-close" type="button" @click="closePluginDetail">
            <i class="i-ri-close-line" />
          </button>

          <div class="detail-header">
            <div class="detail-icon">
              <i v-if="detailIconClass" :class="detailIconClass" />
              <i v-else class="i-ri-puzzle-line" />
            </div>

            <div class="detail-heading">
              <div class="detail-title-row">
                <h3>{{ activePlugin.name }}</h3>
                <span v-if="activePlugin.official" class="official-detail-badge">
                  <i class="i-ri-shield-check-fill" />
                  {{ t('market.officialBadge') }}
                </span>
              </div>
              <div
                v-if="activePlugin.version || activePlugin.category"
                class="detail-subline"
              >
                <span v-if="activePlugin.version" class="detail-chip">
                  <i class="i-ri-price-tag-3-line" />
                  v{{ activePlugin.version }}
                </span>
                <span v-if="activePlugin.category" class="detail-chip">
                  <i class="i-ri-folder-3-line" />
                  {{ activePlugin.category }}
                </span>
              </div>
              <p v-if="activePlugin.description" class="detail-description">
                {{ activePlugin.description }}
              </p>
            </div>

            <div class="detail-actions">
              <FlatButton
                :primary="true"
                class="detail-install"
                :disabled="(this as any).isInstalling(activePlugin.id)"
                @click="handleInstall(activePlugin)"
              >
                <i
                  v-if="(this as any).isInstalling(activePlugin.id)"
                  class="i-ri-loader-4-line animate-spin"
                />
                <span>
                  {{ (this as any).isInstalling(activePlugin.id) ? t('market.installing') : t('market.install') }}
                </span>
              </FlatButton>
            </div>
          </div>

          <div class="detail-body">
            <div class="detail-meta-grid">
              <div v-for="meta in detailMeta" :key="meta.label" class="detail-meta-item">
                <div class="meta-icon">
                  <i :class="meta.icon" />
                </div>
                <div class="meta-content">
                  <span class="meta-label">{{ meta.label }}</span>
                  <span class="meta-value" :title="meta.value">{{ meta.value }}</span>
                </div>
              </div>
            </div>

            <div v-if="activePlugin.readmeUrl || activePlugin.downloadUrl" class="detail-links">
              <a
                v-if="activePlugin.downloadUrl"
                class="detail-link"
                :href="activePlugin.downloadUrl"
                target="_blank"
                rel="noopener"
              >
                <i class="i-ri-download-cloud-2-line" />
                下载源文件
              </a>
              <a
                v-if="activePlugin.readmeUrl"
                class="detail-link"
                :href="activePlugin.readmeUrl"
                target="_blank"
                rel="noopener"
              >
                <i class="i-ri-book-open-line" />
                查看文档
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <MarketSourceEditor :toggle="toggleSourceEditorShow" :show="sourceEditorShow" />
</template>

<script lang="ts" name="Market" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToggle } from '@vueuse/core'
import gsap from 'gsap'
import FlatCompletion from '@comp/base/input/FlatCompletion.vue'
import MarketItemCard from '@comp/market/MarketItemCard.vue'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'
import { pluginSettings } from '~/modules/storage/plugin-settings'
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import { useInstallManager } from '~/modules/install/install-manager'

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
  icon?: string
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

const detailVisible = ref(false)
const activePlugin = ref<OfficialPluginListItem | null>(null)

const officialPlugins = ref<OfficialPluginListItem[]>([])
let rendererChannel: ITouchClientChannel | undefined
let channelLoadFailed = false

const installManager = useInstallManager()

const getInstallTask = (pluginId?: string) => installManager.getTaskByPluginId(pluginId)

const isPluginInstalling = (pluginId?: string) =>
  installManager.isActiveStage(getInstallTask(pluginId)?.stage)

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

const detailUpdatedLabel = computed(() => {
  const timestamp = activePlugin.value?.timestamp
  if (!timestamp) return ''

  let date: Date | null = null

  if (typeof timestamp === 'number') {
    date = new Date(timestamp)
  } else {
    const numeric = Number(timestamp)
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      date = new Date(numeric)
    } else {
      const parsed = Date.parse(timestamp)
      if (!Number.isNaN(parsed)) {
        date = new Date(parsed)
      }
    }
  }

  if (!date) return ''

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  } catch (error) {
    console.warn('[Market] Failed to format detail timestamp', error)
    return date.toLocaleString()
  }
})

const detailMeta = computed(() => {
  const plugin = activePlugin.value
  if (!plugin) return [] as Array<{ icon: string; label: string; value: string }>

  const meta: Array<{ icon: string; label: string; value: string }> = []

  if (plugin.author) {
    meta.push({ icon: 'i-ri-user-line', label: '作者', value: plugin.author })
  }

  if (plugin.version) {
    meta.push({ icon: 'i-ri-price-tag-3-line', label: '版本', value: `v${plugin.version}` })
  }

  if (detailUpdatedLabel.value) {
    meta.push({ icon: 'i-ri-time-line', label: '更新时间', value: detailUpdatedLabel.value })
  }

  meta.push({ icon: 'i-ri-barcode-line', label: '插件标识', value: plugin.id })

  return meta
})

const detailIconClass = computed(() => {
  const plugin = activePlugin.value
  if (!plugin) return ''

  const metadata = plugin.metadata ?? {}
  const iconClass = typeof metadata?.icon_class === 'string' ? metadata.icon_class.trim() : ''
  if (iconClass) return iconClass

  const metaIcon = typeof metadata?.icon === 'string' ? metadata.icon.trim() : ''
  if (metaIcon) return metaIcon.startsWith('i-') ? metaIcon : `i-${metaIcon}`

  const pluginIcon = (plugin as any).icon
  if (typeof pluginIcon === 'string' && pluginIcon.trim().length > 0) {
    const trimmed = pluginIcon.trim()
    return trimmed.startsWith('i-') ? trimmed : `i-${trimmed}`
  }

  return ''
})

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

  const metadata = entry.metadata ?? {}
  let icon: string | undefined
  if (typeof metadata.icon_class === 'string' && metadata.icon_class.trim().length > 0) {
    icon = metadata.icon_class.trim()
  } else if (typeof metadata.icon === 'string' && metadata.icon.trim().length > 0) {
    const trimmed = metadata.icon.trim()
    icon = trimmed.startsWith('i-') ? trimmed : `i-${trimmed}`
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
    icon,
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
  if (isPluginInstalling(plugin.id)) return

  const channel = await getRendererChannel()

  if (!channel) {
    await forTouchTip(t('market.installation.failureTitle'), t('market.installation.browserNotSupported'))
    return
  }

  try {
    const payload: Record<string, unknown> = {
      source: plugin.downloadUrl,
      metadata: {
        officialId: plugin.id,
        officialVersion: plugin.version,
        officialSource: 'talex-touch/tuff-official-plugins',
        official: plugin.official === true
      },
      clientMetadata: {
        pluginId: plugin.id,
        pluginName: plugin.name
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
  }
}

function openPluginDetail(plugin: OfficialPluginListItem): void {
  activePlugin.value = plugin
  detailVisible.value = true
}

function closePluginDetail(): void {
  if (!detailVisible.value) return
  detailVisible.value = false
}

function onDetailAfterLeave(): void {
  activePlugin.value = null
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && detailVisible.value) {
    closePluginDetail()
  }
}

watch(
  () => officialPlugins.value,
  () => {
    updateCategoryTags()
  },
  { deep: true }
)

watch(
  () => detailVisible.value,
  (visible) => {
    if (typeof document === 'undefined') return
    const body = document.body
    if (!body) return
    if (visible) {
      body.classList.add('market-detail-open')
    } else {
      body.classList.remove('market-detail-open')
    }
  }
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }

  void loadOfficialPlugins()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }

  if (typeof document !== 'undefined') {
    document.body.classList.remove('market-detail-open')
  }
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

/* Detail Overlay */
.market-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3.5rem;
  pointer-events: none;
}

.market-detail-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.market-detail-shell {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.market-detail-panel {
  position: relative;
  width: min(1100px, calc(100vw - 120px));
  height: min(720px, calc(100vh - 120px));
  background: var(--el-bg-color);
  border-radius: 28px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.12);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2.5rem;
  pointer-events: auto;
  overflow: hidden;
  animation: detail-bounce-in 0.56s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.detail-close {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.25s ease;

  i {
    font-size: 18px;
  }

  &:hover {
    color: var(--el-color-primary);
    border-color: rgba(var(--el-color-primary-rgb), 0.35);
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  }
}

.detail-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1.5rem;
  align-items: center;
}

.detail-icon {
  width: 88px;
  height: 88px;
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(var(--el-color-primary-rgb), 0.2), rgba(var(--el-color-primary-rgb), 0.08));
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.18);
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 40px;
    color: var(--el-color-primary);
  }
}

.detail-heading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;

  h3 {
    margin: 0;
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--el-text-color-primary);
  }
}

.detail-subline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.detail-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  border: 1px solid var(--el-border-color-lighter);

  i {
    font-size: 0.9rem;
  }
}

.official-detail-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  background: rgba(var(--el-color-primary-rgb), 0.16);
  color: var(--el-color-primary);
  font-weight: 600;

  i {
    font-size: 1rem;
  }
}

.detail-description {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  opacity: 0.9;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.detail-install :deep(.FlatButton-Container) {
  min-width: 140px;
  height: 42px;
  border-radius: 14px;
  font-size: 0.95rem;
  gap: 0.45rem;
}

.detail-body {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
  padding-right: 0.5rem;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
}

.detail-meta-item {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 18px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.25);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  }
}

.meta-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(var(--el-color-primary-rgb), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 1.1rem;
    color: var(--el-color-primary);
  }
}

.meta-content {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow: hidden;
}

.meta-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
}

.meta-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.1rem;
  border-radius: 14px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
  font-weight: 500;
  text-decoration: none;
  transition: all 0.25s ease;

  i {
    font-size: 1.05rem;
  }

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.3);
    color: var(--el-color-primary);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  }
}

.market-detail-overlay-enter-active,
.market-detail-overlay-leave-active {
  transition: opacity 0.35s ease;
}

.market-detail-overlay-enter-from,
.market-detail-overlay-leave-to {
  opacity: 0;
}

.market-detail-overlay-leave-active .market-detail-panel {
  animation: detail-bounce-out 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes detail-bounce-in {
  0% {
    transform: scale(0.86) translateY(30px);
    opacity: 0;
  }
  60% {
    transform: scale(1.02) translateY(-6px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes detail-bounce-out {
  0% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
  100% {
    transform: scale(0.94) translateY(24px);
    opacity: 0;
  }
}

:global(body.market-detail-open) {
  overflow: hidden;
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

  .market-detail-overlay {
    padding: 1.5rem;
  }

  .market-detail-panel {
    width: calc(100vw - 32px);
    height: calc(100vh - 32px);
    border-radius: 20px;
    padding: 2rem;
  }

  .detail-header {
    grid-template-columns: 1fr;
    justify-items: flex-start;
  }

  .detail-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
