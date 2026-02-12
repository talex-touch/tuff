<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import { useMarketFormatters } from '~/composables/useMarketFormatters'
import { useToast } from '~/composables/useToast'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()
const toast = useToast()
const { formatDate } = useMarketFormatters()

// Admin check - redirect if not admin
const isAdmin = computed(() => user.value?.role === 'admin')

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

interface PendingReviewPlugin { 
  id: string
  slug: string
  name: string
}

interface PendingReview { 
  id: string
  pluginId: string
  rating: number
  title?: string | null
  content: string
  author: {
    name: string
    avatarUrl?: string | null
  }
  status?: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
  plugin?: PendingReviewPlugin | null
}

interface PendingReviewResponse { 
  reviews: PendingReview[]
  total: number
  limit: number
  offset: number
}

const pagination = reactive({
  limit: 20,
  offset: 0,
})

const pendingReviews = ref<PendingReview[]>([])
const pendingTotal = ref(0)
const pendingLoading = ref(false)
const pendingError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)

const hasMore = computed(() => pendingReviews.value.length < pendingTotal.value)
const actionsLocked = computed(() => pendingLoading.value || actionPendingId.value !== null)

async function loadPendingReviews(options: { reset?: boolean } = {}) {
  if (pendingLoading.value)
    return

  pendingLoading.value = true
  pendingError.value = null

  const reset = options.reset ?? false
  const offset = reset ? 0 : pendingReviews.value.length
  if (reset)
    pagination.offset = 0

  try {
    const response = await $fetch<PendingReviewResponse>('/api/admin/market/reviews/pending', {
      query: {
        limit: pagination.limit,
        offset,
      },
    })

    pendingTotal.value = response.total ?? 0
    if (reset)
      pendingReviews.value = response.reviews ?? []
    else
      pendingReviews.value = [...pendingReviews.value, ...(response.reviews ?? [])]
  }
  catch (error: unknown) {
    pendingError.value = error instanceof Error
      ? error.message
      : t('dashboard.sections.reviews.loadFailed', 'Unable to load pending reviews.')
  }
  finally {
    pendingLoading.value = false
  }
}

async function refreshReviews() {
  await loadPendingReviews({ reset: true })
}

async function loadMore() {
  if (!hasMore.value || pendingLoading.value)
    return
  await loadPendingReviews()
}

async function updateReviewStatus(review: PendingReview, status: 'approved' | 'rejected') {
  if (actionPendingId.value)
    return

  actionPendingId.value = review.id
  actionError.value = null

  try {
    await $fetch(`/api/admin/market/reviews/${review.id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    toast.success(t('dashboard.sections.reviews.actionSuccess', 'Review status updated.'))
    await refreshReviews()
  }
  catch (error: unknown) {
    const fallback = t('dashboard.sections.reviews.actionFailed', 'Failed to update review.')
    actionError.value = error instanceof Error ? error.message : fallback
    toast.warning(actionError.value)
  }
  finally {
    actionPendingId.value = null
  }
}

onMounted(() => {
  refreshReviews()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.reviews.title', 'Review Moderation') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.reviews.subtitle', 'Review and manage community feedback.') }}
      </p>
    </div>

    <section class="apple-card-lg p-5">
      <div>
        <h2 class="text-base font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.reviews.pendingTitle', 'Pending reviews') }}
        </h2>
        <p class="text-xs text-black/50 dark:text-white/50">
          {{ t('dashboard.sections.reviews.pendingCount', { count: pendingTotal }) }}
        </p>
      </div>

      <div class="mt-3">
        <TxButton size="small" type="secondary" :disabled="pendingLoading" @click="refreshReviews">
          <TxSpinner v-if="pendingLoading" :size="14" />
          <span class="ml-2">
            {{ t('dashboard.sections.reviews.refresh', 'Refresh') }}
          </span>
        </TxButton>
      </div>

      <div v-if="pendingLoading && !pendingReviews.length" class="mt-4 space-y-3">
        <div class="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.reviews.loading', 'Loading pending reviews...') }}
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
      <div v-else-if="pendingError" class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        {{ pendingError }}
      </div>
      <div v-else-if="actionError" class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        {{ actionError }}
      </div>
      <div v-else-if="!pendingReviews.length" class="mt-4 text-sm text-black/60 dark:text-white/60">
        {{ t('dashboard.sections.reviews.empty', 'No pending reviews yet.') }}
      </div>
      <div v-else class="mt-4 space-y-4">
        <article
          v-for="review in pendingReviews"
          :key="review.id"
          class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-black dark:text-white">
                {{ review.plugin?.name || t('dashboard.sections.reviews.unknownPlugin', 'Unknown plugin') }}
              </h3>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ review.plugin?.slug || review.pluginId }}
              </p>
            </div>
            <div class="text-sm font-semibold text-amber-500">
              {{ review.rating }}/5
            </div>
          </div>

          <div class="mt-3 text-sm text-black/70 dark:text-white/70">
            <p class="font-medium text-black dark:text-white">
              {{ review.title || review.content.slice(0, 40) }}
            </p>
            <p class="mt-1 whitespace-pre-line">
              {{ review.content }}
            </p>
          </div>

          <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-black/50 dark:text-white/50">
            <div class="flex items-center gap-2">
              <span>{{ review.author?.name || t('market.detail.reviews.anonymous', 'Anonymous') }}</span>
              <span>•</span>
              <span>{{ formatDate(review.createdAt) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <TxButton size="small" type="success" :loading="actionPendingId === review.id" :disabled="actionsLocked" @click="updateReviewStatus(review, 'approved')">
                {{ t('dashboard.sections.reviews.approve', 'Approve') }}
              </TxButton>
              <TxButton size="small" type="danger" :loading="actionPendingId === review.id" :disabled="actionsLocked" @click="updateReviewStatus(review, 'rejected')">
                {{ t('dashboard.sections.reviews.reject', 'Reject') }}
              </TxButton>
            </div>
          </div>
        </article>
      </div>

      <div v-if="hasMore" class="mt-5 flex justify-center">
        <TxButton size="small" type="secondary" :loading="pendingLoading" @click="loadMore">
          {{ t('dashboard.sections.reviews.loadMore', 'Load more') }}
        </TxButton>
      </div>
    </section>
  </div>
</template>
