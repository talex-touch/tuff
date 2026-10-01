<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { requestJson } from '~/utils/request'

const { t } = useI18n()
const toast = useToast()
const { deviceId } = useDeviceIdentity()
const { isAdmin } = useAccountRole()

interface DocComment {
  id: string
  path: string
  userId: string
  userName: string | null
  userImage: string | null
  content: string
  createdAt: number
}

interface DocCommentListResponse {
  comments: DocComment[]
  total: number
  limit: number
  offset: number
}

const pagination = reactive({ page: 1, limit: 20, total: 0 })
const comments = ref<DocComment[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
const pendingDeleteComment = ref<DocComment | null>(null)
const pathFilter = ref('')
let loadRequestId = 0

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.limit)))
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)
const commentColumns = computed<DataTableColumn<DocComment>[]>(() => [
  { key: 'author', title: t('dashboard.sections.docComments.table.author', 'Author'), width: 190 },
  { key: 'path', title: t('dashboard.sections.docComments.table.path', 'Document'), width: 220 },
  { key: 'comment', title: t('dashboard.sections.docComments.table.comment', 'Comment'), width: '42%' },
  { key: 'submitted', title: t('dashboard.sections.docComments.table.submitted', 'Submitted'), width: 180 },
  { key: 'actions', title: t('dashboard.sections.docComments.table.actions', 'Actions'), width: 100, fixed: 'right' },
])
const commentsTracker = useDocEngagementTracker({
  source: 'doc_comments_admin',
  // Analytics keeps its established source identifier; this is not a route.
  path: () => 'admin/doc-comments',
  title: () => 'Doc Comments',
  clientId: () => deviceId.value || '',
  enabled: () => isAdmin.value,
  trackSections: false,
  captureSelection: false,
})

async function fetchComments(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    pagination.page = 1

  const requestId = ++loadRequestId
  const requestedPage = pagination.page
  loading.value = true
  error.value = null

  try {
    const query: Record<string, string | number> = {
      limit: pagination.limit,
      offset: (requestedPage - 1) * pagination.limit,
    }
    if (pathFilter.value.trim())
      query.path = pathFilter.value.trim()

    const response = await requestJson<DocCommentListResponse>('/api/admin/doc-comments', { query })
    if (requestId !== loadRequestId)
      return

    pagination.total = response.total ?? 0
    const lastPage = Math.max(1, Math.ceil(pagination.total / pagination.limit))
    if (requestedPage > lastPage) {
      pagination.page = lastPage
      await fetchComments()
      return
    }
    comments.value = response.comments ?? []
  }
  catch (err: unknown) {
    if (requestId !== loadRequestId)
      return
    error.value = err instanceof Error
      ? err.message
      : t('dashboard.sections.docComments.loadFailed', 'Unable to load comments.')
  }
  finally {
    if (requestId === loadRequestId)
      loading.value = false
  }
}

async function refreshComments() {
  void commentsTracker.recordAction({
    type: 'refresh',
    source: 'toolbar',
    sectionId: 'root',
    sectionTitle: 'Doc comments',
  })
  await fetchComments({ resetPage: true })
}

async function changePage(page: number) {
  if (loading.value || page === pagination.page)
    return
  pagination.page = page
  await fetchComments()
}

function requestDelete(comment: DocComment) {
  pendingDeleteComment.value = comment
}

function closeDeleteConfirm() {
  pendingDeleteComment.value = null
}

async function confirmDelete() {
  const comment = pendingDeleteComment.value
  if (!comment || actionPendingId.value)
    return false

  actionPendingId.value = comment.id
  try {
    await requestJson(`/api/admin/doc-comments/${comment.id}`, { method: 'DELETE' })
    toast.success(t('dashboard.sections.docComments.deleteSuccess', 'Comment deleted.'))
    void commentsTracker.recordAction({
      type: 'delete',
      source: 'moderation',
      sectionId: 'root',
      sectionTitle: comment.path,
      text: comment.content,
      textLength: comment.content.length,
    })
    pendingDeleteComment.value = null
    await fetchComments()
    return true
  }
  catch (err: unknown) {
    const fallback = t('dashboard.sections.docComments.deleteFailed', 'Failed to delete comment.')
    toast.warning(err instanceof Error ? err.message : fallback)
    return false
  }
  finally {
    actionPendingId.value = null
  }
}

