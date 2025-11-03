<script setup lang="ts" name="FlatDownload">
import { ref, onMounted, onBeforeUnmount } from 'vue'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ipcRenderer } = require('electron')
import FlatButton from '../base/button/FlatButton.vue'
import { Download } from '@element-plus/icons-vue'
import { useAuth } from '~/modules/auth/useAuth'
import DownloadCenter from './DownloadCenter.vue'

const { isLoggedIn } = useAuth()
const downloadDialogVisible = ref(false)

function handleClick(): void {
  downloadDialogVisible.value = true
}

function handleClose(): void {
  downloadDialogVisible.value = false
}

function handleOpenDownloadCenter(): void {
  downloadDialogVisible.value = true
}

onMounted(() => {
  ipcRenderer.on('open-download-center', handleOpenDownloadCenter)
})

onBeforeUnmount(() => {
  ipcRenderer.removeListener('open-download-center', handleOpenDownloadCenter)
})
</script>

<template>
  <FlatButton :class="{ active: isLoggedIn }" class="download-btn" @click="handleClick">
    <el-icon :size="16">
      <Download />
    </el-icon>
    <span class="download-text">下载管理</span>
  </FlatButton>

  <el-dialog
    v-model="downloadDialogVisible"
    title="下载管理"
    width="90%"
    :before-close="handleClose"
    top="5vh"
    class="download-center-dialog"
  >
    <DownloadCenter />
  </el-dialog>
</template>

<style lang="scss" scoped>
.download-btn {
  &.active {
    --h: 0;
  }
  width: calc(100% - 1rem);
  margin: 0.5rem 0.5rem 0.5rem 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 12px;

  --h: 30px;
  border-radius: 12px;
  transform: translate(0, 20vh);
  animation: download-btn-enter 0.5s 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;

  .download-text {
    font-size: 12px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .el-icon {
    color: var(--el-color-primary);
  }
}

@keyframes download-btn-enter {
  from {
    transform: translate(0, 20vh);
  }
  to {
    transform: translate(0, calc(100% + var(--h)));
  }
}
</style>

<style lang="scss">
.download-center-dialog {
  .el-dialog__body {
    max-height: calc(90vh - 120px);
    overflow-y: auto;
    padding: 20px;
  }
}
</style>
