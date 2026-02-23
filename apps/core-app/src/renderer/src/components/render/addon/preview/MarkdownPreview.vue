<script setup lang="ts" name="MarkdownPreview">
import type { TuffItem } from '@talex-touch/utils'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { TxMarkdownView } from '@talex-touch/tuffex'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  item: TuffItem
  searchQuery?: string
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const content = ref('')
const loading = ref(false)
const error = ref('')

// 1 MB limit for markdown preview
const MAX_MD_SIZE = 1 * 1024 * 1024
const READ_TIMEOUT_MS = 3000

onMounted(async () => {
  const filePath = props.item.meta?.file?.path
  if (!filePath) {
    error.value = t('textPreview.error.noFile')
    return
  }

  const fileSize = props.item.meta?.file?.size
  if (fileSize === 0) {
    error.value = t('textPreview.error.emptyFile')
    return
  }
  if (fileSize && fileSize > MAX_MD_SIZE) {
    error.value = t('textPreview.error.fileTooLarge', {
      size: `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
    })
    return
  }

  loading.value = true
  try {
    if (isElectronRenderer() && transport) {
      // Use IPC channel for file reading in Electron
      const tfileUrl = buildTfileUrl(filePath)
      content.value = await transport.send(AppEvents.system.readFile, {
        source: tfileUrl,
        timeoutMs: READ_TIMEOUT_MS
      })
    } else {
      // Fallback to fetch for non-Electron environments
      const url = buildTfileUrl(filePath)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      content.value = await response.text()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: string }).code || '')
        : ''
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
      console.error('MarkdownPreview error:', err)
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="MarkdownPreview">
    <div v-if="loading" class="loading">
      <div class="loading-spinner" />
    </div>
    <div v-else-if="error" class="error">
      <div class="error-icon">
        <i class="i-ri-error-warning-line" />
      </div>
      <div class="error-message">
        {{ error }}
      </div>
    </div>
    <div v-else class="markdown-content">
      <TxMarkdownView :content="content" theme="auto" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.MarkdownPreview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .markdown-content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;

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
