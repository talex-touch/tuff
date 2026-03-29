<script setup lang="ts">
import type { GitHubRelease } from '@talex-touch/utils'
import { DownloadStatus } from '@talex-touch/utils'
import { TxAlert, TxMarkdownView, TxModal } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressBar from './DownloadProgressBar.vue'

const { t } = useI18n()

interface DownloadProgress {
  percentage: number
  speed: number
  downloadedSize: number
  totalSize: number
  remainingTime?: number
}

interface Props {
  modelValue: boolean
  release: GitHubRelease | null
  currentVersion: string
  downloadTaskId?: string
  downloadProgress?: DownloadProgress
  downloadStatus?: DownloadStatus
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'download', release: GitHubRelease): void
  (e: 'install', taskId: string): void
  (e: 'ignore-version', version: string): void
  (e: 'remind-later'): void
  (e: 'cancel-download', taskId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  downloadStatus: DownloadStatus.PENDING
})

const emit = defineEmits<Emits>()

const allowClose = ref(false)
const visible = computed({
  get: () => props.modelValue,
  set: (value) => {
    if (!value && !allowClose.value) return
    emit('update:modelValue', value)
    if (!value) {
      allowClose.value = false
    }
  }
})

const dialogTitle = computed(() => {
  if (isDownloadComplete.value) {
    return `🎉 ${t('update.update_ready')}`
  }
  if (isDownloading.value) {
    return `⏬ ${t('update.downloading_update')}`
  }
  return `🎉 ${t('update.new_version_available')}`
})

const isDownloading = computed(() => {
  return props.downloadTaskId && props.downloadStatus === DownloadStatus.DOWNLOADING
})

const isDownloadComplete = computed(() => {
  return props.downloadTaskId && props.downloadStatus === DownloadStatus.COMPLETED
})

const downloadSize = computed(() => {
  if (!props.release?.assets || props.release.assets.length === 0) {
    return 0
  }
  // Get the first asset size (assuming single platform asset)
  return props.release.assets[0]?.size || 0
})

