<script setup lang="ts" name="CodePreview">
import type { TuffItem } from '@talex-touch/utils'
import type { CodeEditorLanguage } from '@talex-touch/tuffex/code-editor'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { TxCodeEditor } from '@talex-touch/tuffex/code-editor'
import { createRendererLogger } from '~/utils/renderer-log'
import { decodeText, readPreviewBytes, type TextEncodingSelection } from './text-encoding'

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
const codePreviewLog = createRendererLogger('CodePreview')
const content = ref('')
const loading = ref(false)
const error = ref('')
const rawBytes = ref<Uint8Array | null>(null)

// 1 MB limit for code preview
const MAX_CODE_SIZE = 1 * 1024 * 1024
const READ_TIMEOUT_MS = 3000

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
  // A zero size can be stale while a filesystem change is still propagating. Read the live file
  // before declaring it empty; the read result remains the authority for the empty-file message.
  if (fileSize === 0 || fileSize == null) return true
  return fileSize <= MAX_CODE_SIZE
})

const fileSizeDescription = computed(() => {
  const fileSize = props.item.meta?.file?.size
  if (!fileSize) return ''
  if (fileSize < 1024) return `${fileSize} B`
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
})

async function loadContent(): Promise<void> {
  const filePath = props.item.meta?.file?.path
  if (!filePath) {
    error.value = t('textPreview.error.noFile')
    return
  }

  if (!canPreview.value) {
    error.value = t('textPreview.error.fileTooLarge', { size: fileSizeDescription.value })
    return
  }

  loading.value = true
  try {
    rawBytes.value = await readPreviewBytes(
      transport,
      props.resourceUrl,
      MAX_CODE_SIZE,
      READ_TIMEOUT_MS
    )
    redecodeContent()
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
      codePreviewLog.error('Preview error:', err)
    }
  } finally {
    loading.value = false
  }
}

function redecodeContent(): void {
  if (!rawBytes.value) return
  try {
    const decoded = decodeText(rawBytes.value, props.encoding ?? 'auto', locale?.value ?? '')
    content.value = decoded.text
    emit('encodingDetected', decoded.detectedEncoding)
    error.value = content.value.length === 0 ? t('textPreview.error.emptyFile') : ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('textPreview.error.loadFailed')
  }
}

watch(() => props.encoding, redecodeContent)

onMounted(loadContent)
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
