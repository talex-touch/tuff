<script lang="ts" name="Market" setup>
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { useToggle } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import MarketGridView from '~/components/market/MarketGridView.vue'
import MarketHeader from '~/components/market/MarketHeader.vue'
import { useMarketCategories } from '~/composables/market/useMarketCategories'
import type { OfficialPluginListItem } from '~/composables/market/useMarketData'
import { useMarketData } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import { pluginSettings } from '~/modules/storage/plugin-settings'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'

const { t } = useI18n()
const router = useRouter()

// Market data management
const { officialPlugins, loading, loadOfficialPlugins } = useMarketData()

// Category management
const { tags, tagInd, selectedTag, updateCategoryTags } = useMarketCategories(officialPlugins)

// Installation management
const { handleInstall } = useMarketInstall()

// UI state
const [sourceEditorShow, toggleSourceEditorShow] = useToggle()
const viewType = ref<'grid' | 'list'>('grid')
const searchKey = ref('')
const detailVisible = ref(false)
const activePlugin = ref<OfficialPluginListItem | null>(null)

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
    meta.push({
      icon: 'i-ri-user-line',
      label: t('market.detailDialog.author'),
      value: plugin.author
    })
  }

  if (plugin.version) {
    meta.push({
      icon: 'i-ri-price-tag-3-line',
      label: t('market.detailDialog.version'),
      value: `v${plugin.version}`
    })
  }

  if (detailUpdatedLabel.value) {
    meta.push({
      icon: 'i-ri-time-line',
      label: t('market.detailDialog.updateTime'),
      value: detailUpdatedLabel.value
    })
  }

  meta.push({
    icon: 'i-ri-barcode-line',
    label: t('market.detailDialog.pluginId'),
    value: plugin.id
  })

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

function handleSearch(query: string): void {
  searchKey.value = query
}

async function onInstall(plugin: OfficialPluginListItem): Promise<void> {
  const channel = await getRendererChannel()
  await handleInstall(plugin, channel)
}

function openPluginDetail(plugin: OfficialPluginListItem): void {
  // Navigate to detail page with shared element transition
  router.push(`/market/${plugin.id}`)
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
</script>

<template>
  <div class="market-container">
    <MarketHeader
      v-model:view-type="viewType"
      :loading="loading"
      :sources-count="pluginSettings.source.list.length"
      @refresh="loadOfficialPlugins(true)"
      @open-source-editor="toggleSourceEditorShow()"
      @search="handleSearch"
    />

    <MarketGridView
      :plugins="displayedPlugins"
      :view-type="viewType"
      :loading="loading"
      @install="onInstall"
      @open-detail="openPluginDetail"
    />
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
        <div :key="activePlugin.id" class="market-detail-panel" @click.stop>
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
              <div v-if="activePlugin.version || activePlugin.category" class="detail-subline">
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
              <FlatButton :primary="true" class="detail-install" @click="onInstall(activePlugin)">
                <span>
                  {{ t('market.install') }}
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
                {{ t('market.detailDialog.download') }}
              </a>
              <a
                v-if="activePlugin.readmeUrl"
                class="detail-link"
                :href="activePlugin.readmeUrl"
                target="_blank"
                rel="noopener"
              >
                <i class="i-ri-book-open-line" />
                {{ t('market.detailDialog.viewDocs') }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>

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

/* Detail Overlay (unchanged styles) */
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
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb), 0.2),
    rgba(var(--el-color-primary-rgb), 0.08)
  );
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
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease;

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
</style>
