<script lang="ts" name="StoreDetail" setup>
import type { PluginContentPackage } from '@talex-touch/utils/types/cloud-share'
import type { StorePluginListItem } from '~/composables/store/useStoreData'
/**
 * StoreDetail - Plugin detail page component
 *
 * Displays detailed information about a store plugin including:
 * - README content rendered from markdown
 * - Sidebar with plugin metadata
 */
import {
  SharedPluginDetailMetaList,
  SharedPluginDetailReadme,
  useAppSdk
} from '@talex-touch/utils/renderer'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRating } from '@talex-touch/tuffex/rating'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StoreDetailSkeleton from '~/components/store/StoreDetailSkeleton.vue'
import { resolvePluginContentErrorReason } from '~/composables/store/plugin-content-error-utils'
import { usePluginContentPackages } from '~/composables/store/usePluginContentPackages'
import { useStoreData } from '~/composables/store/useStoreData'
import { useStoreDetail } from '~/composables/store/useStoreDetail'
import { resolveStoreRatingErrorMessage } from '~/composables/store/store-rating-error-utils'
import { useStoreRating } from '~/composables/store/useStoreRating'
import { useStoreReadme } from '~/composables/store/useStoreReadme'
import { usePluginVersionStatus } from '~/composables/store/usePluginVersionStatus'
import { useStoreInstall } from '~/composables/store/useStoreInstall'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
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
const { isLoggedIn } = useAuth()
const appSdk = useAppSdk()

const { plugins: storePlugins, loading, loadStorePlugins } = useStoreData()

// Plugin version status (for checking installed plugins and upgrade availability)
const { usePluginStatus } = usePluginVersionStatus()
const { handleInstall } = useStoreInstall()

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
const contentPluginId = computed(() => activePlugin.value?.id ?? null)
const {
  packages: contentPackages,
  loading: contentLoading,
  error: contentError,
  installingPackageId,
  installError,
  load: loadContentPackages,
  installPackage
} = usePluginContentPackages(contentPluginId)

const canRate = computed(() => {
  return (
    activePlugin.value?.providerId === 'tuff-nexus' &&
    activePlugin.value?.providerType === 'tpexApi'
  )
})

const ratingSlug = computed(() => (canRate.value ? activePlugin.value?.id : undefined))
const canSubmitRating = computed(() => canRate.value && isLoggedIn.value)

type SidebarAction = {
  key: string
  label: string
  icon: string
  url: string
}

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
  return resolveStoreRatingErrorMessage(ratingError.value, t)
})

const contentErrorText = computed(() => {
  return contentError.value ? resolvePluginContentErrorReason(contentError.value, t) : null
})

const installErrorText = computed(() => {
  return installError.value ? resolvePluginContentErrorReason(installError.value, t) : null
})

function readRecordValue(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!record) return undefined

  for (const key of keys) {
    const value = record[key]
    if (value) return value
  }

  return undefined
}

function normalizeUrlCandidate(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return normalizeUrlCandidate((value as Record<string, unknown>).url)
  }

  if (typeof value !== 'string') return ''

  const raw = value.trim()
  if (!raw) return ''

  if (raw.startsWith('git+https://')) {
    return raw.slice(4)
  }

  const sshGithubMatch = raw.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i)
  if (sshGithubMatch?.[1]) {
    return `https://github.com/${sshGithubMatch[1]}`
  }

  return raw
}

function isRepositoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return ['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com'].includes(hostname)
  } catch {
    return false
  }
}

function buildNexusStoreUrl(tab?: 'versions' | 'reviews'): string {
  const pluginId = activePlugin.value?.id
  if (!pluginId) return ''

  const baseUrl = getAuthBaseUrl().replace(/\/$/, '')
  const url = new URL('/store', `${baseUrl}/`)
  url.searchParams.set('plugin', pluginId)
  if (tab) {
    url.searchParams.set('tab', tab)
  }
  return url.toString()
}

const publishPageUrl = computed(() => (canRate.value ? buildNexusStoreUrl() : ''))
const versionsPageUrl = computed(() => (canRate.value ? buildNexusStoreUrl('versions') : ''))
const reviewsPageUrl = computed(() => (canRate.value ? buildNexusStoreUrl('reviews') : ''))
const repositoryUrl = computed(() => {
  const plugin = activePlugin.value
  const candidates = [
    readRecordValue(plugin?.metadata, 'repository', 'repo', 'repositoryUrl', 'sourceUrl'),
    plugin?.install?.type === 'git' ? plugin.install.repo : undefined
  ]

  return candidates.map(normalizeUrlCandidate).find((url) => url && isRepositoryUrl(url)) ?? ''
})

