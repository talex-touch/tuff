<script lang="ts" name="MarketDetail" setup>
/**
 * MarketDetail - Plugin detail page component
 *
 * Displays detailed information about a market plugin including:
 * - Plugin header with icon, name, description, and install button
 * - README content rendered from markdown
 * - Sidebar with plugin metadata
 */
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { hasWindow, isElectronRenderer } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import MarketIcon from '~/components/market/MarketIcon.vue'
import MarketInstallButton from '~/components/market/MarketInstallButton.vue'
import MarketDetailSkeleton from '~/components/market/MarketDetailSkeleton.vue'
import type { MarketPluginListItem } from '~/composables/market/useMarketData'
import { useMarketData } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import { useMarketDetail } from '~/composables/market/useMarketDetail'
import { useMarketRating } from '~/composables/market/useMarketRating'
import { useMarketReadme } from '~/composables/market/useMarketReadme'
import { usePluginVersionStatus } from '~/composables/market/usePluginVersionStatus'
import { forTouchTip } from '~/modules/mention/dialog-mention'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { plugins: officialPlugins, loading, loadMarketPlugins: loadOfficialPlugins } = useMarketData()
const { handleInstall, getInstallTask } = useMarketInstall()

// Plugin version status (for checking installed plugins and upgrade availability)
const { usePluginStatus } = usePluginVersionStatus()

const pluginId = computed(() => route.params.id as string)
const providerId = computed(() => route.query.provider as string | undefined)
const activePlugin = computed<MarketPluginListItem | null>(() => {
  // Match by both id and providerId to distinguish plugins from different sources
  return officialPlugins.value.find((p) =>
    p.id === pluginId.value && (!providerId.value || p.providerId === providerId.value)
  ) || null
})

const notFound = computed(() => !activePlugin.value && officialPlugins.value.length > 0)

/** Plugin version status (installed, upgrade available, etc.) */
const pluginStatus = usePluginStatus(activePlugin)

const { detailMeta } = useMarketDetail(activePlugin, t, pluginStatus)
const readmeUrl = computed(() => activePlugin.value?.readmeUrl)
const { readmeContent, readmeLoading, readmeError } = useMarketReadme(readmeUrl, t)

const canRate = computed(() => {
  return activePlugin.value?.providerId === 'tuff-nexus' && activePlugin.value?.providerType === 'tpexApi'
})

const ratingSlug = computed(() => (canRate.value ? activePlugin.value?.id : undefined))

const {
  loading: ratingLoading,
  submitting: ratingSubmitting,
  error: ratingError,
  average: ratingAverage,
  count: ratingCount,
  userRating,
  submit: submitRating,
} = useMarketRating(ratingSlug)

const ratingErrorText = computed(() => {
  const code = ratingError.value
  if (!code) return null

  if (code === 'NOT_AUTHENTICATED' || code === 'UNAUTHORIZED')
    return t('market.rating.loginRequired', 'Login required to rate this plugin.')

  if (code === 'INVALID_RATING')
    return t('market.rating.invalid', 'Invalid rating value.')

  if (code.startsWith('HTTP_ERROR_'))
    return t('market.rating.httpError', 'Request failed.')

  return code
})

/** Current installation task for this plugin */
const installTask = computed(() =>
  activePlugin.value ? getInstallTask(activePlugin.value.id, activePlugin.value.providerId) : undefined
)

let rendererChannel: ITouchClientChannel | undefined
let channelLoadFailed = false

