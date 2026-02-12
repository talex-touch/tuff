<script setup lang="ts">
import type {
  FilterCategory,
  MarketplacePluginDetail,
  MarketplacePluginRatingResponse,
  MarketplacePluginRatingSummary,
  MarketplacePluginReview,
  MarketplacePluginReviewListResponse,
  MarketplacePluginReviewSubmitResponse,
  MarketplacePluginSummary,
} from '~/types/marketplace'
import { SharedPluginDetailContent } from '@talex-touch/utils/renderer'
import type { SharedPluginDetail } from '@talex-touch/utils/renderer'
import { computed, reactive, ref, watch } from 'vue'
import MarketItem from '~/components/market/MarketItem.vue'
import MarketSearch from '~/components/market/MarketSearch.vue'
import { TxButton } from '@talex-touch/tuffex'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'
import Modal from '~/components/ui/Modal.vue'
import Tag from '~/components/ui/Tag.vue'
import { useMarketCategories } from '~/composables/useMarketCategories'
import { useMarketFormatters } from '~/composables/useMarketFormatters'
import { useToast } from '~/composables/useToast'

definePageMeta({
  layout: 'marketplace',
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
const selectedPlugin = ref<MarketplacePluginDetail | null>(null)
const detailPending = ref(false)
const detailError = ref<string | null>(null)
const reviews = ref<MarketplacePluginReview[]>([])
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
const ratingSummary = ref<MarketplacePluginRatingSummary | null>(null)
const reviewForm = reactive({
  rating: 0,
  title: '',
  content: '',
})

const {
  data: pluginsPayload,
  pending: pluginsPending,
} = await useAsyncData('market-plugins', () =>
  $fetch<{ plugins: MarketplacePluginSummary[] }>('/api/market/plugins'))

const { resolveCategoryLabel, matchesCategory } = useMarketCategories()
const { formatDate, formatInstalls, formatPackageSize } = useMarketFormatters()

const allPlugins = computed(() => (pluginsPayload.value?.plugins ?? []).filter(plugin => plugin.latestVersion))

const totalPlugins = computed(() => allPlugins.value.length)

const normalizedSearch = computed(() => filters.search.trim().toLowerCase())
const ratingAverageText = computed(() => (ratingSummary.value ? ratingSummary.value.average.toFixed(1) : '0.0'))
const ratingCount = computed(() => ratingSummary.value?.count ?? 0)
const ratingValue = computed(() => Math.round(ratingSummary.value?.average ?? 0))

const sharedDetail = computed<SharedPluginDetail | null>(() => {
  const plugin = selectedPlugin.value
  if (!plugin) return null

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

const installsText = computed(() => {
  if (!selectedPlugin.value) return ''
  return t('dashboard.plugins.stats.installs', { count: formatInstalls(selectedPlugin.value.installs) })
})

const versionText = computed(() => {
  const version = selectedPlugin.value?.latestVersion?.version
  return version ? `v${version}` : ''
})

const updatedText = computed(() => {
  const updatedAt = selectedPlugin.value?.latestVersion?.createdAt
  return updatedAt ? formatDate(updatedAt) : ''
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
    : 'i-carbon-star text-black/30 dark:text-light/30'
}

function setReviewRating(value: number) {
  reviewForm.rating = value
}

async function loadPluginCommunity(slug: string) {
  reviewsPending.value = true
  reviewsError.value = null
  try {
    const [reviewsResponse, ratingResponse] = await Promise.all([
      $fetch<MarketplacePluginReviewListResponse>(`/api/market/plugins/${slug}/reviews`, {
      query: {
        limit: reviewsMeta.limit,
        offset: 0,
      },
    }),
      $fetch<MarketplacePluginRatingResponse>(`/api/market/plugins/${slug}/rating`),
    ])
    reviews.value = reviewsResponse.reviews ?? []
    reviewsMeta.total = reviewsResponse.total ?? 0
    reviewsMeta.limit = reviewsResponse.limit ?? reviewsMeta.limit
    reviewsMeta.offset = reviewsResponse.offset ?? 0
    ratingSummary.value = ratingResponse.rating
  }
  catch (error: unknown) {
    reviewsError.value = error instanceof Error ? error.message : t('market.detail.reviews.error', 'Unable to load reviews.')
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
    const response = await $fetch<MarketplacePluginReviewListResponse>(`/api/market/plugins/${selectedSlug.value}/reviews`, {
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
    const fallback = t('market.detail.reviews.loadMoreFailed', 'Failed to load more reviews.')
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
    toast.warning(t('market.detail.reviews.signInHint', 'Sign in to submit your review.'))
    return
  }

  if (reviewForm.rating < 1 || reviewForm.rating > 5) {
    toast.warning(t('market.detail.reviews.ratingRequired', 'Please provide a rating.'))
    return
  }

  const content = reviewForm.content.trim()
  if (!content) {
    toast.warning(t('market.detail.reviews.contentRequired', 'Please write your review.'))
    return
  }

  reviewSubmitting.value = true
  try {
    const response = await $fetch<MarketplacePluginReviewSubmitResponse>(
      `/api/market/plugins/${selectedSlug.value}/reviews`,
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
    toast.success(t('market.detail.reviews.submitSuccess', 'Review submitted.'))
  }
  catch (error: unknown) {
    const fallback = t('market.detail.reviews.submitFailed', 'Failed to submit review.')
    const message = error instanceof Error ? error.message : fallback
    toast.error(fallback, message)
  }
  finally {
    reviewSubmitting.value = false
  }
}

async function openPluginDetail(plugin: MarketplacePluginSummary) {
  selectedSlug.value = plugin.slug
  selectedPlugin.value = null
  detailPending.value = true
  detailError.value = null
  resetReviewState()
  try {
    const response = await $fetch<{ plugin: MarketplacePluginDetail }>(`/api/market/plugins/${plugin.slug}`)
    selectedPlugin.value = response.plugin
    await loadPluginCommunity(plugin.slug)
  }
  catch (error: unknown) {
    detailError.value = error instanceof Error ? error.message : t('market.detail.error', 'Unable to load plugin details.')
  }
  finally {
    detailPending.value = false
  }
}

function closePluginDetail() {
  selectedSlug.value = null
  selectedPlugin.value = null
  detailError.value = null
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
    return t('market.results.none')

  if (count === total)
    return t('market.results.count', { count })

  return t('market.results.filtered', { count, total })
})

const pageTitle = computed(() => `${t('nav.market')} · Tuff Nexus`)
const pageDescription = computed(() => t('market.hero.subtitle'))

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: pageDescription,
  ogDescription: pageDescription,
})
</script>

<template>
  <section class="relative mx-auto max-w-6xl w-full flex flex-col gap-8 px-24 py-20 lg:px-12 sm:px-6">
    <MarketSearch v-model:filter="filters.category" v-model="filters.search" class="w-full">
      <template #result>
        {{ resultSummary }}
      </template>
    </MarketSearch>

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
        {{ t('market.results.none') }}
      </div>
      <div
        v-else-if="!hasResults"
        class="border border-primary/10 rounded-3xl bg-white/80 px-6 py-12 text-center text-sm text-black/70 shadow-sm dark:border-light/15 dark:bg-dark/30 dark:text-light/80"
      >
        {{ t('market.results.empty') }}
      </div>
      <div
        v-else
        class="grid gap-4 md:grid-cols-1 xl:grid-cols-2"
      >
        <MarketItem
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          :plugin="plugin"
          @view-detail="openPluginDetail"
        />
      </div>
    </div>
    <Modal
      :model-value="Boolean(selectedSlug)"
      width="860px"
      @update:model-value="(v) => {
        if (!v)
          closePluginDetail()
      }"
      @close="closePluginDetail"
    >
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-black dark:text-light">
              {{ t('market.detail.title', 'Plugin Details') }}
            </h2>
            <p class="text-xs text-black/50 dark:text-light/60">
              {{ selectedPlugin?.name || '' }}
            </p>
          </div>
          <FlatButton @click="closePluginDetail">
            <span class="i-carbon-close text-lg" aria-hidden="true" />
          </FlatButton>
        </div>
      </template>
      <div v-if="detailPending" class="flex items-center justify-center gap-3 py-16 text-sm text-black/70 dark:text-light/70">
        <span class="i-carbon-circle-dash animate-spin text-base" aria-hidden="true" />
        <span>{{ t('market.detail.loading') }}</span>
      </div>
      <div v-else-if="detailError" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
        {{ detailError }}
      </div>
      <div v-else-if="selectedPlugin" class="space-y-6">
        <SharedPluginDetailContent
          v-if="sharedDetail"
          :detail="sharedDetail"
          :show-meta="false"
          :readme-title="t('market.detail.readme')"
          :empty-readme-text="t('market.detail.noReadme')"
          :versions-title="t('market.detail.versions')"
          :empty-versions-text="t('market.detail.noVersions')"
          :official-label="t('market.badges.official')"
          :installs-text="installsText"
          :version-text="versionText"
          :updated-text="updatedText"
          :format-date="formatDate"
          :format-number="formatInstalls"
          :format-size="formatPackageSize"
        />

        <section>
          <h3 class="text-sm text-black/70 font-semibold tracking-wide uppercase dark:text-light/70">
            {{ t('market.detail.reviews.title') }}
          </h3>
          <div class="mt-3 grid gap-4 lg:grid-cols-2">
            <div class="rounded-2xl border border-primary/10 bg-white/80 p-4 text-sm text-black/70 dark:border-light/20 dark:bg-dark/70 dark:text-light/80">
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
                  <span class="text-lg text-black font-semibold dark:text-light">
                    {{ ratingAverageText }}
                  </span>
                  <span class="text-xs text-black/50 dark:text-light/60">
                    {{ t('market.detail.reviews.count', { count: ratingCount }) }}
                  </span>
                </div>
                <Tag :label="t('market.detail.reviews.tag')" size="sm" icon="i-carbon-chat" />
              </div>
              <p class="mt-2 text-xs text-black/50 dark:text-light/60">
                {{ t('market.detail.reviews.helper') }}
              </p>
            </div>

            <div class="rounded-2xl border border-primary/10 bg-white/80 p-4 text-sm text-black/70 dark:border-light/20 dark:bg-dark/70 dark:text-light/80">
              <h4 class="text-sm text-black font-semibold dark:text-light">
                {{ t('market.detail.reviews.writeTitle') }}
              </h4>
              <div v-if="!isLoaded" class="mt-3 text-xs text-black/60 dark:text-light/60">
                {{ t('market.detail.reviews.authLoading', 'Checking sign-in status...') }}
              </div>
              <div v-else-if="!isLoggedIn" class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-black/60 dark:text-light/60">
                <span>{{ t('market.detail.reviews.signInHint', 'Sign in to submit your review.') }}</span>
                <TxButton size="small" @click="navigateTo('/sign-in')">
                  {{ t('market.detail.reviews.signInAction', 'Sign in') }}
                </TxButton>
              </div>
              <div v-else class="mt-3 space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs text-black/60 dark:text-light/60">
                    {{ t('market.detail.reviews.ratingLabel') }}
                  </span>
                  <TxRating v-model="reviewForm.rating" :max-stars="5" />
                  <span class="text-xs text-black/50 dark:text-light/60">
                    {{ reviewForm.rating || '-' }}
                  </span>
                </div>
                <Input
                  v-model="reviewForm.title"
                  :placeholder="t('market.detail.reviews.titlePlaceholder')"
                />
                <Input
                  v-model="reviewForm.content"
                  type="textarea"
                  :rows="4"
                  :placeholder="t('market.detail.reviews.contentPlaceholder')"
                />
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <p class="text-xs text-black/50 dark:text-light/60">
                    {{ t('market.detail.reviews.submitHint') }}
                  </p>
                  <TxButton size="small" :disabled="reviewSubmitting" @click="submitReview">
                    <span v-if="reviewSubmitting" class="i-carbon-circle-dash animate-spin text-sm" aria-hidden="true" />
                    {{ t('market.detail.reviews.submit') }}
                  </TxButton>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-5 space-y-3">
            <div v-if="reviewsPending" class="flex items-center gap-2 text-sm text-black/60 dark:text-light/60">
              <span class="i-carbon-circle-dash animate-spin text-sm" aria-hidden="true" />
              <span>{{ t('market.detail.reviews.loading') }}</span>
            </div>
            <div v-else-if="reviewsError" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
              {{ reviewsError }}
            </div>
            <p v-else-if="!reviews.length" class="text-sm text-black/60 dark:text-light/60">
              {{ t('market.detail.reviews.empty') }}
            </p>
            <div v-else class="space-y-4">
            <article
              v-for="review in reviews"
              :key="review.id"
              class="rounded-2xl border border-primary/10 bg-white/80 p-4 text-sm text-black/70 dark:border-light/20 dark:bg-dark/70 dark:text-light/80"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <span class="size-9 flex items-center justify-center overflow-hidden rounded-full bg-dark/10 text-black font-semibold dark:bg-light/10 dark:text-light">
                    <img
                      v-if="review.author?.avatarUrl"
                      :src="review.author.avatarUrl"
                      :alt="review.author?.name || t('market.detail.reviews.anonymous')"
                      class="h-full w-full object-cover"
                    >
                    <span v-else>{{ review.author?.name?.charAt(0) || '?' }}</span>
                  </span>
                  <div>
                    <p class="text-sm text-black font-semibold dark:text-light">
                      {{ review.author?.name || t('market.detail.reviews.anonymous') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-black/50 dark:text-light/60">
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
                  :text="t(`market.detail.reviews.status.${review.status}`)"
                  :status="review.status === 'pending' ? 'warning' : 'danger'"
                  size="sm"
                />
              </div>
              <div class="mt-3 space-y-1">
                <p v-if="review.title" class="text-sm text-black font-semibold dark:text-light">
                  {{ review.title }}
                </p>
                <p class="text-sm text-black/70 leading-relaxed dark:text-light/70">
                  {{ review.content }}
                </p>
              </div>
            </article>
            <div v-if="canLoadMoreReviews" class="flex justify-center pt-2">
              <TxButton size="small" :loading="reviewsLoadingMore" @click="loadMoreReviews">
                {{ t('market.detail.reviews.loadMore', 'Load more') }}
              </TxButton>
            </div>
          </div>
          </div>
        </section>
      </div>
    </Modal>
  </section>
</template>
