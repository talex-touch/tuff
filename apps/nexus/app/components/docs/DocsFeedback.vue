<script setup lang="ts">
const props = defineProps<{
  docPath: string
}>()

const { t, locale } = useI18n()
const { user, isAuthenticated } = useAuthUser()

const helpful = ref(0)
const unhelpful = ref(0)
const userVote = ref<boolean | null>(null)
const loading = ref(false)
const submitting = ref(false)

const normalizedPath = computed(() =>
  props.docPath.replace(/^\/+|\/+$/g, '').toLowerCase(),
)

async function fetchFeedback() {
  if (!normalizedPath.value)
    return
  loading.value = true
  try {
    const query: Record<string, string> = { path: normalizedPath.value }
    if (user.value?.id)
      query.userId = user.value.id
    const result = await $fetch('/api/docs/feedback', { query })
    helpful.value = result.helpful ?? 0
    unhelpful.value = result.unhelpful ?? 0
    userVote.value = result.userVote ?? null
  }
  catch {
    // silently fail
  }
  finally {
    loading.value = false
  }
}

async function vote(isHelpful: boolean) {
  if (!isAuthenticated.value || submitting.value)
    return

  submitting.value = true
  try {
    const result = await $fetch('/api/docs/feedback', {
      method: 'POST',
      body: { path: normalizedPath.value, helpful: isHelpful },
    })
    userVote.value = result.userVote ?? null
    // Refetch counts
    await fetchFeedback()
  }
  catch {
    // silently fail
  }
  finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchFeedback()
})

watch(() => props.docPath, () => {
  fetchFeedback()
})
</script>

<template>
  <div class="docs-feedback">
    <span class="docs-feedback__label">
      {{ t('docs.feedbackLabel', 'Was this helpful?') }}
    </span>
    <button
      class="docs-feedback__btn"
      :class="{ 'is-active': userVote === true }"
      :disabled="!isAuthenticated || submitting"
      :title="isAuthenticated ? t('docs.feedbackHelpful', 'Yes') : t('docs.feedbackLoginRequired', 'Sign in to vote')"
      @click="vote(true)"
    >
      <span class="i-carbon-thumbs-up" />
      <span v-if="helpful > 0" class="docs-feedback__count">{{ helpful }}</span>
    </button>
    <button
      class="docs-feedback__btn"
      :class="{ 'is-active': userVote === false }"
      :disabled="!isAuthenticated || submitting"
      :title="isAuthenticated ? t('docs.feedbackUnhelpful', 'No') : t('docs.feedbackLoginRequired', 'Sign in to vote')"
      @click="vote(false)"
    >
      <span class="i-carbon-thumbs-down" />
      <span v-if="unhelpful > 0" class="docs-feedback__count">{{ unhelpful }}</span>
    </button>
  </div>
</template>

<style scoped>
.docs-feedback {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.docs-feedback__label {
  color: rgba(0, 0, 0, 0.45);
}

:root.dark .docs-feedback__label {
  color: rgba(255, 255, 255, 0.4);
}

.docs-feedback__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  background: transparent;
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.docs-feedback__btn:hover:not(:disabled) {
  border-color: rgba(0, 0, 0, 0.2);
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.03);
}

.docs-feedback__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.docs-feedback__btn.is-active {
  border-color: var(--color-primary, #6a5546);
  color: var(--color-primary, #6a5546);
  background: rgba(106, 85, 70, 0.06);
}

:root.dark .docs-feedback__btn {
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
}

:root.dark .docs-feedback__btn:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
}

:root.dark .docs-feedback__btn.is-active {
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.08);
}

.docs-feedback__count {
  font-weight: 600;
  font-size: 12px;
}
</style>
