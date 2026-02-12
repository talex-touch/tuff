<script setup lang="ts">
import { TxButton, TxAvatar } from '@talex-touch/tuffex'

interface DocComment {
  id: string
  path: string
  userId: string
  userName: string | null
  userImage: string | null
  content: string
  createdAt: number
}

const props = defineProps<{
  docPath: string
}>()

const { t, locale } = useI18n()
const { user, isAuthenticated } = useAuthUser()

const comments = ref<DocComment[]>([])
const loading = ref(false)
const submitting = ref(false)
const newComment = ref('')

const normalizedPath = computed(() =>
  props.docPath.replace(/^\/+|\/+$/g, '').toLowerCase(),
)

async function fetchComments() {
  if (!normalizedPath.value)
    return
  loading.value = true
  try {
    const result = await $fetch('/api/docs/comments', {
      method: 'GET',
      query: { path: normalizedPath.value },
    })
    comments.value = result.comments ?? []
  }
  catch (error) {
    console.warn('[docs-comments] Failed to fetch comments:', error)
  }
  finally {
    loading.value = false
  }
}

async function submitComment() {
  const content = newComment.value.trim()
  if (!content || submitting.value)
    return

  submitting.value = true
  try {
    const result = await $fetch('/api/docs/comments', {
      method: 'POST',
      body: { path: normalizedPath.value, content },
    })
    if (result.comment) {
      comments.value.unshift(result.comment)
      newComment.value = ''
    }
  }
  catch (error) {
    console.warn('[docs-comments] Failed to submit comment:', error)
  }
  finally {
    submitting.value = false
  }
}

async function deleteComment(commentId: string) {
  try {
    await $fetch(`/api/docs/comments/${commentId}`, { method: 'DELETE' })
    comments.value = comments.value.filter(c => c.id !== commentId)
  }
  catch (error) {
    console.warn('[docs-comments] Failed to delete comment:', error)
  }
}

function canDelete(comment: DocComment) {
  if (!user.value)
    return false
  return user.value.id === comment.userId || user.value.role === 'admin'
}

function formatTimeAgo(timestamp: number) {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const isZh = locale.value === 'zh'

  if (days > 30) {
    return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
    }).format(new Date(timestamp))
  }
  if (days > 0)
    return isZh ? `${days} 天前` : `${days}d ago`
  if (hours > 0)
    return isZh ? `${hours} 小时前` : `${hours}h ago`
  if (minutes > 0)
    return isZh ? `${minutes} 分钟前` : `${minutes}m ago`
  return isZh ? '刚刚' : 'just now'
}

function displayName(comment: DocComment) {
  return comment.userName || (locale.value === 'zh' ? '匿名用户' : 'Anonymous')
}

onMounted(() => {
  fetchComments()
})

watch(() => props.docPath, () => {
  fetchComments()
})
</script>

