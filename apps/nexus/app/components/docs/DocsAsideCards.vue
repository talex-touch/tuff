<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'

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
const assistantTriggerRef = ref<HTMLElement | null>(null)
const assistantTriggerEl = computed(() => assistantTriggerRef.value)
const assistantAriaLabel = computed(() => (locale.value === 'zh' ? '打开 Tuff Assistant' : 'Open Tuff Assistant'))
</script>

<template>
  <section class="docs-aside-cards" :class="{ 'docs-aside-cards--chrome': showCardChrome }">
    <div v-if="showAiNotice" class="docs-aside-card docs-aside-card--notice">
      <div class="docs-aside-card__title">
        <span class="docs-aside-card__sparkle">⚠</span>
        {{ aiTitle }}
      </div>
      <p class="docs-aside-card__desc">
        {{ aiDescription }}
      </p>
    </div>

    <div class="docs-aside-card docs-aside-card--assistant">
      <button
        ref="assistantTriggerRef"
        type="button"
        class="docs-aside-assistant"
        :aria-label="assistantAriaLabel"
        @click="assistantOpen = true"
      >
        <span class="docs-aside-assistant__spark">✦</span>
        <span class="docs-aside-assistant__label">Tuff Assistant</span>
        <span class="docs-aside-assistant__arrow i-carbon-chevron-right" />
      </button>
    </div>

    <div class="docs-aside-card">
      <div class="docs-aside-card__title">
        Help
      </div>
      <ul class="docs-aside-card__list">
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff/issues/new/choose" target="_blank" rel="noreferrer">
            <span>Report an Issue</span>
            <span class="docs-aside-card__link-icon i-carbon-flag" />
          </a>
        </li>
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff/discussions" target="_blank" rel="noreferrer">
            <span>Request Feature</span>
            <span class="docs-aside-card__link-icon i-carbon-add" />
          </a>
        </li>
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff" target="_blank" rel="noreferrer">
            <span>View Repository</span>
            <span class="docs-aside-card__link-icon i-carbon-code" />
          </a>
        </li>
      </ul>
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

.docs-aside-card--assistant {
  padding: 8px 10px;
}

.docs-aside-assistant {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  padding: 12px 12px;
  border-radius: 14px;
  color: var(--tx-text-color-primary, #303133);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 86%, transparent);
  cursor: pointer;
  font: inherit;
  transition:
    background var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-assistant:hover,
.docs-aside-assistant:focus-visible {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  outline: none;
}

.docs-aside-assistant__spark {
  color: var(--tx-color-primary, #409eff);
  font-size: 14px;
}

.docs-aside-assistant__label {
  flex: 1;
  text-align: left;
  padding-left: 8px;
  font-size: 13px;
  font-weight: 600;
}

.docs-aside-assistant__arrow {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
}

.docs-aside-card__list {
  list-style: none;
  padding: 10px 0 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.docs-aside-card__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: var(--tx-text-color-secondary, #909399);
  text-decoration: none;
  transition:
    color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    background var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-card__link-icon {
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
  transition: color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-card__link:hover {
  color: var(--tx-text-color-primary, #303133);
  border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 90%, transparent);
}

.docs-aside-card__link:hover .docs-aside-card__link-icon {
  color: var(--tx-color-primary, #409eff);
}

.docs-aside-card__input {
  background: var(--tx-bg-color-overlay, #ffffff);
  color: var(--tx-text-color-primary, #303133);
  border-color: var(--tx-border-color-light, #e4e7ed);
}

.docs-aside-card__send {
  color: var(--tx-text-color-secondary, #909399);
}

.docs-aside-card__send:hover {
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent);
  color: var(--tx-text-color-primary, #303133);
}
</style>
