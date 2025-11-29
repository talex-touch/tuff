<script lang="ts" name="MarketDetail" setup>
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import FlatButton from '~/components/base/button/FlatButton.vue'
import type { OfficialPluginListItem } from '~/composables/market/useMarketData'
import { useMarketData } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { officialPlugins, loading, loadOfficialPlugins } = useMarketData()
const { handleInstall } = useMarketInstall()

const pluginId = computed(() => route.params.id as string)
const activePlugin = computed<OfficialPluginListItem | null>(() => {
  return officialPlugins.value.find((p) => p.id === pluginId.value) || null
})

const notFound = computed(() => !activePlugin.value && officialPlugins.value.length > 0)

// README state
const readmeContent = ref('')
const readmeLoading = ref(false)
const readmeError = ref('')

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
    console.warn('[MarketDetail] Failed to load channel-core module:', error)
    return undefined
  }
}

async function fetchReadme(url: string): Promise<void> {
  if (!url) return

  readmeLoading.value = true
  readmeError.value = ''
  readmeContent.value = ''

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch README: ${response.status}`)
    readmeContent.value = await response.text()
  } catch (error) {
    console.error('[MarketDetail] Failed to load README:', error)
    readmeError.value = t('market.detailDialog.readmeError') || 'Failed to load README'
  } finally {
    readmeLoading.value = false
  }
}

watch(
  () => activePlugin.value?.readmeUrl,
  (newUrl) => {
    if (newUrl) {
      void fetchReadme(newUrl)
    } else {
      readmeContent.value = ''
      readmeError.value = ''
    }
  },
  { immediate: true }
)

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return ''
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(Number(timestamp) || Date.parse(timestamp))
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  } catch {
    return ''
  }
}

const detailMeta = computed(() => {
  const plugin = activePlugin.value
  if (!plugin) return []

  const meta = []
  if (plugin.author) meta.push({ icon: 'i-ri-user-line', label: t('market.detailDialog.author'), value: plugin.author })
  if (plugin.version) meta.push({ icon: 'i-ri-price-tag-3-line', label: t('market.detailDialog.version'), value: `v${plugin.version}` })
  
  const time = formatTimestamp(plugin.timestamp)
  if (time) meta.push({ icon: 'i-ri-time-line', label: t('market.detailDialog.updateTime'), value: time })
  
  meta.push({ icon: 'i-ri-barcode-line', label: t('market.detailDialog.pluginId'), value: plugin.id })
  return meta
})

const detailIconClass = computed(() => {
  const plugin = activePlugin.value
  if (!plugin) return ''

  const metadata = plugin.metadata ?? {}
  const iconClass = metadata?.icon_class?.trim?.()
  if (iconClass) return iconClass

  const metaIcon = metadata?.icon?.trim?.()
  if (metaIcon) return metaIcon.startsWith('i-') ? metaIcon : `i-${metaIcon}`

  const pluginIcon = (plugin as any).icon?.trim?.()
  if (pluginIcon) return pluginIcon.startsWith('i-') ? pluginIcon : `i-${pluginIcon}`

  return ''
})

async function onInstall(): Promise<void> {
  if (!activePlugin.value) return
  const channel = await getRendererChannel()
  await handleInstall(activePlugin.value, channel)
}

function goBack(): void {
  router.push('/market')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') goBack()
}

onMounted(() => {
  window?.addEventListener('keydown', handleKeydown)
  void loadOfficialPlugins()
})

onBeforeUnmount(() => {
  window?.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div flex="~ col" class="h-full overflow-hidden">
    <!-- Loading -->
    <div v-if="loading" class="center-state">
      <i class="i-ri-loader-4-line animate-spin text-4xl text-primary" />
      <p>{{ t('market.loading') }}</p>
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="center-state">
      <i class="i-ri-error-warning-line text-5xl text-warning" />
      <h2>{{ t('market.detailDialog.notFound') }}</h2>
      <p>{{ t('market.detailDialog.notFoundDesc') }}</p>
      <FlatButton :primary="true" @click="goBack">
        <i class="i-ri-arrow-left-line" />
        <span>{{ t('market.detailDialog.backToMarket') }}</span>
      </FlatButton>
    </div>

    <!-- Plugin detail -->
    <div v-else-if="activePlugin" class="h-full flex flex-col gap-4 p-4">
      <!-- Header -->
      <div class="detail-header">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="plugin-icon" :style="{ viewTransitionName: `market-icon-${activePlugin.id}` }">
            <i :class="detailIconClass || 'i-ri-puzzle-line'" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 :style="{ viewTransitionName: `market-title-${activePlugin.id}` }">{{ activePlugin.name }}</h3>
              <i v-if="activePlugin.official" class="i-ri-shield-check-fill text-primary" />
            </div>
            <p v-if="activePlugin.description" class="text-sm opacity-70 mt-1">{{ activePlugin.description }}</p>
          </div>
        </div>
        <FlatButton :primary="true" @click="onInstall">
          <i class="i-ri-download-line" />
          <span>{{ t('market.install') }}</span>
        </FlatButton>
      </div>

      <!-- Content -->
      <div class="detail-content">
        <!-- README -->
        <div class="readme-section">
          <div v-if="readmeLoading" class="readme-state">
            <i class="i-ri-loader-4-line animate-spin" />
            <span>Loading README...</span>
          </div>
          <div v-else-if="readmeError" class="readme-state error">
            <i class="i-ri-error-warning-line" />
            <span>{{ readmeError }}</span>
          </div>
          <div v-else-if="readmeContent" class="readme-content" v-html="readmeContent" />
          <div v-else class="readme-state">
            <i class="i-ri-file-text-line" />
            <span>No README</span>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="sidebar">
          <div class="sidebar-card">
            <h4>{{ t('market.detailDialog.information') }}</h4>
            <div class="meta-list">
              <div v-for="meta in detailMeta" :key="meta.label" class="meta-item">
                <div class="meta-label">
                  <i :class="meta.icon" />
                  <span>{{ meta.label }}</span>
                </div>
                <div class="meta-value" :title="meta.value">{{ meta.value }}</div>
              </div>
            </div>
          </div>

          <a v-if="activePlugin.downloadUrl" :href="activePlugin.downloadUrl" class="download-btn" target="_blank">
            <i class="i-ri-download-cloud-2-line" />
            <span>{{ t('market.detailDialog.download') }}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  text-align: center;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    opacity: 0.7;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.plugin-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(var(--el-color-primary-rgb), 0.2), rgba(var(--el-color-primary-rgb), 0.08));
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.18);
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 24px;
    color: var(--el-color-primary);
  }
}

.detail-content {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.readme-section {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 1.5rem;
}

.readme-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem;
  opacity: 0.6;

  i { font-size: 2rem; }
  
  &.error {
    color: var(--el-color-danger);
    opacity: 1;
  }
}

.readme-content {
  line-height: 1.6;

  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 1.5rem 0 0.75rem;
    font-weight: 600;
    &:first-child { margin-top: 0; }
  }
  :deep(h1) { font-size: 2rem; }
  :deep(h2) { font-size: 1.5rem; }
  :deep(h3) { font-size: 1.25rem; }
  :deep(h4) { font-size: 1.1rem; }

  :deep(p) { margin: 0.75rem 0; }

  :deep(code) {
    padding: 0.2rem 0.4rem;
    background: var(--el-fill-color-light);
    border-radius: 4px;
    font-size: 0.9em;
  }

  :deep(pre) {
    padding: 1rem;
    background: var(--el-fill-color-light);
    border-radius: 8px;
    overflow-x: auto;
    margin: 1rem 0;
    code { padding: 0; background: none; }
  }

  :deep(ul), :deep(ol) {
    margin: 0.75rem 0;
    padding-left: 2rem;
  }

  :deep(a) {
    color: var(--el-color-primary);
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
    margin: 1rem 0;
  }
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sidebar-card {
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 1rem;

  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meta-item {
  .meta-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    margin-bottom: 0.25rem;

    i { font-size: 0.85rem; }
  }

  .meta-value {
    font-size: 0.9rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--el-color-primary);
  color: white;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;

  &:hover {
    background: var(--el-color-primary-dark-2);
    box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