<template>
  <section class="docs-comments">
    <h3 class="docs-comments__title">
      <span class="i-carbon-chat text-lg" />
      {{ t('docs.commentsTitle') }}
      <span v-if="comments.length" class="docs-comments__count">{{ comments.length }}</span>
    </h3>

    <!-- Comment form -->
    <div v-if="isAuthenticated" class="docs-comments__form">
      <div class="docs-comments__form-row">
        <TxAvatar
          :src="user?.image || undefined"
          :name="user?.name || 'U'"
          size="32"
          class="docs-comments__form-avatar"
        />
        <textarea
          v-model="newComment"
          :placeholder="t('docs.commentPlaceholder')"
          class="docs-comments__input"
          rows="3"
          maxlength="2000"
          @keydown.meta.enter="submitComment"
          @keydown.ctrl.enter="submitComment"
        />
      </div>
      <div class="docs-comments__form-actions">
        <span class="docs-comments__form-hint">
          {{ t('docs.commentHint') }}
        </span>
        <TxButton size="sm" :disabled="!newComment.trim() || submitting" :loading="submitting" @click="submitComment">
          {{ t('docs.commentSubmit') }}
        </TxButton>
      </div>
    </div>
    <div v-else class="docs-comments__login-hint">
      <span class="i-carbon-locked text-base" />
      {{ t('docs.commentLoginRequired') }}
    </div>

    <!-- Comments list -->
    <div v-if="loading" class="docs-comments__loading">
      <span class="i-carbon-circle-dash animate-spin text-base" />
      {{ t('docs.commentsLoading') }}
    </div>
    <div v-else-if="comments.length === 0" class="docs-comments__empty">
      {{ t('docs.commentsEmpty') }}
    </div>
    <ul v-else class="docs-comments__list">
      <li v-for="comment in comments" :key="comment.id" class="docs-comments__item">
        <TxAvatar
          :src="comment.userImage || undefined"
          :name="displayName(comment)"
          size="28"
          class="docs-comments__item-avatar"
        />
        <div class="docs-comments__item-body">
          <div class="docs-comments__item-header">
            <span class="docs-comments__item-name">{{ displayName(comment) }}</span>
            <span class="docs-comments__item-time">{{ formatTimeAgo(comment.createdAt) }}</span>
            <button
              v-if="canDelete(comment)"
              class="docs-comments__item-delete"
              :title="t('docs.commentDelete')"
              @click="deleteComment(comment.id)"
            >
              <span class="i-carbon-trash-can" />
            </button>
          </div>
          <p class="docs-comments__item-content">
            {{ comment.content }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.docs-comments {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

:root.dark .docs-comments {
  border-top-color: rgba(255, 255, 255, 0.05);
}

.docs-comments__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 1.25rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--fgColor-default, #0f172a);
}

:root.dark .docs-comments__title {
  color: rgba(248, 250, 252, 0.92);
}

.docs-comments__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.5);
}

:root.dark .docs-comments__count {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.docs-comments__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 1.5rem;
}

.docs-comments__form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.docs-comments__form-avatar {
  flex-shrink: 0;
  margin-top: 4px;
}

.docs-comments__input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
  font-size: 14px;
  line-height: 1.6;
  color: var(--fgColor-default, #0f172a);
  resize: vertical;
  min-height: 72px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.docs-comments__input:focus {
  outline: none;
  border-color: var(--color-primary, #6a5546);
  box-shadow: 0 0 0 3px rgba(106, 85, 70, 0.1);
}

:root.dark .docs-comments__input {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(248, 250, 252, 0.92);
}

:root.dark .docs-comments__input:focus {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
}

.docs-comments__input::placeholder {
  color: rgba(0, 0, 0, 0.35);
}

:root.dark .docs-comments__input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.docs-comments__form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 44px;
}

.docs-comments__form-hint {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}

:root.dark .docs-comments__form-hint {
  color: rgba(255, 255, 255, 0.3);
}

.docs-comments__login-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  margin-bottom: 1.5rem;
  border-radius: 12px;
  border: 1px dashed rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
}

:root.dark .docs-comments__login-hint {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.4);
}

.docs-comments__loading,
.docs-comments__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.4);
}

:root.dark .docs-comments__loading,
:root.dark .docs-comments__empty {
  color: rgba(255, 255, 255, 0.35);
}

.docs-comments__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.docs-comments__item {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.docs-comments__item:last-child {
  border-bottom: none;
}

:root.dark .docs-comments__item {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}

.docs-comments__item-avatar {
  flex-shrink: 0;
  margin-top: 2px;
}

.docs-comments__item-body {
  flex: 1;
  min-width: 0;
}

.docs-comments__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.docs-comments__item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--fgColor-default, #0f172a);
}

:root.dark .docs-comments__item-name {
  color: rgba(248, 250, 252, 0.9);
}

.docs-comments__item-time {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}

:root.dark .docs-comments__item-time {
  color: rgba(255, 255, 255, 0.3);
}

.docs-comments__item-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  font-size: 14px;
}

.docs-comments__item-delete:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

:root.dark .docs-comments__item-delete {
  color: rgba(255, 255, 255, 0.25);
}

:root.dark .docs-comments__item-delete:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}

.docs-comments__item-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--fgColor-default, #0f172a);
  white-space: pre-wrap;
  word-break: break-word;
}

:root.dark .docs-comments__item-content {
  color: rgba(226, 232, 240, 0.85);
}
</style>
