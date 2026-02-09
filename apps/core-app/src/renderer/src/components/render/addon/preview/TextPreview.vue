<script setup lang="ts" name="TextPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  item: TuffItem
  searchQuery?: string
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const textContent = ref('')
const loading = ref(false)
const error = ref('')
const contentRef = ref<HTMLElement | null>(null)

// 200 KB
const MAX_PREVIEW_SIZE = 200 * 1024

const canPreview = computed(() => {
  const fileSize = props.item.meta?.file?.size
  // If size is explicitly 0, the file is empty
  if (fileSize === 0) return false
  // If size is unknown (undefined/null), still attempt to fetch
  if (fileSize == null) return true
  return fileSize <= MAX_PREVIEW_SIZE
})

const fileSizeDescription = computed(() => {
  const fileSize = props.item.meta?.file?.size
  if (!fileSize) return ''

  if (fileSize < 1024) {
    return `${fileSize} B`
  } else if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`
  } else {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
  }
})

/** Escape HTML special characters */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Highlight all occurrences of `query` in `text` (case-insensitive) */
function highlightText(text: string, query: string): string {
  if (!query || !query.trim()) return escapeHtml(text)

  const escaped = escapeHtml(text)
  const escapedQuery = escapeHtml(query.trim())
  const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>')
}

const highlightedContent = computed(() => {
  if (!textContent.value) return ''

  const query = props.searchQuery?.trim()
  if (!query) return escapeHtml(textContent.value)

  return textContent.value
    .split('\n')
    .map((line) => highlightText(line, query))
    .join('\n')
})

const hasHighlights = computed(() => {
  return !!props.searchQuery?.trim() && highlightedContent.value.includes('search-highlight')
})

function scrollToFirstMatch() {
  nextTick(() => {
    const mark = contentRef.value?.querySelector('.search-highlight')
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

watch(hasHighlights, (v) => {
  if (v) scrollToFirstMatch()
})

async function loadContent() {
  if (!props.item.meta?.file?.path) {
    error.value = t('textPreview.error.noFile')
    return
  }

  if (!canPreview.value) {
    error.value =
      props.item.meta?.file?.size === 0
        ? t('textPreview.error.emptyFile')
        : t('textPreview.error.fileTooLarge', { size: fileSizeDescription.value })
    return
  }

  loading.value = true
  try {
    const filePath = props.item.meta.file.path
    if (isElectronRenderer() && transport) {
      // Use IPC channel for file reading in Electron
      const tfileUrl = buildTfileUrl(filePath)
      textContent.value = await transport.send(AppEvents.system.readFile, { source: tfileUrl })
    } else {
      // Fallback to fetch for non-Electron environments
      const url = buildTfileUrl(filePath)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      textContent.value = await response.text()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('textPreview.error.loadFailed')
    console.error('TextPreview error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadContent)
</script>

<template>
  <div class="TextPreview">
    <div v-if="loading" class="loading">
      <div class="loading-spinner" />
      <span>{{ t('textPreview.loading') }}</span>
    </div>
    <div v-else-if="error" class="error">
      <div class="error-icon">
        <i class="i-ri-error-warning-line" />
      </div>
      <div class="error-message">
        {{ error }}
      </div>
    </div>
    <!-- eslint-disable vue/no-v-html -->
    <pre
      v-else-if="searchQuery?.trim()"
      ref="contentRef"
      class="highlighted-content"
      v-html="highlightedContent"
    />
    <!-- eslint-enable vue/no-v-html -->
    <pre v-else>{{ textContent }}</pre>
  </div>
</template>

<style lang="scss" scoped>
.TextPreview {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;

  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    flex: 1;
    margin: 0;
    padding: 1rem;
    font-size: 12px;
    line-height: 1.6;
  }

  .highlighted-content {
    :deep(.search-highlight) {
      background-color: var(--el-color-warning-light-5);
      color: var(--el-text-color-primary);
      border-radius: 2px;
      padding: 0 1px;
    }
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--el-text-color-regular);

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--el-border-color);
      border-top: 2px solid var(--el-color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }

  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--el-color-danger);

    .error-icon {
      font-size: 2rem;
    }

    .error-message {
      text-align: center;
      max-width: 80%;
      word-wrap: break-word;
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
