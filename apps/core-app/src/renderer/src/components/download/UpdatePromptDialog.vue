<script setup lang="ts">
import type { DownloadStatus, GitHubRelease } from '@talex-touch/utils'
import {
  Calendar,
  Close,
  Document,
  Download,
  Loading,
  Right,
  Upload,
} from '@element-plus/icons-vue'
import { computed } from 'vue'
import ProgressBar from './ProgressBar.vue'

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
  downloadStatus: DownloadStatus.PENDING,
})

const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogTitle = computed(() => {
  if (isDownloadComplete.value) {
    return `🎉 ${(window as any).$t?.('update.update_ready')}` || 'Update Ready'
  }
  if (isDownloading.value) {
    return `⏬ ${(window as any).$t?.('update.downloading_update')}` || 'Downloading Update'
  }
  return `🎉 ${(window as any).$t?.('update.new_version_available')}` || 'New Version Available'
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

// Markdown rendering
const renderedMarkdown = computed(() => {
  if (!props.release?.body) {
    return '<p>No release notes available.</p>'
  }

  // Simple markdown to HTML conversion
  return convertMarkdownToHtml(props.release.body)
})

function convertMarkdownToHtml(markdown: string): string {
  let html = markdown

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/_(.*?)_/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

  // Lists
  html = html.replace(/^\* (.*$)/gm, '<li>$1</li>')
  html = html.replace(/^- (.*$)/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = `<p>${html}</p>`
  }

  return html
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  else {
    return `${bytes} B`
  }
}

function handleClose() {
  if (!isDownloading.value) {
    visible.value = false
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
    visible.value = false
  }
}

function handleRemindLater() {
  emit('remind-later')
  visible.value = false
}

function handleCancelDownload() {
  if (props.downloadTaskId) {
    emit('cancel-download', props.downloadTaskId)
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="650px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div v-if="release" class="update-prompt">
      <!-- Version Comparison -->
      <div class="version-section">
        <div class="version-item">
          <span class="version-label">{{ $t('update.current_version') }}</span>
          <el-tag type="info" size="large">
            {{ currentVersion }}
          </el-tag>
        </div>
        <div class="version-arrow">
          <el-icon :size="24">
            <Right />
          </el-icon>
        </div>
        <div class="version-item">
          <span class="version-label">{{ $t('update.new_version') }}</span>
          <el-tag type="success" size="large">
            {{ release.tag_name }}
          </el-tag>
        </div>
      </div>

      <!-- Release Info -->
      <div class="release-info">
        <div class="info-item">
          <el-icon><Calendar /></el-icon>
          <span>{{ formatDate(release.published_at) }}</span>
        </div>
        <div v-if="downloadSize > 0" class="info-item">
          <el-icon><Download /></el-icon>
          <span>{{ formatSize(downloadSize) }}</span>
        </div>
      </div>

      <!-- Release Notes -->
      <div class="release-notes-section">
        <h3 class="section-title">
          <el-icon><Document /></el-icon>
          {{ $t('update.release_notes') }}
        </h3>
        <div class="release-notes-content" v-html="renderedMarkdown" />
      </div>

      <!-- Download Progress (when downloading) -->
      <div v-if="isDownloading && downloadProgress" class="download-progress-section">
        <h3 class="section-title">
          <el-icon><Loading /></el-icon>
          {{ $t('update.downloading') }}
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
        <el-alert
          :title="$t('update.download_complete')"
          type="success"
          :closable="false"
          show-icon
        >
          <template #default>
            {{ $t('update.ready_to_install') }}
          </template>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-button
            v-if="!isDownloading && !isDownloadComplete"
            text
            @click="handleIgnoreVersion"
          >
            {{ $t('update.ignore_version') }}
          </el-button>
        </div>
        <div class="footer-right">
          <el-button
            v-if="!isDownloading && !isDownloadComplete"
            @click="handleRemindLater"
          >
            {{ $t('update.remind_later') }}
          </el-button>
          <el-button
            v-if="!isDownloading && !isDownloadComplete"
            type="primary"
            @click="handleDownload"
          >
            <el-icon><Download /></el-icon>
            {{ $t('update.download_now') }}
          </el-button>
          <el-button
            v-if="isDownloadComplete"
            type="success"
            @click="handleInstall"
          >
            <el-icon><Upload /></el-icon>
            {{ $t('update.install_now') }}
          </el-button>
          <el-button
            v-if="isDownloading"
            type="warning"
            @click="handleCancelDownload"
          >
            <el-icon><Close /></el-icon>
            {{ $t('update.cancel_download') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
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
  background: var(--el-bg-color-page);
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
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.version-arrow {
  color: var(--el-color-success);
  display: flex;
  align-items: center;
}

.release-info {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.info-item .el-icon {
  color: var(--el-color-primary);
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
  color: var(--el-text-color-primary);
  margin: 0 0 16px 0;
}

.section-title .el-icon {
  color: var(--el-color-primary);
}

.release-notes-content {
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  background: var(--el-bg-color-page);
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

.release-notes-content :deep(h1) {
  font-size: 20px;
  font-weight: 600;
  margin: 16px 0 12px 0;
  color: var(--el-text-color-primary);
}

.release-notes-content :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 14px 0 10px 0;
  color: var(--el-text-color-primary);
}

.release-notes-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 12px 0 8px 0;
  color: var(--el-text-color-primary);
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
  color: var(--el-text-color-primary);
}

.release-notes-content :deep(em) {
  font-style: italic;
}

.release-notes-content :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}

.release-notes-content :deep(a:hover) {
  text-decoration: underline;
}

.release-notes-content :deep(code) {
  background: var(--el-fill-color);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.download-progress-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--el-fill-color-light);
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
  background: var(--el-fill-color-lighter);
  border-radius: 3px;
}

.release-notes-content::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.release-notes-content::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color-dark);
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