async function getRendererChannel(): Promise<ITouchClientChannel | undefined> {
  if (rendererChannel) return rendererChannel
  if (channelLoadFailed || !isElectronRenderer()) return undefined

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

async function onInstall(): Promise<void> {
  if (!activePlugin.value) return
  const channel = await getRendererChannel()
  // Check if this is an upgrade
  const isUpgrade = pluginStatus.value.hasUpgrade
  await handleInstall(activePlugin.value, channel, isUpgrade ? { isUpgrade: true, autoReEnable: true } : undefined)
}

async function onRatingChange(value: number): Promise<void> {
  const previous = userRating.value
  await submitRating(value)

  if (ratingError.value === 'NOT_AUTHENTICATED' || ratingError.value === 'UNAUTHORIZED') {
    userRating.value = previous
    await forTouchTip(
      t('market.rating.loginRequiredTitle', 'Login required'),
      t('market.rating.loginRequired', 'Login required to rate this plugin.'),
    )
    return
  }

  if (ratingError.value) {
    userRating.value = previous
    await forTouchTip(
      t('market.rating.submitFailedTitle', 'Rating failed'),
      ratingErrorText.value ?? ratingError.value,
    )
  }
}

function goBack(): void {
  router.push('/market')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') goBack()
}

watch(notFound, (isNotFound) => {
  if (isNotFound) goBack()
})

onMounted(() => {
  if (hasWindow()) {
    window.addEventListener('keydown', handleKeydown)
  }
  void loadOfficialPlugins()
})

onBeforeUnmount(() => {
  if (hasWindow()) {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div flex="~ col" class="h-full overflow-hidden">
    <MarketDetailSkeleton v-if="loading" />

    <div v-else-if="activePlugin" class="h-full flex flex-col gap-4 p-4">
      <div class="detail-header" :class="{ 'official-provider': activePlugin.providerTrustLevel === 'official' }">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <MarketIcon
            v-shared-element:plugin-market-icon
            :item="activePlugin"
            :view-transition-name="`market-icon-${activePlugin.id}`"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 :style="{ viewTransitionName: `market-title-${activePlugin.id}` }">
                {{ activePlugin.name }}
              </h3>
              <i v-if="activePlugin.official" class="i-ri-verified-badge-fill official-badge" title="Official Plugin" />
            </div>
            <p v-if="activePlugin.description" class="text-sm opacity-70 mt-1">
              {{ activePlugin.description }}
            </p>
          </div>
        </div>
        <MarketInstallButton
          :plugin-name="activePlugin.name"
          :is-installed="pluginStatus.isInstalled"
          :has-upgrade="pluginStatus.hasUpgrade"
          :installed-version="pluginStatus.installedVersion"
          :market-version="pluginStatus.marketVersion"
          :install-task="installTask"
          :mini="false"
          @install="onInstall"
        />
      </div>

      <div class="detail-content">
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

        <div class="sidebar">
          <div v-if="canRate" class="sidebar-card">
            <h4>{{ t('market.rating.title', 'Rating') }}</h4>
            <div class="rating-row">
              <el-rate
                v-model="userRating"
                :disabled="ratingSubmitting"
                @change="onRatingChange"
              />
              <span v-if="ratingAverage !== null" class="rating-meta">
                {{ ratingAverage.toFixed(1) }} · {{ ratingCount }}
              </span>
              <span v-else-if="ratingLoading" class="rating-meta">
                {{ t('market.rating.loading', 'Loading...') }}
              </span>
            </div>
            <p v-if="ratingErrorText" class="rating-error">
              {{ ratingErrorText }}
            </p>
          </div>
          <div class="sidebar-card">
            <h4>{{ t('market.detailDialog.information') }}</h4>
            <div class="meta-list">
              <div v-for="meta in detailMeta" :key="meta.label" class="meta-item" :class="meta.highlight && `highlight-${meta.highlight}`">
                <div class="meta-label">
                  <i :class="meta.icon" />
                  <span>{{ meta.label }}</span>
                </div>
                <div class="meta-value" :title="meta.value">{{ meta.value }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--el-bg-color-overlay);
  border-radius: 12px;

  &.official-provider {
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 12px;
      border-style: solid;
      border-image-slice: 1;
      border-image-source: linear-gradient(100deg, #3f5c1e 0%, #4d9375 68%);
      border-width: 6px;
      margin: -5px;
      opacity: 0.5;
      filter: blur(4px);
      mix-blend-mode: hard-light;
      pointer-events: none;
    }
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.official-badge {
  flex-shrink: 0;
  font-size: 1.25rem;
  color: #4d9375;
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
  padding: 1.5rem;
}

.rating-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.rating-meta {
  font-size: 0.85rem;
  opacity: 0.7;
}

.rating-error {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--el-color-danger);
}

.readme-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem;
  opacity: 0.6;

  i {
    font-size: 2rem;
  }

  &.error {
    color: var(--el-color-danger);
    opacity: 1;
  }
}

.readme-content {
  line-height: 1.6;

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 1.5rem 0 0.75rem;
    font-weight: 600;
    &:first-child {
      margin-top: 0;
    }
  }
  :deep(h1) {
    font-size: 2rem;
  }
  :deep(h2) {
    font-size: 1.5rem;
  }
  :deep(h3) {
    font-size: 1.25rem;
  }
  :deep(h4) {
    font-size: 1.1rem;
  }

  :deep(p) {
    margin: 0.75rem 0;
  }

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
    code {
      padding: 0;
      background: none;
    }
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.75rem 0;
    padding-left: 2rem;
  }

  :deep(a) {
    color: var(--el-color-primary);
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
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
  overflow-y: auto;
  max-height: 100%;
}

.sidebar-card {
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
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

    i {
      font-size: 0.85rem;
    }
  }

  .meta-value {
    font-size: 0.9rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.highlight-upgrade {
    .meta-label {
      color: var(--el-color-primary);
      opacity: 1;
    }
    .meta-value {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }

  &.highlight-installed {
    .meta-label {
      color: var(--el-color-success);
      opacity: 0.8;
    }
    .meta-value {
      color: var(--el-color-success);
    }
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
