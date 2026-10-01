<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onMounted, reactive, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { useStoreFormatters } from '~/composables/useStoreFormatters'
import { useToast } from '~/composables/useToast'

const { t } = useI18n()
const toast = useToast()
const { formatDate } = useStoreFormatters()

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

const pagination = reactive({ page: 1, limit: 20, total: 0 })
const pendingReviews = ref<PendingReview[]>([])
const pendingLoading = ref(false)
const pendingError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
let loadRequestId = 0

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.limit)))
const actionsLocked = computed(() => pendingLoading.value || actionPendingId.value !== null)
const reviewColumns = computed<DataTableColumn<PendingReview>[]>(() => [
  { key: 'plugin', title: t('dashboard.sections.reviews.table.plugin', 'Plugin'), width: 220 },
  { key: 'author', title: t('dashboard.sections.reviews.table.author', 'Author'), width: 150 },
  { key: 'rating', title: t('dashboard.sections.reviews.table.rating', 'Rating'), width: 90 },
  { key: 'review', title: t('dashboard.sections.reviews.table.review', 'Review'), width: '38%' },
  { key: 'submitted', title: t('dashboard.sections.reviews.table.submitted', 'Submitted'), width: 140 },
  { key: 'actions', title: t('dashboard.sections.reviews.table.actions', 'Actions'), width: 180, fixed: 'right' },
])

async function fetchPendingReviews() {
  const requestId = ++loadRequestId
  const requestedPage = pagination.page
  pendingLoading.value = true
  pendingError.value = null

  try {
    const response = await rawFetch<PendingReviewResponse>('/api/admin/store/reviews/pending', {
      query: {
        limit: pagination.limit,
        offset: (requestedPage - 1) * pagination.limit,
      },
    })
    if (requestId !== loadRequestId)
      return

    pagination.total = response.total ?? 0
    const lastPage = Math.max(1, Math.ceil(pagination.total / pagination.limit))
    if (requestedPage > lastPage) {
      pagination.page = lastPage
      await fetchPendingReviews()
      return
    }
    pendingReviews.value = response.reviews ?? []
  }
  catch (error: unknown) {
    if (requestId !== loadRequestId)
      return
    pendingError.value = error instanceof Error
      ? error.message
      : t('dashboard.sections.reviews.loadFailed', 'Unable to load pending reviews.')
  }
  finally {
    if (requestId === loadRequestId)
      pendingLoading.value = false
  }
}

async function refreshReviews() {
  actionError.value = null
  pagination.page = 1
  await fetchPendingReviews()
}

async function changePage(page: number) {
  if (pendingLoading.value || page === pagination.page)
    return
  actionError.value = null
  pagination.page = page
  await fetchPendingReviews()
}

async function updateReviewStatus(review: PendingReview, status: 'approved' | 'rejected') {
  if (actionPendingId.value)
    return

  actionPendingId.value = review.id
  actionError.value = null
  try {
    await rawFetch(`/api/admin/store/reviews/${review.id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    toast.success(t('dashboard.sections.reviews.actionSuccess', 'Review status updated.'))
    await fetchPendingReviews()
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

onMounted(fetchPendingReviews)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.reviews.pendingCount', { count: pagination.total }) }}
      </p>
      <TxButton size="sm" type="text" :disabled="pendingLoading" @click="refreshReviews">
        <TxSpinner v-if="pendingLoading" :size="14" />
        <span :class="pendingLoading ? 'ml-2' : ''">
          {{ t('dashboard.sections.reviews.refresh', 'Refresh') }}
        </span>
      </TxButton>
    </div>

    <div v-if="actionError" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
      {{ actionError }}
    </div>
    <div v-if="pendingError" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
      {{ pendingError }}
    </div>

    <div v-if="pendingLoading && !pendingReviews.length" class="space-y-3 overflow-x-auto">
      <div class="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
        <TxSpinner :size="16" />
        {{ t('dashboard.sections.reviews.loading', 'Loading pending reviews...') }}
      </div>
      <div v-for="row in 4" :key="row" class="grid grid-cols-[220px_150px_90px_1fr_140px_180px] items-center gap-4 rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
        <TxSkeleton v-for="column in 6" :key="column" :loading="true" :lines="1" />
      </div>
    </div>
    <div v-else-if="!pendingReviews.length && !pendingError" class="py-8 text-center text-sm text-black/60 dark:text-white/60">
      {{ t('dashboard.sections.reviews.empty', 'No pending reviews yet.') }}
    </div>
    <div v-else-if="pendingReviews.length" class="overflow-x-auto">
      <TxDataTable :columns="reviewColumns" :data="pendingReviews" row-key="id" :loading="pendingLoading" scroll-x>
        <template #cell-plugin="{ row: review }">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-black dark:text-white" :title="review.plugin?.name || undefined">
              {{ review.plugin?.name || t('dashboard.sections.reviews.unknownPlugin', 'Unknown plugin') }}
            </p>
            <p class="truncate text-xs text-black/50 dark:text-white/50" :title="review.plugin?.slug || review.pluginId">
              {{ review.plugin?.slug || review.pluginId }}
            </p>
          </div>
        </template>
        <template #cell-author="{ row: review }">
          <span class="text-sm text-black/70 dark:text-white/70">
            {{ review.author?.name || t('store.detail.reviews.anonymous', 'Anonymous') }}
          </span>
        </template>
        <template #cell-rating="{ row: review }">
          <span class="font-semibold text-amber-500">{{ review.rating }}/5</span>
        </template>
        <template #cell-review="{ row: review }">
          <div class="min-w-[260px] max-w-xl">
            <p v-if="review.title" class="font-medium text-black dark:text-white">
              {{ review.title }}
            </p>
            <p class="whitespace-pre-line break-words text-sm text-black/70 dark:text-white/70" :class="review.title ? 'mt-1' : ''" :title="review.content">
              {{ review.content }}
            </p>
          </div>
        </template>
        <template #cell-submitted="{ row: review }">
          <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(review.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row: review }">
          <div class="flex items-center gap-2 whitespace-nowrap">
            <TxButton size="sm" type="success" :loading="actionPendingId === review.id" :disabled="actionsLocked" @click="updateReviewStatus(review, 'approved')">
              {{ t('dashboard.sections.reviews.approve', 'Approve') }}
            </TxButton>
            <TxButton size="sm" type="danger" :loading="actionPendingId === review.id" :disabled="actionsLocked" @click="updateReviewStatus(review, 'rejected')">
              {{ t('dashboard.sections.reviews.reject', 'Reject') }}
            </TxButton>
          </div>
        </template>
      </TxDataTable>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
      <span class="text-xs text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.reviews.pendingCount', { count: pagination.total }) }}
      </span>
      <TxPagination
        :current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        :total-pages="totalPages"
        :prev-label="t('dashboard.sections.users.pagination.prev', 'Prev')"
        :next-label="t('dashboard.sections.users.pagination.next', 'Next')"
        @update:current-page="changePage"
      />
    </div>
  </section>
</template>