const releaseNotesContent = computed(
  () => props.release?.body?.trim() || t('update.no_release_notes')
)

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${bytes} B`
  }
}

function requestClose() {
  allowClose.value = true
  visible.value = false
}

function handleClose() {
  if (!isDownloading.value) {
    requestClose()
  }
}

function handleDownload() {
  if (props.release) {
    emit('download', props.release)
  }
}

function handleInstall() {
  if (props.downloadTaskId) {
    emit('install', props.downloadTaskId)
  }
}

function handleIgnoreVersion() {
  if (props.release) {
    emit('ignore-version', props.release.tag_name)
    requestClose()
  }
}

function handleRemindLater() {
  emit('remind-later')
  requestClose()
}

function handleCancelDownload() {
  if (props.downloadTaskId) {
    emit('cancel-download', props.downloadTaskId)
  }
}
</script>

<template>
  <TxModal v-model="visible" :title="dialogTitle" width="650px" @close="handleClose">
    <div v-if="release" class="update-prompt">
      <!-- Version Comparison -->
      <div class="version-section">
        <div class="version-item">
          <span class="version-label">{{ t('update.current_version') }}</span>
          <TxTag type="info" size="large">
            {{ currentVersion }}
          </TxTag>
        </div>
        <div class="version-arrow">
          <i class="i-carbon-arrow-right text-2xl" />
        </div>
        <div class="version-item">
          <span class="version-label">{{ t('update.new_version') }}</span>
          <TxTag type="success" size="large">
            {{ release.tag_name }}
          </TxTag>
        </div>
      </div>

      <!-- Release Info -->
      <div class="release-info">
        <div class="info-item">
          <i class="i-carbon-calendar" />
          <span>{{ formatDate(release.published_at) }}</span>
        </div>
        <div v-if="downloadSize > 0" class="info-item">
          <i class="i-carbon-download" />
          <span>{{ formatSize(downloadSize) }}</span>
        </div>
      </div>

      <!-- Release Notes -->
      <div class="release-notes-section">
        <h3 class="section-title">
          <i class="i-carbon-document" />
          {{ t('update.release_notes') }}
        </h3>
        <div class="release-notes-content">
          <TxMarkdownView :content="releaseNotesContent" theme="auto" />
        </div>
      </div>

      <!-- Download Progress (when downloading) -->
      <div v-if="isDownloading && downloadProgress" class="download-progress-section">
        <h3 class="section-title">
          <i class="i-carbon-circle-dash animate-spin" />
          {{ t('update.downloading') }}
        </h3>
        <ProgressBar
          :percentage="downloadProgress.percentage"
          :speed="downloadProgress.speed"
          :downloaded="downloadProgress.downloadedSize"
          :total="downloadProgress.totalSize"
          :remaining-time="downloadProgress.remainingTime || 0"
          :status="downloadStatus"
        />
      </div>

      <!-- Install Ready (when download complete) -->
      <div v-if="isDownloadComplete" class="install-ready-section">
        <TxAlert
          :title="t('update.download_complete')"
          type="success"
          :closable="false"
          :show-icon="true"
        >
          <template #default>
            {{ t('update.ready_to_install') }}
          </template>
        </TxAlert>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <TxButton v-if="!isDownloading && !isDownloadComplete" text @click="handleIgnoreVersion">
            {{ t('update.ignore_version') }}
          </TxButton>
        </div>
        <div class="footer-right">
          <TxButton v-if="!isDownloading && !isDownloadComplete" @click="handleRemindLater">
            {{ t('update.remind_later') }}
          </TxButton>
          <TxButton
            v-if="!isDownloading && !isDownloadComplete"
            type="primary"
            @click="handleDownload"
          >
            <i class="i-carbon-download" />
            {{ t('update.download_now') }}
          </TxButton>
          <TxButton v-if="isDownloadComplete" type="success" @click="handleInstall">
            <i class="i-carbon-upload" />
            {{ t('update.install_now') }}
          </TxButton>
          <TxButton v-if="isDownloading" type="warning" @click="handleCancelDownload">
            <i class="i-carbon-close" />
            {{ t('update.cancel_download') }}
          </TxButton>
        </div>
      </div>
    </template>
  </TxModal>
</template>

<style scoped>
.update-prompt {
  padding: 8px 0;
}

.version-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: var(--tx-bg-color-page);
  border-radius: 8px;
  margin-bottom: 24px;
}

.version-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.version-label {
  font-size: 14px;
  color: var(--tx-text-color-secondary);
  font-weight: 500;
}

.version-arrow {
  color: var(--tx-color-success);
  display: flex;
  align-items: center;
}

.release-info {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding: 12px 16px;
  background: var(--tx-fill-color-light);
  border-radius: 6px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-regular);
  font-size: 14px;
}

.info-item i {
  color: var(--tx-color-primary);
}

.release-notes-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  margin: 0 0 16px 0;
}

.section-title i {
  color: var(--tx-color-primary);
}

.release-notes-content {
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  background: var(--tx-bg-color-page);
  border-radius: 6px;
  border: 1px solid var(--tx-border-color-lighter);
  font-size: 14px;
  line-height: 1.6;
  color: var(--tx-text-color-primary);
}

.release-notes-content :deep(.tx-markdown-view) {
  font-size: inherit;
}

.release-notes-content :deep(h1) {
  font-size: 20px;
  font-weight: 600;
  margin: 16px 0 12px 0;
  color: var(--tx-text-color-primary);
}

.release-notes-content :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 14px 0 10px 0;
  color: var(--tx-text-color-primary);
}

.release-notes-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 12px 0 8px 0;
  color: var(--tx-text-color-primary);
}

.release-notes-content :deep(h1:first-child),
.release-notes-content :deep(h2:first-child),
.release-notes-content :deep(h3:first-child) {
  margin-top: 0;
}

.release-notes-content :deep(p) {
  margin: 8px 0;
}

.release-notes-content :deep(ul) {
  margin: 8px 0;
  padding-left: 24px;
}

.release-notes-content :deep(li) {
  margin: 4px 0;
  list-style-type: disc;
}

.release-notes-content :deep(strong) {
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.release-notes-content :deep(em) {
  font-style: italic;
}

.release-notes-content :deep(a) {
  color: var(--tx-color-primary);
  text-decoration: none;
}

.release-notes-content :deep(a:hover) {
  text-decoration: underline;
}

.release-notes-content :deep(code) {
  background: var(--tx-fill-color);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.download-progress-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--tx-fill-color-light);
  border-radius: 6px;
}

.install-ready-section {
  margin-bottom: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left {
  flex: 1;
}

.footer-right {
  display: flex;
  gap: 8px;
}

/* Scrollbar styling */
.release-notes-content::-webkit-scrollbar {
  width: 6px;
}

.release-notes-content::-webkit-scrollbar-track {
  background: var(--tx-fill-color-lighter);
  border-radius: 3px;
}

.release-notes-content::-webkit-scrollbar-thumb {
  background: var(--tx-border-color);
  border-radius: 3px;
}

.release-notes-content::-webkit-scrollbar-thumb:hover {
  background: var(--tx-border-color-dark);
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.update-prompt {
  animation: fadeIn 0.3s ease-out;
}

/* Responsive design */
@media (max-width: 768px) {
  .version-section {
    flex-direction: column;
    gap: 16px;
  }

  .version-arrow {
    transform: rotate(90deg);
  }

  .release-info {
    flex-direction: column;
    gap: 12px;
  }

  .dialog-footer {
    flex-direction: column;
    gap: 12px;
  }

  .footer-left,
  .footer-right {
    width: 100%;
  }

  .footer-right {
    flex-direction: column;
  }
}
</style>