const sidebarActions = computed<SidebarAction[]>(
  () =>
    [
      publishPageUrl.value
        ? {
            key: 'publish',
            label: t('store.detailDialog.openPublishPage'),
            icon: 'i-carbon-launch',
            url: publishPageUrl.value
          }
        : null,
      repositoryUrl.value
        ? {
            key: 'repository',
            label: t('store.detailDialog.openRepository'),
            icon: 'i-carbon-data-share',
            url: repositoryUrl.value
          }
        : null,
      versionsPageUrl.value
        ? {
            key: 'versions',
            label: t('store.detailDialog.viewVersions'),
            icon: 'i-carbon-time',
            url: versionsPageUrl.value
          }
        : null,
      reviewsPageUrl.value
        ? {
            key: 'reviews',
            label: t('store.detailDialog.viewReviews'),
            icon: 'i-carbon-chat',
            url: reviewsPageUrl.value
          }
        : null
    ].filter(Boolean) as SidebarAction[]
)

function openSidebarAction(url: string): void {
  void appSdk.openExternal(url)
}

function formatContentPackageDate(value: string | null | undefined): string {
  if (!value) return t('store.detailDialog.contentUnknownDate')

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('store.detailDialog.contentUnknownDate')

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(date)
}

async function onInstallActivePlugin(): Promise<void> {
  if (!activePlugin.value) return
  await handleInstall(
    activePlugin.value,
    pluginStatus.value.hasUpgrade ? { isUpgrade: true, autoReEnable: true } : undefined
  )
}

async function onInstallContentPackage(contentPackage: PluginContentPackage): Promise<void> {
  const result = await installPackage(contentPackage)
  if (result.success) {
    await forTouchTip(
      t('store.detailDialog.contentInstallSuccessTitle'),
      t('store.detailDialog.contentInstallSuccessMessage', {
        title: contentPackage.title,
        count: result.importedCount ?? 0
      })
    )
    return
  }

  await forTouchTip(
    t('store.detailDialog.contentInstallFailedTitle'),
    resolvePluginContentErrorReason(result.error, t)
  )
}

async function onRatingChange(value: number): Promise<void> {
  if (!canSubmitRating.value) {
    return
  }

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

          <section class="content-section">
            <div class="content-section-header">
              <div>
                <h3>{{ t('store.detailDialog.contentTitle') }}</h3>
                <p>{{ t('store.detailDialog.contentSubtitle') }}</p>
              </div>
              <TxButton
                variant="flat"
                size="sm"
                :loading="contentLoading"
                @click="loadContentPackages"
              >
                <i class="i-ri-refresh-line" />
                {{ t('store.detailDialog.contentRefresh') }}
              </TxButton>
            </div>

            <div v-if="contentLoading && contentPackages.length === 0" class="content-state">
              <i class="i-ri-loader-4-line animate-spin" />
              <span>{{ t('store.detailDialog.contentLoading') }}</span>
            </div>
            <div v-else-if="contentErrorText" class="content-state error">
              <i class="i-ri-error-warning-line" />
              <span>{{ contentErrorText }}</span>
            </div>
            <div v-else-if="contentPackages.length === 0" class="content-state">
              <i class="i-ri-inbox-line" />
              <span>{{ t('store.detailDialog.contentEmpty') }}</span>
            </div>

            <div v-else class="content-package-list">
              <article
                v-for="contentPackage in contentPackages"
                :key="contentPackage.id"
                class="content-package"
              >
                <div class="content-package-main">
                  <div class="content-package-title-row">
                    <h4>{{ contentPackage.title }}</h4>
                    <span class="content-package-kind">
                      {{ contentPackage.kind }}
                    </span>
                  </div>
                  <p v-if="contentPackage.summary" class="content-package-summary">
                    {{ contentPackage.summary }}
                  </p>
                  <div class="content-package-meta">
                    <span>{{ contentPackage.manifest.format }}</span>
                    <span>
                      {{
                        t('store.detailDialog.contentInstalls', {
                          count: contentPackage.installCount
                        })
                      }}
                    </span>
                    <span>
                      {{
                        t('store.detailDialog.contentUpdatedAt', {
                          date: formatContentPackageDate(contentPackage.updatedAt)
                        })
                      }}
                    </span>
                  </div>
                </div>

                <div class="content-package-actions">
                  <TxButton
                    v-if="!pluginStatus.isInstalled"
                    variant="flat"
                    size="sm"
                    @click="onInstallActivePlugin"
                  >
                    <i class="i-ri-plug-line" />
                    {{ t('store.detailDialog.contentInstallPluginFirst') }}
                  </TxButton>
                  <TxButton
                    v-else
                    variant="flat"
                    type="primary"
                    size="sm"
                    :loading="installingPackageId === contentPackage.id"
                    :disabled="Boolean(installingPackageId)"
                    @click="onInstallContentPackage(contentPackage)"
                  >
                    <i class="i-ri-download-cloud-2-line" />
                    {{
                      installingPackageId === contentPackage.id
                        ? t('store.detailDialog.contentInstalling')
                        : t('store.detailDialog.contentInstall')
                    }}
                  </TxButton>
                </div>
              </article>
            </div>

            <p v-if="installErrorText" class="content-install-error">
              {{ installErrorText }}
            </p>
          </section>
        </div>

        <div class="sidebar">
          <div v-if="canRate" class="sidebar-card">
            <h4>{{ t('store.rating.title') }}</h4>
            <div class="rating-row">
              <TxRating
                v-model="userRating"
                :disabled="ratingSubmitting || !canSubmitRating"
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
            <p v-else-if="!isLoggedIn" class="rating-error">
              {{ t('store.rating.loginRequired') }}
            </p>
          </div>
          <SharedPluginDetailMetaList
            v-if="detailMeta.length"
            :items="detailMeta"
            :title="t('store.detailDialog.information')"
          />
          <div v-if="sidebarActions.length" class="sidebar-actions">
            <h4>{{ t('store.detailDialog.actions') }}</h4>
            <button
              v-for="action in sidebarActions"
              :key="action.key"
              class="sidebar-action"
              type="button"
              @click="openSidebarAction(action.url)"
            >
              <i :class="action.icon" aria-hidden="true" />
              <span>{{ action.label }}</span>
            </button>
            <span
              class="sidebar-action-icon-seed i-carbon-launch i-carbon-data-share i-carbon-time i-carbon-chat"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.readme-section {
  flex: 1;
  min-width: 0;
  background: var(--tx-bg-color-overlay);
  border-radius: 12px;
  padding: 1.5rem;
  color: var(--tx-text-color-regular);
}

.rating-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  min-height: 30px;
}

