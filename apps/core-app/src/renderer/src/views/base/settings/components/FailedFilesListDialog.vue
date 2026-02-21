<script setup lang="ts">
import type { FileIndexFailedFile } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex'
import { inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const props = defineProps<{
  loadFiles: () => Promise<FileIndexFailedFile[]>
}>()

const destroy = inject('destroy') as () => void
const { t } = useI18n()
const files = ref<FileIndexFailedFile[]>([])
const loading = ref(true)
const copiedId = ref<number | null>(null)

onMounted(async () => {
  try {
    files.value = await props.loadFiles()
  } catch (error) {
    console.error('[FailedFilesListDialog] Failed to load files:', error)
  } finally {
    loading.value = false
  }
})

function copyToClipboard(text: string, fileId: number) {
  navigator.clipboard.writeText(text).then(() => {
    copiedId.value = fileId
    toast.success(t('common.copied'))
    setTimeout(() => {
      if (copiedId.value === fileId) copiedId.value = null
    }, 1500)
  })
}

function copyAll() {
  const text = files.value
    .map((f) => `${f.path}\n  Error: ${f.lastError ?? 'Unknown'}`)
    .join('\n\n')
  navigator.clipboard.writeText(text).then(() => {
    toast.success(t('common.copied'))
  })
}

function close() {
  destroy?.()
}
</script>

<template>
  <div class="failed-files-dialog">
    <div class="dialog-header">
      <div class="icon-wrapper">
        <div class="i-carbon-warning-alt text-24px text-red-500" />
      </div>
      <h3 class="dialog-title">
        {{ t('settings.settingFileIndex.failedFilesDialogTitle') }}
      </h3>
    </div>

    <div v-if="loading" class="dialog-loading">
      <div class="i-carbon-circle-dash text-24px animate-spin" />
    </div>

    <template v-else>
      <div v-if="files.length === 0" class="dialog-empty">
        {{ t('settings.settingFileIndex.noFailedFiles') }}
      </div>

      <div v-else class="file-list-container">
        <div class="file-list-header">
          <span class="file-count"
            >{{ files.length }} {{ t('settings.settingFileIndex.failedFilesCount') }}</span
          >
          <TxButton variant="flat" size="small" @click="copyAll">
            <div class="i-carbon-copy text-12px mr-4px" />
            {{ t('settings.settingFileIndex.copyAll') }}
          </TxButton>
        </div>

        <TransitionGroup name="file-flip" tag="div" class="file-list">
          <div v-for="file in files" :key="file.fileId" class="file-item">
            <div class="file-path-row">
              <div class="i-carbon-document text-14px shrink-0 text-secondary" />
              <span class="file-path" :title="file.path">{{ file.path }}</span>
              <TxButton
                variant="ghost"
                size="sm"
                :border="false"
                class="copy-btn"
                :class="{ copied: copiedId === file.fileId }"
                :title="t('common.copy')"
                @click="
                  copyToClipboard(
                    `${file.path}\nError: ${file.lastError ?? 'Unknown'}`,
                    file.fileId
                  )
                "
              >
                <div
                  :class="copiedId === file.fileId ? 'i-carbon-checkmark' : 'i-carbon-copy'"
                  class="text-12px"
                />
              </TxButton>
            </div>
            <div v-if="file.lastError" class="file-error">
              {{ file.lastError }}
            </div>
          </div>
        </TransitionGroup>
      </div>
    </template>

    <div class="dialog-footer">
      <TxButton variant="flat" @click="close">
        {{ t('common.close') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.failed-files-dialog {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 400px;
  max-width: 560px;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.dialog-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--el-text-color-secondary);
}

.dialog-empty {
  text-align: center;
  padding: 24px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.file-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.file-list::-webkit-scrollbar {
  width: 4px;
}

.file-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 2px;
}

.file-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--el-border-color-lighter);
  transition: background 0.2s;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.file-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.file-path {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.text-secondary {
  color: var(--el-text-color-secondary);
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--el-text-color-primary);
}

.copy-btn.copied {
  color: #34c759;
}

.file-error {
  font-size: 11px;
  color: #ff3b30;
  padding: 4px 6px;
  background: rgba(255, 59, 48, 0.08);
  border-radius: 4px;
  font-family: monospace;
  word-break: break-all;
  line-height: 1.4;
  margin-left: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

/* Flip animation */
.file-flip-enter-active {
  transition: all 0.4s ease;
}

.file-flip-leave-active {
  transition: all 0.3s ease;
}

.file-flip-enter-from {
  opacity: 0;
  transform: rotateX(-30deg) translateY(-8px);
}

.file-flip-leave-to {
  opacity: 0;
  transform: rotateX(30deg) translateY(8px);
}

.file-flip-move {
  transition: transform 0.4s ease;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
