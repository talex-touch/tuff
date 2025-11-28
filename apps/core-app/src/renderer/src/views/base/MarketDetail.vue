<script lang="ts" name="MarketDetail" setup>
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
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
    console.warn('[MarketDetail] Failed to format detail timestamp', error)
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

async function onInstall(): Promise<void> {
  if (!activePlugin.value) return
  const channel = await getRendererChannel()
  await handleInstall(activePlugin.value, channel)
}

function goBack(): void {
  router.push('/market')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    goBack()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }

  // Load plugins if not already loaded
  void loadOfficialPlugins()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div flex="~ col" class="h-full overflow-hidden">
    <!-- Loading state -->
    <div v-if="loading" class="detail-loading">
      <div class="loading-spinner">
        <i class="i-ri-loader-4-line animate-spin" />
      </div>
      <p>{{ t('market.loading') || 'Loading plugin details...' }}</p>
    </div>

    <!-- Not found state -->
    <div v-else-if="notFound" class="detail-not-found">
      <div class="not-found-icon">
        <i class="i-ri-error-warning-line" />
      </div>
      <h2>{{ t('market.detailDialog.notFound') || 'Plugin Not Found' }}</h2>
      <p>
        {{ t('market.detailDialog.notFoundDesc') || 'The requested plugin could not be found.' }}
      </p>
      <FlatButton :primary="true" @click="goBack">
        <i class="i-ri-arrow-left-line" />
        <span>{{ t('market.detailDialog.backToMarket') || 'Back to Market' }}</span>
      </FlatButton>
    </div>

    <!-- Plugin detail view -->
    <div v-else-if="activePlugin" class="h-full">
      <div class="detail-content">
        <div class="detail-header">
          <div
            class="detail-icon"
            :style="{ viewTransitionName: `market-icon-${activePlugin.id}` }"
          >
            <i v-if="detailIconClass" :class="detailIconClass" />
            <i v-else class="i-ri-puzzle-line" />
          </div>

          <div class="detail-heading">
            <div class="detail-title-row">
              <h3 :style="{ viewTransitionName: `market-title-${activePlugin.id}` }">
                {{ activePlugin.name }}
              </h3>
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
            <p
              v-if="activePlugin.description"
              class="detail-description"
              :style="{ viewTransitionName: `market-description-${activePlugin.id}` }"
            >
              {{ activePlugin.description }}
            </p>
          </div>

          <div class="detail-actions">
            <FlatButton :primary="true" class="detail-install" @click="onInstall">
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
</template>

<style lang="scss" scoped>
.detail-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  color: var(--el-text-color-secondary);

  .loading-spinner {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--el-fill-color-light);
    display: flex;
    align-items: center;
    justify-content: center;

    i {
      font-size: 2rem;
      color: var(--el-color-primary);
    }
  }

  p {
    margin: 0;
    font-size: 0.95rem;
  }
}

.detail-not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1.5rem;
  text-align: center;

  .not-found-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--el-fill-color-light);
    display: flex;
    align-items: center;
    justify-content: center;

    i {
      font-size: 2.5rem;
      color: var(--el-color-warning);
    }
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    color: var(--el-text-color-regular);
    max-width: 400px;
  }
}

.detail-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
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
