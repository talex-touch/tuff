<script setup lang="ts" name="TextPreview">
import { TuffItem } from '@talex-touch/utils'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  item: TuffItem
}>()

const { t } = useI18n()
const textContent = ref('')
const loading = ref(false)
const error = ref('')

const canPreview = computed(() => {
  const fileSize = props.item.meta?.file?.size
  if (!fileSize || fileSize === 0) {
    return false
  }
  // 10KB = 10 * 1024 bytes
  return fileSize <= 10 * 1024
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

onMounted(async () => {
  if (!props.item.meta?.file?.path) {
    error.value = t('textPreview.error.noFile')
    return
  }

  if (!canPreview.value) {
    const fileSize = props.item.meta?.file?.size
    if (fileSize === 0) {
      error.value = t('textPreview.error.emptyFile')
    } else {
      error.value = t('textPreview.error.fileTooLarge', { size: fileSizeDescription.value })
    }
    return
  }

  loading.value = true
  try {
    const response = await fetch(`tfile://${props.item.meta.file.path}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    textContent.value = await response.text()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('textPreview.error.loadFailed')
    console.error('TextPreview error:', err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="TextPreview">
    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>{{ t('textPreview.loading') }}</span>
    </div>
    <div v-else-if="error" class="error">
      <div class="error-icon">⚠️</div>
      <div class="error-message">{{ error }}</div>
    </div>
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

    .file-size-info {
      font-size: 0.875rem;
      color: var(--el-text-color-regular);
      margin-top: 0.5rem;
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
