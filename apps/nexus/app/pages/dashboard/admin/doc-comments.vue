<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

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

const isAdmin = computed(() => user.value?.role === 'admin')

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

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

const pagination = reactive({
  limit: 20,
  offset: 0,
})

const comments = ref<DocComment[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
const pathFilter = ref('')

const hasMore = computed(() => comments.value.length < total.value)
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)

async function loadComments(options: { reset?: boolean } = {}) {
  if (loading.value)
    return

  loading.value = true
  error.value = null

  const reset = options.reset ?? false
  const offset = reset ? 0 : comments.value.length
  if (reset)
    pagination.offset = 0

  try {
    const query: Record<string, any> = {
      limit: pagination.limit,
      offset,
    }
    if (pathFilter.value.trim())
      query.path = pathFilter.value.trim()

    const response = await $fetch<DocCommentListResponse>('/api/admin/doc-comments', { query })

    total.value = response.total ?? 0
    if (reset)
      comments.value = response.comments ?? []
    else
      comments.value = [...comments.value, ...(response.comments ?? [])]
  }
  catch (err: unknown) {
    error.value = err instanceof Error
      ? err.message
      : t('dashboard.sections.docComments.loadFailed', 'Unable to load comments.')
  }
  finally {
    loading.value = false
  }
}

async function refreshComments() {
  await loadComments({ reset: true })
}

async function loadMore() {
  if (!hasMore.value || loading.value)
    return
  await loadComments()
}

async function handleDelete(comment: DocComment) {
  if (actionPendingId.value)
    return

  actionPendingId.value = comment.id

  try {
    await $fetch(`/api/admin/doc-comments/${comment.id}`, { method: 'DELETE' })
    toast.success(t('dashboard.sections.docComments.deleteSuccess', 'Comment deleted.'))
    await refreshComments()
  }
  catch (err: unknown) {
    const fallback = t('dashboard.sections.docComments.deleteFailed', 'Failed to delete comment.')
    toast.warning(err instanceof Error ? err.message : fallback)
  }
  finally {
    actionPendingId.value = null
  }
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function docsLink(path: string) {
  return `/docs/${path}`
}

let pathFilterTimer: ReturnType<typeof setTimeout> | null = null

watch(pathFilter, () => {
  if (pathFilterTimer)
    clearTimeout(pathFilterTimer)
  pathFilterTimer = setTimeout(() => {
    refreshComments()
  }, 250)
})

onBeforeUnmount(() => {
  if (pathFilterTimer)
    clearTimeout(pathFilterTimer)
})

onMounted(() => {
  refreshComments()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.docComments.title', 'Doc Comments') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.docComments.subtitle', 'Moderate and manage documentation comments.') }}
      </p>
    </div>

    <section class="apple-card-lg p-5">
      <div>
        <h2 class="text-base font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.docComments.listTitle', 'All comments') }}
        </h2>
        <p class="text-xs text-black/50 dark:text-white/50">
          {{ t('dashboard.sections.docComments.totalCount', '{count} total', { count: total }) }}
        </p>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3">
        <input
          v-model="pathFilter"
          type="text"
          :placeholder="t('dashboard.sections.docComments.filterPlaceholder', 'Filter by doc path…')"
          class="h-8 w-48 rounded-lg border border-black/10 bg-transparent px-3 text-xs text-black outline-none transition dark:border-white/10 dark:text-white focus:border-primary/50"
        >
        <TxButton size="small" type="secondary" :disabled="loading" @click="refreshComments">
          <TxSpinner v-if="loading" :size="14" />
          <span class="ml-2">
            {{ t('dashboard.sections.docComments.refresh', 'Refresh') }}
          </span>
        </TxButton>
      </div>

      <div v-if="loading && !comments.length" class="mt-4 space-y-3">
        <div class="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.docComments.loading', 'Loading comments...') }}
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
      <div v-else-if="error" class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        {{ error }}
      </div>
      <div v-else-if="!comments.length" class="mt-4 text-sm text-black/60 dark:text-white/60">
        {{ t('dashboard.sections.docComments.empty', 'No comments yet.') }}
      </div>
      <div v-else class="mt-4 space-y-4">
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <img
                v-if="comment.userImage"
                :src="comment.userImage"
                :alt="comment.userName || 'User'"
                class="h-7 w-7 rounded-full object-cover"
              >
              <div
                v-else
                class="h-7 w-7 flex items-center justify-center rounded-full bg-black/10 text-xs font-semibold text-black/50 dark:bg-white/10 dark:text-white/50"
              >
                {{ (comment.userName || 'U').charAt(0).toUpperCase() }}
              </div>
              <div>
                <span class="text-sm font-semibold text-black dark:text-white">
                  {{ comment.userName || t('dashboard.sections.docComments.anonymous', 'Anonymous') }}
                </span>
                <span class="ml-2 text-xs text-black/40 dark:text-white/40">
                  {{ formatTime(comment.createdAt) }}
                </span>
              </div>
            </div>
            <NuxtLink
              :to="docsLink(comment.path)"
              class="text-xs text-primary no-underline hover:underline"
            >
              {{ comment.path }}
            </NuxtLink>
          </div>

          <div class="mt-3 text-sm text-black/70 dark:text-white/70">
            <p class="whitespace-pre-line">
              {{ comment.content }}
            </p>
          </div>

          <div class="mt-3 flex items-center justify-end">
            <TxButton size="small" type="danger" :loading="actionPendingId === comment.id" :disabled="actionsLocked" @click="handleDelete(comment)">
              {{ t('dashboard.sections.docComments.delete', 'Delete') }}
            </TxButton>
          </div>
        </article>
      </div>

      <div v-if="hasMore" class="mt-5 flex justify-center">
        <TxButton size="small" type="secondary" :loading="loading" @click="loadMore">
          {{ t('dashboard.sections.docComments.loadMore', 'Load more') }}
        </TxButton>
      </div>
    </section>
  </div>
</template>
