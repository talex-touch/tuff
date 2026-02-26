<script setup lang="ts">
import type { SharedPluginDetail } from '@talex-touch/utils/renderer/shared/plugin-detail'
import type {
  FilterCategory,
  StorePluginDetail,
  StorePluginRatingResponse,
  StorePluginRatingSummary,
  StorePluginReview,
  StorePluginReviewListResponse,
  StorePluginReviewSubmitResponse,
  StorePluginSummary,
} from '~/types/store'
import { TxButton, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import {
  SharedPluginDetailReadme,
  SharedPluginDetailVersions,
} from '@talex-touch/utils/renderer/shared/components'
import { computed, reactive, ref, watch } from 'vue'
import PluginMetaHeader from '~/components/dashboard/PluginMetaHeader.vue'
import StoreItem from '~/components/store/StoreItem.vue'
import StoreSearch from '~/components/store/StoreSearch.vue'
import Input from '~/components/ui/Input.vue'
import Tag from '~/components/ui/Tag.vue'
import { useStoreCategories } from '~/composables/useStoreCategories'
import { useStoreFormatters } from '~/composables/useStoreFormatters'
import { useToast } from '~/composables/useToast'

definePageMeta({
  layout: 'store',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { user, status, isAuthenticated } = useAuthUser()
const isLoaded = computed(() => status.value !== 'loading')
const isLoggedIn = computed(() => isLoaded.value && isAuthenticated.value && Boolean(user.value))

const filters = reactive({
  search: '',
  category: 'all' as FilterCategory,
})

const searchQuery = computed(() => {
  const value = route.query.query
  if (Array.isArray(value))
    return value[0] ?? ''
  if (typeof value === 'string')
    return value
  return ''
})

watch(searchQuery, (value) => {
  if (value !== filters.search)
    filters.search = value
}, { immediate: true })

const selectedSlug = ref<string | null>(null)
const selectedPlugin = ref<StorePluginDetail | null>(null)
const detailOverlaySource = ref<HTMLElement | null>(null)
const detailPending = ref(false)
const detailError = ref<string | null>(null)
const detailTab = ref<'overview' | 'versions' | 'reviews'>('overview')
const reviews = ref<StorePluginReview[]>([])
const reviewsPending = ref(false)
const reviewsError = ref<string | null>(null)
const reviewsMeta = reactive({
  total: 0,
  limit: 20,
  offset: 0,
})
const reviewsLoadingMore = ref(false)
const canLoadMoreReviews = computed(() => reviews.value.length < reviewsMeta.total)
const reviewSubmitting = ref(false)
const ratingSummary = ref<StorePluginRatingSummary | null>(null)
const reviewForm = reactive({
  rating: 0,
  title: '',
  content: '',
})

const handleSignIn = () => navigateTo('/sign-in')

const {
  data: pluginsPayload,
  pending: pluginsPending,
} = await useAsyncData('store-plugins', () =>
  $fetch<{ plugins: StorePluginSummary[] }>('/api/store/plugins', {
    query: { compact: 1 },
  }))

const { resolveCategoryLabel, matchesCategory } = useStoreCategories()
const { formatDate, formatInstalls, formatPackageSize } = useStoreFormatters()

const allPlugins = computed(() => (pluginsPayload.value?.plugins ?? []).filter(plugin => plugin.latestVersion))

const totalPlugins = computed(() => allPlugins.value.length)

const normalizedSearch = computed(() => filters.search.trim().toLowerCase())
const ratingAverageText = computed(() => (ratingSummary.value ? ratingSummary.value.average.toFixed(1) : '0.0'))
const ratingCount = computed(() => ratingSummary.value?.count ?? 0)
const ratingValue = computed(() => Math.round(ratingSummary.value?.average ?? 0))

const sharedDetail = computed<SharedPluginDetail | null>(() => {
  const plugin = selectedPlugin.value
  if (!plugin)
    return null

  return {
    id: plugin.id,
    name: plugin.name,
    summary: plugin.summary,
    author: plugin.author ? { name: plugin.author.name, avatarColor: plugin.author.avatarColor } : undefined,
    category: {
      id: plugin.category,
      label: resolveCategoryLabel(plugin.category),
    },
    badges: plugin.badges,
    installs: plugin.installs,
    official: plugin.isOfficial,
    trustLevel: plugin.isOfficial ? 'official' : undefined,
    iconUrl: plugin.iconUrl ?? null,
    latestVersion: plugin.latestVersion ? { ...plugin.latestVersion } : undefined,
    versions: plugin.versions?.map(version => ({ ...version })) ?? [],
    readme: {
      markdown: plugin.readmeMarkdown ?? plugin.latestVersion?.readmeMarkdown ?? null,
    },
  }
})

function resetReviewState() {
  reviews.value = []
  reviewsError.value = null
  reviewsPending.value = false
  reviewSubmitting.value = false
  ratingSummary.value = null
  reviewForm.rating = 0
  reviewForm.title = ''
  reviewForm.content = ''
}

function resolveStarClass(value: number, rating: number) {
  return value <= rating
    ? 'i-carbon-star-filled text-amber-500'
    : 'i-carbon-star StoreDetailStarEmpty'
}

async function loadPluginCommunity(slug: string) {
  reviewsPending.value = true
  reviewsError.value = null
  try {
    const [reviewsResponse, ratingResponse] = await Promise.all([
      $fetch<StorePluginReviewListResponse>(`/api/store/plugins/${slug}/reviews`, {
        query: {
          limit: reviewsMeta.limit,
          offset: 0,
        },
      }),
      $fetch<StorePluginRatingResponse>(`/api/store/plugins/${slug}/rating`),
    ])
    reviews.value = reviewsResponse.reviews ?? []
    reviewsMeta.total = reviewsResponse.total ?? 0
    reviewsMeta.limit = reviewsResponse.limit ?? reviewsMeta.limit
    reviewsMeta.offset = reviewsResponse.offset ?? 0
    ratingSummary.value = ratingResponse.rating
  }
  catch (error: unknown) {
    reviewsError.value = error instanceof Error ? error.message : t('store.detail.reviews.error', 'Unable to load reviews.')
  }
  finally {
    reviewsPending.value = false
  }
}

async function loadMoreReviews() {
  if (!selectedSlug.value || reviewsLoadingMore.value || reviewsPending.value || !canLoadMoreReviews.value)
    return

  reviewsLoadingMore.value = true
  try {
    const response = await $fetch<StorePluginReviewListResponse>(`/api/store/plugins/${selectedSlug.value}/reviews`, {
      query: {
        limit: reviewsMeta.limit,
        offset: reviews.value.length,
      },
    })
    reviews.value = [...reviews.value, ...(response.reviews ?? [])]
    reviewsMeta.total = response.total ?? reviewsMeta.total
    reviewsMeta.limit = response.limit ?? reviewsMeta.limit
    reviewsMeta.offset = response.offset ?? reviewsMeta.offset
  }
  catch (error: unknown) {
    const fallback = t('store.detail.reviews.loadMoreFailed', 'Failed to load more reviews.')
    toast.warning(error instanceof Error ? error.message : fallback)
  }
  finally {
    reviewsLoadingMore.value = false
  }
}

async function submitReview() {
  if (!selectedSlug.value)
    return

  if (!isLoggedIn.value) {
    toast.warning(t('store.detail.reviews.signInHint', 'Sign in to submit your review.'))
    return
  }

  if (reviewForm.rating < 1 || reviewForm.rating > 5) {
    toast.warning(t('store.detail.reviews.ratingRequired', 'Please provide a rating.'))
    return
  }

  const content = reviewForm.content.trim()
  if (!content) {
    toast.warning(t('store.detail.reviews.contentRequired', 'Please write your review.'))
    return
  }

  reviewSubmitting.value = true
  try {
    const response = await $fetch<StorePluginReviewSubmitResponse>(
      `/api/store/plugins/${selectedSlug.value}/reviews`,
      {
        method: 'POST',
        body: {
          rating: reviewForm.rating,
          title: reviewForm.title.trim() || undefined,
          content,
        },
      },
    )

    ratingSummary.value = response.rating
    const index = reviews.value.findIndex(item => item.id === response.review.id)
    if (index >= 0)
      reviews.value[index] = response.review
    else
      reviews.value.unshift(response.review)

    reviewForm.title = ''
    reviewForm.content = ''
    toast.success(t('store.detail.reviews.submitSuccess', 'Review submitted.'))
  }
  catch (error: unknown) {
    const fallback = t('store.detail.reviews.submitFailed', 'Failed to submit review.')
    const message = error instanceof Error ? error.message : fallback
    toast.error(fallback, message)
  }
  finally {
    reviewSubmitting.value = false
  }
}

async function openPluginDetail(plugin: StorePluginSummary, source: HTMLElement | null = null) {
  selectedSlug.value = plugin.slug
  detailOverlaySource.value = source
  selectedPlugin.value = null
  detailPending.value = true
  detailError.value = null
  detailTab.value = 'overview'
  resetReviewState()
  try {
    const response = await $fetch<{ plugin: StorePluginDetail }>(`/api/store/plugins/${plugin.slug}`)
    selectedPlugin.value = response.plugin
    void loadPluginCommunity(plugin.slug)
  }
  catch (error: unknown) {
    detailError.value = error instanceof Error ? error.message : t('store.detail.error', 'Unable to load plugin details.')
  }
  finally {
    detailPending.value = false
  }
}

function closePluginDetail() {
  selectedSlug.value = null
  detailOverlaySource.value = null
  selectedPlugin.value = null
  detailError.value = null
  detailTab.value = 'overview'
  resetReviewState()
}

const filteredPlugins = computed(() => {
  const query = normalizedSearch.value

  return allPlugins.value.filter((plugin) => {
    if (!matchesCategory(plugin.category, filters.category))
      return false

    if (!query.length)
      return true

    const categoryLabel = resolveCategoryLabel(plugin.category)
    const haystack = [
      plugin.name,
      plugin.summary,
      plugin.slug,
      plugin.id,
      plugin.latestVersion?.version ?? '',
      plugin.latestVersion?.channel ?? '',
      plugin.author?.name ?? '',
      categoryLabel,
      plugin.badges.join(' '),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const hasResults = computed(() => filteredPlugins.value.length > 0)
const hasPlugins = computed(() => totalPlugins.value > 0)

const resultSummary = computed(() => {
  const total = totalPlugins.value
  const count = filteredPlugins.value.length

  if (!total)
    return t('store.results.none')

  if (count === total)
    return t('store.results.count', { count })

  return t('store.results.filtered', { count, total })
})

const pageTitle = computed(() => `${t('nav.store')} · Tuff Nexus`)
const pageDescription = computed(() => t('store.hero.subtitle'))

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: pageDescription,
  ogDescription: pageDescription,
})
</script>

<template>
  <section class="relative mx-auto max-w-6xl w-full flex flex-col gap-8 px-24 py-20 lg:px-12 sm:px-6">
    <StoreSearch v-model:filter="filters.category" v-model="filters.search" class="w-full">
      <template #result>
        {{ resultSummary }}
      </template>
    </StoreSearch>

    <div
      v-if="pluginsPending"
      class="flex items-center justify-center gap-3 border border-primary/20 rounded-3xl border-dashed bg-dark/5 px-6 py-12 text-sm text-black/70 dark:border-light/20 dark:bg-light/5 dark:text-light/70"
    >
      <span class="i-carbon-circle-dash animate-spin text-base" aria-hidden="true" />
      <span>{{ t('dashboard.sections.plugins.loading') }}</span>
    </div>

    <div v-else>
      <div
        v-if="!hasPlugins"
        class="border border-primary/10 rounded-3xl bg-white/80 px-6 py-12 text-center text-sm text-black/70 shadow-sm dark:border-light/15 dark:bg-dark/30 dark:text-light/80"
      >
        {{ t('store.results.none') }}
      </div>
      <div
        v-else-if="!hasResults"
        class="border border-primary/10 rounded-3xl bg-white/80 px-6 py-12 text-center text-sm text-black/70 shadow-sm dark:border-light/15 dark:bg-dark/30 dark:text-light/80"
      >
        {{ t('store.results.empty') }}
      </div>
      <div
        v-else
        class="grid gap-4 md:grid-cols-1 xl:grid-cols-2"
      >
        <StoreItem
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          :plugin="plugin"
          @view-detail="openPluginDetail"
        />
      </div>
    </div>
    <FlipDialog
      :model-value="Boolean(selectedSlug)"
      :reference="detailOverlaySource"
      size="xl"
      @update:model-value="(v) => {
        if (!v)
          closePluginDetail()
      }"
    >
      <template #header-display>
        <PluginMetaHeader
          v-if="selectedPlugin"
          :plugin="selectedPlugin"
          :category-label="resolveCategoryLabel(selectedPlugin.category)"
        />
        <div v-else class="StoreDetailOverlay-HeaderPlaceholder">
          <p class="StoreDetailOverlay-HeaderTitle">
            {{ t('store.detail.title', 'Plugin Details') }}
          </p>
          <p class="StoreDetailOverlay-HeaderDesc">
            {{ detailPending ? t('store.detail.loading') : t('store.detail.error', 'Unable to load plugin details.') }}
          </p>
        </div>
      </template>
      <template #default>
        <div class="StoreDetailOverlay-Inner">
          <div class="StoreDetailOverlay-Body">
            <div v-if="detailPending" class="StoreDetailStateText flex items-center justify-center gap-3 py-16 text-sm">
              <span class="i-carbon-circle-dash animate-spin text-base" aria-hidden="true" />
              <span>{{ t('store.detail.loading') }}</span>
            </div>
            <div v-else-if="detailError" class="StoreDetailError mt-4 rounded-xl p-4 text-sm">
              {{ detailError }}
            </div>
            <div v-else-if="selectedPlugin && sharedDetail" class="StoreDetailPlugin">
              <section class="StoreDetailPlugin-Content">
                <TxTabs
                  v-model="detailTab"
                  placement="top"
                  borderless
                  :content-padding="0"
                  :content-scrollable="false"
                  indicator-variant="pill"
                >
                  <TxTabItem name="overview" icon-class="i-carbon-document">
                    <template #name>
                      {{ t('store.detail.tabs.overview', 'Overview') }}
                    </template>
                    <div class="space-y-4 py-1">
                      <div class="StoreDetailPanel p-5">
                        <SharedPluginDetailReadme
                          :readme="sharedDetail.readme"
                          :title="t('store.detail.readme')"
                          :empty-text="t('store.detail.noReadme')"
                        />
                      </div>
                    </div>
                  </TxTabItem>

                  <TxTabItem name="versions" icon-class="i-carbon-data-table">
                    <template #name>
                      {{ t('store.detail.tabs.versions', 'Versions') }}
                    </template>
                    <div class="space-y-4 py-1">
                      <div class="StoreDetailPanel p-5">
                        <SharedPluginDetailVersions
                          :versions="sharedDetail.versions"
                          :title="t('store.detail.versions')"
                          :empty-text="t('store.detail.noVersions')"
                          :download-text="t('store.detail.download')"
                          :format-date="formatDate"
                          :format-size="formatPackageSize"
                        />
                      </div>
                    </div>
                  </TxTabItem>

                  <TxTabItem name="reviews" icon-class="i-carbon-chat">
                    <template #name>
                      {{ t('store.detail.tabs.reviews', 'Reviews') }}
                    </template>
                    <section class="space-y-4 py-1">
                      <div class="grid gap-4 lg:grid-cols-2">
                        <div class="StoreDetailPanel StoreDetailPanel--soft StoreDetailText p-4 text-sm">
                          <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="flex items-center gap-2">
                              <div class="flex items-center gap-1">
                                <span
                                  v-for="value in 5"
                                  :key="`summary-${value}`"
                                  :class="resolveStarClass(value, ratingValue)"
                                  class="text-base"
                                />
                              </div>
                              <span class="StoreDetailTextStrong text-lg font-semibold">
                                {{ ratingAverageText }}
                              </span>
                              <span class="StoreDetailTextMuted text-xs">
                                {{ t('store.detail.reviews.count', { count: ratingCount }) }}
                              </span>
                            </div>
                            <Tag :label="t('store.detail.reviews.tag')" size="sm" icon="i-carbon-chat" />
                          </div>
                          <p class="StoreDetailTextMuted mt-2 text-xs">
                            {{ t('store.detail.reviews.helper') }}
                          </p>
                        </div>

                        <div class="StoreDetailPanel StoreDetailPanel--soft StoreDetailText p-4 text-sm">
                          <h4 class="StoreDetailTextStrong text-sm font-semibold">
                            {{ t('store.detail.reviews.writeTitle') }}
                          </h4>
                          <div v-if="!isLoaded" class="StoreDetailTextSubtle mt-3 text-xs">
                            {{ t('store.detail.reviews.authLoading', 'Checking sign-in status...') }}
                          </div>
                          <div v-else-if="!isLoggedIn" class="StoreDetailTextSubtle mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                            <span>{{ t('store.detail.reviews.signInHint', 'Sign in to submit your review.') }}</span>
                            <TxButton size="small" @click="handleSignIn">
                              {{ t('store.detail.reviews.signInAction', 'Sign in') }}
                            </TxButton>
                          </div>
                          <div v-else class="mt-3 space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="StoreDetailTextSubtle text-xs">
                                {{ t('store.detail.reviews.ratingLabel') }}
                              </span>
                              <TxRating v-model="reviewForm.rating" :max-stars="5" />
                              <span class="StoreDetailTextMuted text-xs">
                                {{ reviewForm.rating || '-' }}
                              </span>
                            </div>
                            <Input
                              v-model="reviewForm.title"
                              :placeholder="t('store.detail.reviews.titlePlaceholder')"
                            />
                            <Input
                              v-model="reviewForm.content"
                              type="textarea"
                              :rows="4"
                              :placeholder="t('store.detail.reviews.contentPlaceholder')"
                            />
                            <div class="flex flex-wrap items-center justify-between gap-3">
                              <p class="StoreDetailTextMuted text-xs">
                                {{ t('store.detail.reviews.submitHint') }}
                              </p>
                              <TxButton size="small" :disabled="reviewSubmitting" @click="submitReview">
                                <span v-if="reviewSubmitting" class="i-carbon-circle-dash animate-spin text-sm" aria-hidden="true" />
                                {{ t('store.detail.reviews.submit') }}
                              </TxButton>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="space-y-3">
                        <div v-if="reviewsPending" class="StoreDetailTextSubtle flex items-center gap-2 text-sm">
                          <span class="i-carbon-circle-dash animate-spin text-sm" aria-hidden="true" />
                          <span>{{ t('store.detail.reviews.loading') }}</span>
                        </div>
                        <div v-else-if="reviewsError" class="StoreDetailError rounded-xl p-4 text-sm">
                          {{ reviewsError }}
                        </div>
                        <p v-else-if="!reviews.length" class="StoreDetailTextSubtle text-sm">
                          {{ t('store.detail.reviews.empty') }}
                        </p>
                        <div v-else class="space-y-4">
                          <article
                            v-for="review in reviews"
                            :key="review.id"
                            class="StoreDetailPanel StoreDetailPanel--review StoreDetailText p-4 text-sm"
                          >
                            <div class="flex flex-wrap items-start justify-between gap-3">
                              <div class="flex items-center gap-3">
                                <span class="StoreDetailAvatar size-9 flex items-center justify-center overflow-hidden rounded-full font-semibold">
                                  <img
                                    v-if="review.author?.avatarUrl"
                                    :src="review.author.avatarUrl"
                                    :alt="review.author?.name || t('store.detail.reviews.anonymous')"
                                    class="h-full w-full object-cover"
                                  >
                                  <span v-else>{{ review.author?.name?.charAt(0) || '?' }}</span>
                                </span>
                                <div>
                                  <p class="StoreDetailTextStrong text-sm font-semibold">
                                    {{ review.author?.name || t('store.detail.reviews.anonymous') }}
                                  </p>
                                  <div class="StoreDetailTextMuted flex flex-wrap items-center gap-2 text-xs">
                                    <div class="flex items-center gap-1">
                                      <span
                                        v-for="value in 5"
                                        :key="`${review.id}-${value}`"
                                        :class="resolveStarClass(value, review.rating)"
                                        class="text-xs"
                                      />
                                    </div>
                                    <span>{{ formatDate(review.createdAt) }}</span>
                                  </div>
                                </div>
                              </div>
                              <StatusBadge
                                v-if="review.status && review.status !== 'approved'"
                                :text="t(`store.detail.reviews.status.${review.status}`)"
                                :status="review.status === 'pending' ? 'warning' : 'danger'"
                                size="sm"
                              />
                            </div>
                            <div class="mt-3 space-y-1">
                              <p v-if="review.title" class="StoreDetailTextStrong text-sm font-semibold">
                                {{ review.title }}
                              </p>
                              <p class="StoreDetailText text-sm leading-relaxed">
                                {{ review.content }}
                              </p>
                            </div>
                          </article>
                          <div v-if="canLoadMoreReviews" class="flex justify-center pt-2">
                            <TxButton size="small" :loading="reviewsLoadingMore" @click="loadMoreReviews">
                              {{ t('store.detail.reviews.loadMore', 'Load more') }}
                            </TxButton>
                          </div>
                        </div>
                      </div>
                    </section>
                  </TxTabItem>
                </TxTabs>
              </section>
            </div>
          </div>
        </div>
      </template>
    </FlipDialog>
  </section>
</template>

<style lang="scss">
.StoreDetailOverlay-Inner {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: inherit;
}

.StoreDetailOverlay-Body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 1.2rem clamp(1rem, 3vw, 1.6rem) 1.5rem;
}

.StoreDetailStateText {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 88%, transparent);
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

.StoreDetailOverlay-HeaderDesc {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 90%, transparent);
}

.StoreDetailPlugin {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.StoreDetailPlugin-Content {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.22)) 100%, transparent);
  border-radius: 1rem;
  padding: 0.5rem 0.8rem 0.8rem;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 78%, transparent);
}

.StoreDetailPanel {
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.2)) 100%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 90%, transparent);
}

.StoreDetailPanel--soft {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
}

.StoreDetailPanel--review {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 84%, transparent);
}

.StoreDetailError {
  border: 1px solid color-mix(in srgb, var(--tx-color-danger, #ef4444) 26%, transparent);
  background: color-mix(in srgb, var(--tx-color-danger, #ef4444) 10%, transparent);
  color: color-mix(in srgb, var(--tx-color-danger, #ef4444) 88%, var(--tx-text-color, #111827) 12%);
}

.StoreDetailText {
  color: color-mix(in srgb, var(--tx-text-color, #111827) 86%, transparent);
}

.StoreDetailTextStrong {
  color: var(--tx-text-color, #111827);
}

.StoreDetailTextMuted {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 90%, transparent);
}

.StoreDetailTextSubtle {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 82%, transparent);
}

.StoreDetailAvatar {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.24)) 100%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 80%, transparent);
  color: var(--tx-text-color, #111827);
}

.StoreDetailStarEmpty {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 40%, transparent);
}

</style>
