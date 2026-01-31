<script setup lang="ts">
import { computed, ref } from 'vue'

const query = ref('')
const runtimeConfig = useRuntimeConfig()
const { locale } = useI18n()
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
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
const isVerified = computed(() => docMetaState.value?.verified === true)
const showAiNotice = computed(() => isComponentDoc.value && !isVerified.value)
const aiTitle = computed(() => (locale.value === 'zh' ? 'AI Generated' : 'AI Generated'))
const aiDescription = computed(() => (locale.value === 'zh'
  ? 'AI 生成内容，仅供参考。最终以 Verified 文档为准。'
  : 'AI generated content for reference only. Please rely on Verified docs.'
))

function handleAsk() {
  const text = query.value.trim()
  if (!text || typeof window === 'undefined')
    return
  const url = `https://github.com/talex-touch/tuff/discussions/new?category=Q%26A&title=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
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
      <div class="docs-aside-card__title">
        <span class="docs-aside-card__sparkle">✦</span>
        Zen Assistant
      </div>
      <p class="docs-aside-card__desc">
        Get instant help with component implementation.
      </p>
      <form class="docs-aside-card__field" @submit.prevent="handleAsk">
        <input
          v-model="query"
          type="text"
          placeholder="Ask docs..."
          class="docs-aside-card__input"
        >
        <button type="submit" class="docs-aside-card__send" aria-label="Ask Zen Assistant">
          <span class="i-carbon-arrow-right" />
        </button>
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

.docs-aside-card__desc {
  margin: 8px 0 12px;
  font-size: 13px;
  color: rgba(100, 116, 139, 0.9);
}

.docs-aside-card__field {
  position: relative;
}

.docs-aside-card__input {
  width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 1);
  padding: 10px 36px 10px 14px;
  font-size: 13px;
  background: rgba(248, 250, 252, 0.9);
  color: rgba(15, 23, 42, 0.9);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.docs-aside-card__input:focus {
  border-color: rgba(147, 197, 253, 0.9);
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.25);
}

.docs-aside-card__send {
  position: absolute;
  right: 6px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  cursor: pointer;
  transition: all 0.2s ease;
  transform: translateY(-50%);
}

.docs-aside-card__send:hover {
  background: rgba(226, 232, 240, 0.7);
  color: rgba(71, 85, 105, 0.9);
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
