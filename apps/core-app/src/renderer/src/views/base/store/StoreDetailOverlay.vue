<script lang="ts" name="StoreDetail" setup>
import type { StorePluginListItem } from '~/composables/store/useStoreData'
/**
 * StoreDetail - Plugin detail page component
 *
 * Displays detailed information about a store plugin including:
 * - README content rendered from markdown
 * - Sidebar with plugin metadata
 */
import { SharedPluginDetailMetaList, SharedPluginDetailReadme } from '@talex-touch/utils/renderer'
import { TxRating } from '@talex-touch/tuffex'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StoreDetailSkeleton from '~/components/store/StoreDetailSkeleton.vue'
import { useStoreData } from '~/composables/store/useStoreData'
import { useStoreDetail } from '~/composables/store/useStoreDetail'
import { useStoreRating } from '~/composables/store/useStoreRating'
import { useStoreReadme } from '~/composables/store/useStoreReadme'
import { usePluginVersionStatus } from '~/composables/store/usePluginVersionStatus'
import { forTouchTip } from '~/modules/mention/dialog-mention'

const props = withDefaults(
  defineProps<{
    pluginId: string | null
    providerId?: string | null
  }>(),
  {
    providerId: null
  }
)

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const { plugins: storePlugins, loading, loadStorePlugins } = useStoreData()

// Plugin version status (for checking installed plugins and upgrade availability)
const { usePluginStatus } = usePluginVersionStatus()

const activePlugin = computed<StorePluginListItem | null>(() => {
  // Match by both id and providerId to distinguish plugins from different sources
  return (
    storePlugins.value.find(
      (p) => p.id === props.pluginId && (!props.providerId || p.providerId === props.providerId)
    ) || null
  )
})

const notFound = computed(
  () => Boolean(props.pluginId) && !activePlugin.value && storePlugins.value.length > 0
)

/** Plugin version status (installed, upgrade available, etc.) */
const pluginStatus = usePluginStatus(activePlugin)

const { detailMeta } = useStoreDetail(activePlugin, t, pluginStatus)
const readmeUrl = computed(() => activePlugin.value?.readmeUrl)
const { readmeMarkdown, readmeLoading, readmeError } = useStoreReadme(readmeUrl, t)

const canRate = computed(() => {
  return (
    activePlugin.value?.providerId === 'tuff-nexus' &&
    activePlugin.value?.providerType === 'tpexApi'
  )
})

const ratingSlug = computed(() => (canRate.value ? activePlugin.value?.id : undefined))

const {
  loading: ratingLoading,
  submitting: ratingSubmitting,
  error: ratingError,
  average: ratingAverage,
  count: ratingCount,
  userRating,
  submit: submitRating
} = useStoreRating(ratingSlug)

const ratingErrorText = computed(() => {
  const code = ratingError.value
  if (!code) return null

  if (code === 'NOT_AUTHENTICATED' || code === 'UNAUTHORIZED')
    return t('store.rating.loginRequired')

  if (code === 'INVALID_RATING') return t('store.rating.invalid')

  if (code.startsWith('HTTP_ERROR_')) return t('store.rating.httpError')

  return code
})

async function onRatingChange(value: number): Promise<void> {
  const previous = userRating.value
  await submitRating(value)

  if (ratingError.value === 'NOT_AUTHENTICATED' || ratingError.value === 'UNAUTHORIZED') {
    userRating.value = previous
    await forTouchTip(t('store.rating.loginRequiredTitle'), t('store.rating.loginRequired'))
    return
  }

  if (ratingError.value) {
    userRating.value = previous
    await forTouchTip(
      t('store.rating.submitFailedTitle'),
      ratingErrorText.value ?? ratingError.value
    )
  }
}

watch(notFound, (isNotFound) => {
  if (isNotFound) {
    emit('close')
  }
})

onMounted(() => {
  void loadStorePlugins()
})
</script>

<template>
  <div flex="~ col" class="h-full overflow-hidden">
    <StoreDetailSkeleton v-if="loading" />

    <div v-else-if="activePlugin" class="h-full flex flex-col p-4">
      <div class="detail-content">
        <div class="readme-section">
          <div v-if="readmeLoading" class="readme-state">
            <i class="i-ri-loader-4-line animate-spin" />
            <span>{{ t('store.detailDialog.readmeLoading') }}</span>
          </div>
          <div v-else-if="readmeError" class="readme-state error">
            <i class="i-ri-error-warning-line" />
            <span>{{ readmeError }}</span>
          </div>
          <SharedPluginDetailReadme
            v-else
            :readme="{ markdown: readmeMarkdown }"
            title=""
            :empty-text="t('store.detailDialog.readmeEmpty')"
            content-class="readme-content"
          />
        </div>

        <div class="sidebar">
          <div v-if="canRate" class="sidebar-card">
            <h4>{{ t('store.rating.title') }}</h4>
            <div class="rating-row">
              <TxRating
                v-model="userRating"
                :disabled="ratingSubmitting"
                @change="onRatingChange"
              />
              <span v-if="ratingAverage !== null" class="rating-meta">
                {{ ratingAverage.toFixed(1) }} · {{ ratingCount }}
              </span>
              <span v-else-if="ratingLoading" class="rating-meta">
                {{ t('store.rating.loading') }}
              </span>
            </div>
            <p v-if="ratingErrorText" class="rating-error">
              {{ ratingErrorText }}
            </p>
          </div>
          <SharedPluginDetailMetaList
            v-if="detailMeta.length"
            :items="detailMeta"
            :title="t('store.detailDialog.information')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-content {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.readme-section {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: var(--tx-bg-color-overlay);
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
  color: var(--tx-color-danger);
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
    color: var(--tx-color-danger);
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
    background: var(--tx-fill-color-light);
    border-radius: 4px;
    font-size: 0.9em;
  }

  :deep(pre) {
    padding: 1rem;
    background: var(--tx-fill-color-light);
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
    color: var(--tx-color-primary);
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
  background: var(--tx-bg-color-overlay);
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
      color: var(--tx-color-primary);
      opacity: 1;
    }
    .meta-value {
      color: var(--tx-color-primary);
      font-weight: 600;
    }
  }

  &.highlight-installed {
    .meta-label {
      color: var(--tx-color-success);
      opacity: 0.8;
    }
    .meta-value {
      color: var(--tx-color-success);
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
