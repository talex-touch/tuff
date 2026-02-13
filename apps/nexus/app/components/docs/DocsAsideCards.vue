<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'

const query = ref('')
const assistantExpanded = ref(false)
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
const isZh = computed(() => locale.value === 'zh')
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
const assistantTitle = computed(() => 'Tuff Assistant')
const assistantMeta = computed(() => (isZh.value
  ? 'Tool calling · 文档解析'
  : 'Tool calling · Doc parsing'
))
const assistantDescription = computed(() => (isZh.value
  ? 'AI 需要时会解析当前文档并调用工具。'
  : 'The assistant parses the current doc and calls tools when needed.'
))
const assistantPlaceholder = computed(() => (isZh.value ? '输入问题或粘贴错误...' : 'Ask docs or paste an issue...'))
const assistantAriaLabel = computed(() => (assistantExpanded.value
  ? (isZh.value ? '收起 Tuff Assistant' : 'Collapse Tuff Assistant')
  : (isZh.value ? '展开 Tuff Assistant' : 'Expand Tuff Assistant')
))

function buildDiscussionBody(question: string) {
  const contextLines: string[] = []
  if (docTitle.value)
    contextLines.push(`Doc: ${docTitle.value}`)
  if (docPath.value)
    contextLines.push(`Path: ${docPath.value}`)
  if (!contextLines.length)
    return question
  return `${question}\n\n---\n${contextLines.join('\n')}`
}

function handleAsk(value?: string) {
  const text = (value ?? query.value).trim()
  if (!text || !hasWindow())
    return
  const params = new URLSearchParams({
    category: 'Q&A',
    title: text,
    body: buildDiscussionBody(text),
  })
  const url = `https://github.com/talex-touch/tuff/discussions/new?${params.toString()}`
  window.open(url, '_blank', 'noopener')
}

function toggleAssistant() {
  assistantExpanded.value = !assistantExpanded.value
}
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

    <div class="docs-aside-card">
      <div class="docs-aside-card__header">
        <div class="docs-aside-card__title">
          <span class="docs-aside-card__sparkle">✦</span>
          {{ assistantTitle }}
        </div>
        <TxButton
          variant="ghost"
          size="mini"
          class="docs-aside-card__toggle"
          native-type="button"
          :aria-label="assistantAriaLabel"
          @click="toggleAssistant"
        >
          <span :class="assistantExpanded ? 'i-carbon-chevron-up' : 'i-carbon-search'" class="text-sm" />
        </TxButton>
      </div>
      <p class="docs-aside-card__meta">
        {{ assistantMeta }}
      </p>
      <p v-if="assistantExpanded" class="docs-aside-card__desc">
        {{ assistantDescription }}
      </p>
      <form v-if="assistantExpanded" class="docs-aside-card__field" @submit.prevent="handleAsk">
        <TxSearchInput v-model="query" :placeholder="assistantPlaceholder" clearable @search="handleAsk" />
      </form>
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
</template>

<style scoped>
.docs-aside-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-aside-card {
  border-radius: 18px;
  border: 0;
  background: transparent;
  padding: 16px;
  box-shadow: none;
}

.docs-aside-card--notice {
  border: 1px solid rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.12);
}

.docs-aside-card--notice .docs-aside-card__sparkle {
  color: #f59e0b;
}

.docs-aside-cards--chrome .docs-aside-card {
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.08);
}

.docs-aside-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(15, 23, 42, 0.9);
}

.docs-aside-card__sparkle {
  color: #3b82f6;
  font-size: 14px;
}

.docs-aside-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.docs-aside-card__toggle {
  color: rgba(100, 116, 139, 0.9);
}

.docs-aside-card__meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.docs-aside-card__desc {
  margin: 8px 0 12px;
  font-size: 13px;
  color: rgba(100, 116, 139, 0.9);
}

.docs-aside-card__field {
  position: relative;
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
  padding: 6px 6px;
  border-radius: 10px;
  color: rgba(100, 116, 139, 0.9);
  text-decoration: none;
  transition: color 0.2s ease, background 0.2s ease;
}

.docs-aside-card__link-icon {
  font-size: 14px;
  color: rgba(148, 163, 184, 0.9);
  transition: color 0.2s ease;
}

.docs-aside-card__link:hover {
  color: rgba(15, 23, 42, 0.95);
  background: rgba(248, 250, 252, 0.9);
}

.docs-aside-card__link:hover .docs-aside-card__link-icon {
  color: rgba(100, 116, 139, 0.9);
}

:global(.dark .docs-aside-card),
:global([data-theme='dark'] .docs-aside-card) {
  background: transparent;
}

:global(.dark .docs-aside-cards--chrome .docs-aside-card),
:global([data-theme='dark'] .docs-aside-cards--chrome .docs-aside-card) {
  border-color: rgba(71, 85, 105, 0.4);
  box-shadow: 0 18px 30px rgba(0, 0, 0, 0.35);
}

:global(.dark .docs-aside-card__title),
:global([data-theme='dark'] .docs-aside-card__title) {
  color: rgba(248, 250, 252, 0.92);
}

:global(.dark .docs-aside-card__desc),
:global([data-theme='dark'] .docs-aside-card__desc),
:global(.dark .docs-aside-card__link),
:global([data-theme='dark'] .docs-aside-card__link) {
  color: rgba(226, 232, 240, 0.78);
}

:global(.dark .docs-aside-card__input),
:global([data-theme='dark'] .docs-aside-card__input) {
  background: rgba(2, 6, 23, 0.7);
  color: rgba(248, 250, 252, 0.92);
  border-color: rgba(51, 65, 85, 0.7);
}

:global(.dark .docs-aside-card__send),
:global([data-theme='dark'] .docs-aside-card__send) {
  color: rgba(148, 163, 184, 0.85);
}

:global(.dark .docs-aside-card__send:hover),
:global([data-theme='dark'] .docs-aside-card__send:hover) {
  background: rgba(51, 65, 85, 0.6);
  color: rgba(226, 232, 240, 0.9);
}

:global(.dark .docs-aside-card__link:hover),
:global([data-theme='dark'] .docs-aside-card__link:hover) {
  background: rgba(30, 41, 59, 0.6);
}

:global(.dark .docs-aside-card__link-icon),
:global([data-theme='dark'] .docs-aside-card__link-icon) {
  color: rgba(148, 163, 184, 0.7);
}

:global(.dark .docs-aside-card__link:hover .docs-aside-card__link-icon),
:global([data-theme='dark'] .docs-aside-card__link:hover .docs-aside-card__link-icon) {
  color: rgba(226, 232, 240, 0.85);
}
::global(.dark .docs-aside-card--notice),
::global([data-theme='dark'] .docs-aside-card--notice) {
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.1);
}
</style>