function displayAuthor(comment: DocComment) {
  return comment.userName?.trim() || t('dashboard.sections.docComments.anonymous', 'Anonymous')
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function docsLink(path: string) {
  return `/docs/${path}`
}

function normalizeDocPath(path: string) {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

function docsAnalyticsLink(path?: string) {
  const params = new URLSearchParams()
  params.set('section', 'docs')
  if (path)
    params.set('path', normalizeDocPath(path))
  return `/admin/analytics?${params.toString()}`
}

let pathFilterTimer: ReturnType<typeof setTimeout> | null = null

watch(pathFilter, () => {
  if (pathFilterTimer)
    clearTimeout(pathFilterTimer)
  pathFilterTimer = setTimeout(() => {
    const keyword = pathFilter.value.trim()
    if (keyword) {
      void commentsTracker.recordAction({
        type: 'filter',
        source: 'toolbar',
        sectionId: 'root',
        sectionTitle: 'Doc comments',
        text: keyword,
      })
    }
    void fetchComments({ resetPage: true })
  }, 250)
})

onBeforeUnmount(() => {
  if (pathFilterTimer)
    clearTimeout(pathFilterTimer)
})

onMounted(refreshComments)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <TuffInput
          v-model="pathFilter"
          type="text"
          :placeholder="t('dashboard.sections.docComments.filterPlaceholder', 'Filter by doc path…')"
          class="w-56"
        />
        <TxButton size="sm" type="info" :disabled="loading" @click="refreshComments">
          <TxSpinner v-if="loading" :size="14" />
          <span :class="loading ? 'ml-2' : ''">
            {{ t('dashboard.sections.docComments.refresh', 'Refresh') }}
          </span>
        </TxButton>
      </div>
      <NuxtLink
        :to="docsAnalyticsLink()"
        class="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-1.5 text-xs text-black/70 no-underline transition hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]"
      >
        {{ t('dashboard.sections.docComments.analytics', 'View docs analytics') }}
      </NuxtLink>
    </div>

    <div v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
      {{ error }}
    </div>

    <div v-if="loading && !comments.length" class="space-y-3 overflow-x-auto">
      <div class="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
        <TxSpinner :size="16" />
        {{ t('dashboard.sections.docComments.loading', 'Loading comments...') }}
      </div>
      <div v-for="row in 4" :key="row" class="grid grid-cols-[190px_220px_1fr_180px_100px] items-center gap-4 rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
        <TxSkeleton v-for="column in 5" :key="column" :loading="true" :lines="1" />
      </div>
    </div>
    <div v-else-if="!comments.length && !error" class="py-8 text-center text-sm text-black/60 dark:text-white/60">
      {{ t('dashboard.sections.docComments.empty', 'No comments yet.') }}
    </div>
    <div v-else-if="comments.length" class="overflow-x-auto">
      <TxDataTable :columns="commentColumns" :data="comments" row-key="id" :loading="loading" scroll-x>
        <template #cell-author="{ row: comment }">
          <div class="flex min-w-0 items-center gap-3">
            <img
              v-if="comment.userImage"
              :src="comment.userImage"
              :alt="displayAuthor(comment)"
              class="h-8 w-8 shrink-0 rounded-full object-cover"
            >
            <div v-else class="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-black/10 text-xs font-semibold text-black/50 dark:bg-white/10 dark:text-white/50">
              {{ displayAuthor(comment).charAt(0).toUpperCase() }}
            </div>
            <span class="truncate text-sm font-medium text-black dark:text-white" :title="displayAuthor(comment)">
              {{ displayAuthor(comment) }}
            </span>
          </div>
        </template>
        <template #cell-path="{ row: comment }">
          <div class="min-w-0 space-y-1">
            <NuxtLink :to="docsLink(comment.path)" class="block truncate text-sm text-primary no-underline hover:underline" :title="comment.path">
              {{ comment.path }}
            </NuxtLink>
            <NuxtLink
              :to="docsAnalyticsLink(comment.path)"
              class="block text-[11px] text-black/50 no-underline hover:text-black/80 hover:underline dark:text-white/50 dark:hover:text-white/80"
            >
              {{ t('dashboard.sections.docComments.analyticsPath', 'Analytics') }}
            </NuxtLink>
          </div>
        </template>
        <template #cell-comment="{ row: comment }">
          <p class="min-w-[280px] max-w-2xl whitespace-pre-line break-words text-sm text-black/70 dark:text-white/70" :title="comment.content">
            {{ comment.content }}
          </p>
        </template>
        <template #cell-submitted="{ row: comment }">
          <span class="text-sm text-black/60 dark:text-white/60">{{ formatTime(comment.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row: comment }">
          <TxButton size="sm" type="danger" :loading="actionPendingId === comment.id" :disabled="actionsLocked" @click="requestDelete(comment)">
            {{ t('dashboard.sections.docComments.delete', 'Delete') }}
          </TxButton>
        </template>
      </TxDataTable>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
      <span class="text-xs text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.docComments.totalCount', { count: pagination.total }) || `${pagination.total} total` }}
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

  <TxBottomDialog
    v-if="pendingDeleteComment"
    :title="t('dashboard.sections.docComments.confirmDeleteTitle', 'Delete comment')"
    :message="t('dashboard.sections.docComments.confirmDeleteMessage', { path: pendingDeleteComment.path })"
    :btns="[
      { content: t('common.cancel', 'Cancel'), type: 'info', onClick: () => true },
      { content: t('dashboard.sections.docComments.delete', 'Delete'), type: 'error', onClick: confirmDelete },
    ]"
    :close="closeDeleteConfirm"
  />
</template>
