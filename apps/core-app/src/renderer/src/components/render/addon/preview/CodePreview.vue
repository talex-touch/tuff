<script setup lang="ts" name="CodePreview">
import type { TuffItem } from '@talex-touch/utils'
import type { CodeEditorLanguage } from '@talex-touch/tuffex'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { TxCodeEditor } from '@talex-touch/tuffex'
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

// 1 MB limit for code preview
const MAX_CODE_SIZE = 1 * 1024 * 1024

const LANGUAGE_MAP: Record<string, CodeEditorLanguage> = {
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  jsx: 'javascript',
  ini: 'ini',
  conf: 'ini',
  toml: 'toml'
}

const language = computed<CodeEditorLanguage>(() => {
  const ext = props.item.meta?.file?.extension?.toLowerCase() ?? ''
  return LANGUAGE_MAP[ext] || 'json'
})

const canPreview = computed(() => {
  const fileSize = props.item.meta?.file?.size
  if (fileSize === 0) return false
  // If size is unknown (undefined/null), still attempt to fetch
  if (fileSize == null) return true
  return fileSize <= MAX_CODE_SIZE
})

const fileSizeDescription = computed(() => {
  const fileSize = props.item.meta?.file?.size
  if (!fileSize) return ''
  if (fileSize < 1024) return `${fileSize} B`
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
})

onMounted(async () => {
  const filePath = props.item.meta?.file?.path
  if (!filePath) {
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
    if (isElectronRenderer() && transport) {
      // Use IPC channel for file reading in Electron
      const tfileUrl = buildTfileUrl(filePath)
      content.value = await transport.send(AppEvents.system.readFile, { source: tfileUrl })
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
    error.value = err instanceof Error ? err.message : t('textPreview.error.loadFailed')
    console.error('CodePreview error:', err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="CodePreview">
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
    <TxCodeEditor
      v-else
      :model-value="content"
      :language="language"
      :read-only="true"
      :line-numbers="true"
      :line-wrapping="true"
      :lint="false"
      :search="true"
      :completion="false"
      theme="auto"
      class="code-editor"
    />
  </div>
</template>

<style lang="scss" scoped>
.CodePreview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .code-editor {
    flex: 1;
    min-height: 0;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;

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
