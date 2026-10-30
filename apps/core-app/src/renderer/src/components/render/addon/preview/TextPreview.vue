<script setup lang="ts" name="TextPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createRendererLogger } from '~/utils/renderer-log'
import { decodeText, readPreviewBytes, type TextEncodingSelection } from './text-encoding'
import { splitHighlightedText } from './text-highlight'

const props = defineProps<{
  item: TuffItem
  searchQuery?: string
  resourceUrl: string
  encoding?: TextEncodingSelection
}>()

const emit = defineEmits<{
  (event: 'encodingDetected', encoding: Exclude<TextEncodingSelection, 'auto'>): void
}>()

const { t, locale } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const textPreviewLog = createRendererLogger('TextPreview')
const textContent = ref('')
const loading = ref(false)
const error = ref('')
const contentRef = ref<HTMLElement | null>(null)
const rawBytes = ref<Uint8Array | null>(null)

// 200 KB
const MAX_PREVIEW_SIZE = 200 * 1024
const READ_TIMEOUT_MS = 3000

const canPreview = computed(() => {
  const fileSize = props.item.meta?.file?.size
  // A zero size can be stale while a filesystem change is still propagating. Read the live file
  // before declaring it empty; the read result remains the authority for the empty-file message.
  if (fileSize === 0 || fileSize == null) return true
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

const activeSearchQuery = computed(() => {
  return props.item.meta?.deepMatch?.matchTerm?.trim() || props.searchQuery?.trim() || ''
})

const targetLineNumber = computed(() => {
  const line = props.item.meta?.deepMatch?.lineNumber
  return line != null && Number.isSafeInteger(line) && line > 0 ? line : undefined
})

const highlightedLines = computed(() => {
  const lines = textContent.value.split('\n')
  return lines.map((line, index) => ({
    number: index + 1,
    segments: splitHighlightedText(line, activeSearchQuery.value),
    newline: index < lines.length - 1 ? '\n' : ''
  }))
})

function scrollToFirstMatch(): void {
  if (loading.value || error.value) return
  const target = targetLineNumber.value
  const targetEl =
    target == null ? null : contentRef.value?.querySelector(`[data-line="${target}"]`)
  const match = targetEl || contentRef.value?.querySelector('.search-highlight')
  match?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'center'
  })
}

// Watch values, not a boolean: line 2 -> 50 and completion of an async read both move the target.
watch([targetLineNumber, activeSearchQuery, textContent, loading, error], scrollToFirstMatch, {
  flush: 'post'
})

async function loadContent() {
  if (!props.item.meta?.file?.path) {
    error.value = t('textPreview.error.noFile')
    return
  }

  if (!canPreview.value) {
    error.value = t('textPreview.error.fileTooLarge', { size: fileSizeDescription.value })
    return
  }

  error.value = ''
  textContent.value = ''
  loading.value = true
  try {
    rawBytes.value = await readPreviewBytes(
      transport,
      props.resourceUrl,
      MAX_PREVIEW_SIZE,
      READ_TIMEOUT_MS
    )
    redecodeContent()
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code || '') : ''
    const isTimeoutError =
      code === 'ETIMEDOUT' ||
      /ETIMEDOUT/i.test(message) ||
      /timeout/i.test(message) ||
      /timed out/i.test(message)

    error.value = isTimeoutError ? t('textPreview.error.readTimeout') : message
    if (!error.value) {
      error.value = t('textPreview.error.loadFailed')
    }

    if (!isTimeoutError) {
      textPreviewLog.error('Preview error:', err)
    }
  } finally {
    loading.value = false
  }
}

function redecodeContent(): void {
  if (!rawBytes.value) return
  try {
    const decoded = decodeText(rawBytes.value, props.encoding ?? 'auto', locale?.value ?? '')
    textContent.value = decoded.text
    emit('encodingDetected', decoded.detectedEncoding)
    error.value = textContent.value.length === 0 ? t('textPreview.error.emptyFile') : ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('textPreview.error.loadFailed')
  }
}

watch(() => props.encoding, redecodeContent)

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
    <pre
      v-else
      ref="contentRef"
      class="highlighted-content"
    ><template v-for="line in highlightedLines" :key="line.number"><span :data-line="line.number" :class="{ 'target-line': line.number === targetLineNumber }"><template v-for="(segment, index) in line.segments" :key="index"><mark v-if="segment.highlighted" class="search-highlight">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template>{{ line.newline }}</span></template></pre>
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
    .search-highlight {
      background-color: var(--tx-color-primary-light-8);
      color: var(--tx-text-color-primary);
      border-radius: 2px;
    }

    .target-line {
      background-color: var(--tx-color-primary-light-9);
      border-radius: 2px;
      box-decoration-break: clone;
    }
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--tx-text-color-regular);

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--tx-border-color);
      border-top: 2px solid var(--tx-color-primary);
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
    color: var(--tx-color-danger);

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
