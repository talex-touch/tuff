<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  assistantOpenRequest?: number
  assistantSource?: HTMLElement | null
}>(), {
  assistantOpenRequest: 0,
  assistantSource: null,
})

const LazyDocsAssistantDialog = defineAsyncComponent(() => import('./DocsAssistantDialog.vue'))

const runtimeConfig = useRuntimeConfig()
const { locale } = useI18n()
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
const docTitleState = useState<string>('docs-title', () => '')
const showCardChrome = computed(() => {
  const value = runtimeConfig.public?.docs?.asideCardChrome as string | boolean | undefined
  if (value === true)
    return true
  if (typeof value === 'string')
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  return false
})
const isComponentDoc = computed(() => {
  const path = typeof docMetaState.value?.path === 'string' ? docMetaState.value.path : ''
  return path.includes('/docs/dev/components/')
})
const SYNC_STATUS_ALIASES: Record<string, 'not_started' | 'in_progress' | 'migrated' | 'verified'> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const normalizedSyncStatus = computed(() => {
  if (docMetaState.value?.verified === true)
    return 'verified'
  const raw = typeof docMetaState.value?.syncStatus === 'string'
    ? docMetaState.value.syncStatus.trim()
    : ''
  return SYNC_STATUS_ALIASES[raw] ?? 'not_started'
})

const isVerified = computed(() => normalizedSyncStatus.value === 'verified')
const showAiNotice = computed(() => (
  isComponentDoc.value
  && !isVerified.value
  && normalizedSyncStatus.value === 'migrated'
))
const aiTitle = computed(() => (locale.value === 'zh' ? 'AI Generated' : 'AI Generated'))
const aiDescription = computed(() => (locale.value === 'zh'
  ? 'AI 生成内容，仅供参考。最终以 Verified 文档为准。'
  : 'AI generated content for reference only. Please rely on Verified docs.'
))
const docTitle = computed(() => {
  if (docTitleState.value)
    return docTitleState.value
  const rawTitle = docMetaState.value?.title
  return typeof rawTitle === 'string' ? rawTitle.trim() : ''
})
const docPath = computed(() => {
  const path = docMetaState.value?.path
  return typeof path === 'string' ? path.trim() : ''
})
const assistantContextState = useState<string>('docs-assistant-context', () => '')
const assistantContext = computed(() => {
  const value = assistantContextState.value
  return typeof value === 'string' ? value : ''
})
const assistantOpen = ref(false)
const assistantTriggerEl = computed(() => props.assistantSource)

watch(
  () => props.assistantOpenRequest,
  (request) => {
    if (request > 0)
      assistantOpen.value = true
  },
  { immediate: true },
)
</script>

<template>
  <section v-if="showAiNotice" class="docs-aside-cards" :class="{ 'docs-aside-cards--chrome': showCardChrome }">
    <div v-if="showAiNotice" class="docs-aside-card docs-aside-card--notice">
      <div class="docs-aside-card__title">
        <span class="docs-aside-card__sparkle">⚠</span>
        {{ aiTitle }}
      </div>
      <p class="docs-aside-card__desc">
        {{ aiDescription }}
      </p>
    </div>
  </section>

  <LazyDocsAssistantDialog
    v-if="assistantOpen"
    v-model="assistantOpen"
    :source="assistantTriggerEl"
    :doc-title="docTitle"
    :doc-path="docPath"
    :doc-context="assistantContext"
  />
</template>

<style scoped>
.docs-aside-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-aside-card {
  border-radius: var(--tx-border-radius-round, 18px);
  border: 1px solid transparent;
  background: transparent;
  padding: 16px;
  box-shadow: none;
}

.docs-aside-card--notice {
  border-color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 16%, transparent);
}

.docs-aside-card--notice .docs-aside-card__sparkle {
  color: var(--tx-color-warning, #e6a23c);
}

.docs-aside-cards--chrome .docs-aside-card {
  border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 92%, transparent);
  box-shadow: var(--tx-box-shadow-light, 0px 0px 12px rgba(0, 0, 0, 0.12));
}

.docs-aside-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--tx-text-color-primary, #303133);
}

.docs-aside-card__sparkle {
  color: var(--tx-color-primary, #409eff);
  font-size: 14px;
}

.docs-aside-card__desc {
  margin: 8px 0 12px;
  font-size: 13px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
