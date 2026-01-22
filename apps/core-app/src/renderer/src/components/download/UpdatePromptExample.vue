<script setup lang="ts">
import type { GitHubRelease } from '@talex-touch/utils'
import { DownloadStatus } from '@talex-touch/utils'
import { ref } from 'vue'
import UpdatePromptDialog from './UpdatePromptDialog.vue'

const dialogVisible = ref(false)
const currentVersion = ref('v2.4.6')
const downloadTaskId = ref<string>()
const downloadStatus = ref<DownloadStatus>(DownloadStatus.PENDING)

const downloadProgress = ref({
  percentage: 0,
  speed: 0,
  downloadedSize: 0,
  totalSize: 0,
  remainingTime: 0
})

const mockRelease = ref<GitHubRelease>({
  tag_name: 'v2.5.0',
  name: 'Tuff v2.5.0 - Major Update',
  published_at: new Date().toISOString(),
  body: `## 🎉 New Features

- **Unified Download Center**: Manage all downloads in one place
- **Auto Update System**: Automatic update downloads with progress tracking
- **Enhanced Performance**: 30% faster startup time

## 🔧 Improvements

- Optimized download performance with multi-threading
- Fixed known issues with plugin installation
- Improved UI responsiveness

## 🐛 Bug Fixes

- Fixed crash on macOS when opening settings
- Resolved memory leak in download manager
- Fixed incorrect progress display

## 📦 Download Size

This update is approximately 250 MB.`,
  assets: [
    {
      name: 'tuff-v2.5.0-mac.dmg',
      url: 'https://github.com/talex-touch/tuff/releases/download/v2.5.0/tuff-v2.5.0-mac.dmg',
      size: 262144000, // 250 MB
      platform: 'darwin' as const,
      arch: 'x64' as const,
      checksum: 'abc123def456'
    }
  ]
})

function showUpdateDialog() {
  dialogVisible.value = true
}

function handleDownload(release: GitHubRelease) {
  console.log('Download update:', release.tag_name)
  // Simulate download start
  downloadTaskId.value = `update-task-${Date.now()}`
  downloadStatus.value = DownloadStatus.DOWNLOADING

  // Simulate download progress
  simulateDownload()
}

function simulateDownload() {
  const totalSize = mockRelease.value.assets[0].size
  let downloaded = 0
  const speed = 2 * 1024 * 1024 // 2 MB/s

  const interval = setInterval(() => {
    downloaded += speed
    if (downloaded >= totalSize) {
      downloaded = totalSize
      downloadStatus.value = DownloadStatus.COMPLETED
      clearInterval(interval)
    }

    downloadProgress.value = {
      percentage: (downloaded / totalSize) * 100,
      speed,
      downloadedSize: downloaded,
      totalSize,
      remainingTime: (totalSize - downloaded) / speed
    }
  }, 1000)
}

function handleInstall(taskId: string) {
  console.log('Install update:', taskId)
  // Implement installation logic
  dialogVisible.value = false
}

function handleIgnoreVersion(version: string) {
  console.log('Ignore version:', version)
}

function handleRemindLater() {
  console.log('Remind later')
}

function handleCancelDownload(taskId: string) {
  console.log('Cancel download:', taskId)
  downloadStatus.value = DownloadStatus.CANCELLED
  downloadTaskId.value = undefined
}
</script>

<template>
  <div class="update-prompt-example">
    <el-button type="primary" @click="showUpdateDialog"> Show Update Dialog </el-button>

    <UpdatePromptDialog
      v-model="dialogVisible"
      :release="mockRelease"
      :current-version="currentVersion"
      :download-task-id="downloadTaskId"
      :download-progress="downloadProgress"
      :download-status="downloadStatus"
      @download="handleDownload"
      @install="handleInstall"
      @ignore-version="handleIgnoreVersion"
      @remind-later="handleRemindLater"
      @cancel-download="handleCancelDownload"
    />
  </div>
</template>

<style scoped>
.update-prompt-example {
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
</style>