.rating-meta {
  font-size: 0.78rem;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
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
  color: var(--tx-text-color-regular);

  :deep(.prose),
  :deep(.prose-sm),
  :deep(div) {
    color: inherit;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 1.5rem 0 0.75rem;
    font-weight: 600;
    color: var(--tx-text-color-primary);
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
    color: var(--tx-text-color-regular);
  }

  :deep(li) {
    color: var(--tx-text-color-regular);
  }

  :deep(strong) {
    color: var(--tx-text-color-primary);
  }

  :deep(ul),
  :deep(ol) {
    color: var(--tx-text-color-regular);
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

.content-section {
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.content-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    color: var(--tx-text-color-primary);
  }

  p {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--tx-text-color-secondary);
  }
}

.content-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 88px;
  border: 1px dashed var(--tx-border-color);
  border-radius: 8px;
  color: var(--tx-text-color-secondary);
  font-size: 0.9rem;

  i {
    font-size: 1.1rem;
  }

  &.error {
    color: var(--tx-color-danger);
    border-color: color-mix(in srgb, var(--tx-color-danger) 40%, transparent);
  }
}

.content-package-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.content-package {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  background: var(--tx-fill-color-extra-light);
}

.content-package-main {
  flex: 1;
  min-width: 0;
}

.content-package-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  h4 {
    margin: 0;
    overflow: hidden;
    color: var(--tx-text-color-primary);
    font-size: 0.95rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.content-package-kind {
  flex-shrink: 0;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 0.72rem;
}

.content-package-summary {
  margin: 0.4rem 0 0;
  color: var(--tx-text-color-regular);
  font-size: 0.86rem;
  line-height: 1.45;
}

.content-package-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
  margin-top: 0.55rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
}

.content-package-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.content-install-error {
  margin: 0.75rem 0 0;
  color: var(--tx-color-danger);
  font-size: 0.85rem;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: sticky;
  top: 0;
  max-height: 100%;
  overflow-y: auto;
  padding: 0.15rem 0.15rem 0.15rem 0.65rem;
  border-left: 1px solid var(--tx-border-color-lighter);
}

.sidebar-card {
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--tx-border-color-lighter);

  h4 {
    margin: 0 0 0.35rem;
    color: var(--tx-text-color-secondary);
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.25;
  }
}

.sidebar-card :deep(.tx-rating) {
  transform: scale(0.82);
  transform-origin: left center;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--tx-border-color-lighter);

  h4 {
    margin: 0 0 0.3rem;
    color: var(--tx-text-color-secondary);
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.25;
  }
}

.sidebar-action {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 24px;
  padding: 0.1rem 0;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-regular);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: left;

  i {
    color: var(--tx-text-color-secondary);
    font-size: 0.82rem;
  }

  span {
    overflow: hidden;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
    text-underline-offset: 3px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    color: var(--tx-color-primary);

    i {
      color: currentColor;
    }

    span {
      text-decoration-color: currentColor;
    }
  }
}

.sidebar-action-icon-seed {
  display: none;
}

@media (max-width: 900px) {
  .detail-content {
    flex-direction: column;
  }

  .sidebar {
    position: static;
    width: 100%;
    max-height: none;
    padding: 0;
    border-left: 0;
    border-top: 1px solid var(--tx-border-color-lighter);
    padding-top: 1rem;
  }

  .content-package {
    align-items: flex-start;
    flex-direction: column;
  }

  .content-package-actions {
    width: 100%;
    justify-content: flex-end;
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
