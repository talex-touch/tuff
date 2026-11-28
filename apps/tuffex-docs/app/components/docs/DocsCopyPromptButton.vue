<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { TUFFEX_CURRENT_DOC_KEY } from '~/composables/useTuffexCurrentDoc'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const currentDoc = inject(TUFFEX_CURRENT_DOC_KEY, null)
const rawMarkdownPath = computed(() => currentDoc?.displayMeta.value?.rawMarkdownPath ?? '')
const docTitle = computed(() => currentDoc?.displayMeta.value?.title ?? '')
const copied = ref(false)
const copying = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

const label = computed(() => {
  if (copied.value)
    return isZh.value ? '已复制 Markdown' : 'Copied Markdown'
  return isZh.value ? '复制给 AI / Markdown' : 'Copy page as Markdown'
})

async function handleCopyMarkdown() {
  if (!import.meta.client || copying.value)
    return
  copying.value = true
  try {
    let text = ''
    const rawPath = rawMarkdownPath.value?.trim()
    if (rawPath) {
      const url = rawPath.startsWith('/tuffex/') || /^https?:\/\//i.test(rawPath)
        ? rawPath
        : `/tuffex${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`
      try {
        const res = await fetch(url)
        if (res.ok)
          text = await res.text()
      }
      catch {
        // fall back to rendered text
      }
    }
    if (!text) {
      const prose = document.querySelector<HTMLElement>('.docs-prose')
      text = `# ${docTitle.value || document.title}\n\n${prose?.innerText ?? ''}`.trim()
    }
    if (text && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      copied.value = true
      if (resetTimer)
        clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        copied.value = false
        resetTimer = null
      }, 1800)
    }
  }
  catch {
    // ignore clipboard errors
  }
  finally {
    copying.value = false
  }
}

onBeforeUnmount(() => {
  if (resetTimer)
    clearTimeout(resetTimer)
})
</script>

<template>
  <button
    type="button"
    class="docs-copy-prompt"
    :class="{ 'is-copied': copied }"
    :disabled="copying"
    @click="handleCopyMarkdown"
  >
    <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.docs-copy-prompt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink-regular);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.docs-copy-prompt:hover {
  box-shadow: inset 0 0 0 1px var(--docs-border);
  color: var(--docs-ink);
}

.docs-copy-prompt.is-copied {
  color: var(--tx-color-success, #67c23a);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 40%, transparent);
}
</style>
