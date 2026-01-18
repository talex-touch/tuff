<script setup lang="ts" name="FlatDownload">
import { Download } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuth } from '~/modules/auth/useAuth'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import FlatButton from '../base/button/FlatButton.vue'
import DownloadCenter from './DownloadCenter.vue'

// const { ipcRenderer } = require('electron')

const { isLoggedIn } = useAuth()
const { taskStats } = useDownloadCenter()
const downloadDialogVisible = ref(false)
const downloadingCount = computed(() => taskStats.value.downloading + taskStats.value.pending)
const failedCount = computed(() => taskStats.value.failed)

function handleClick(): void {
  downloadDialogVisible.value = true
}

function handleClose(): void {
  downloadDialogVisible.value = false
}

// function handleOpenDownloadCenter(): void {
//   downloadDialogVisible.value = true
// }

onMounted(() => {
  // ipcRenderer.on('open-download-center', handleOpenDownloadCenter)
})

onBeforeUnmount(() => {
  // ipcRenderer.removeListener('open-download-center', handleOpenDownloadCenter)
})
</script>

<template>
  <FlatButton :class="{ active: isLoggedIn }" class="download-btn" @click="handleClick">
    <el-icon :size="16">
      <Download />
    </el-icon>
    <span class="download-text">下载管理</span>
    <div v-if="downloadingCount > 0 || failedCount > 0" class="download-badges">
      <span v-if="downloadingCount > 0" class="download-badge">
        {{ downloadingCount }}
      </span>
      <span v-if="failedCount > 0" class="download-badge error">
        {{ failedCount }}
      </span>
    </div>
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
  position: relative;
  width: calc(100% - 1rem);
  margin: 0.5rem 0.5rem 0.5rem 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 12px;

  --h: 30px;
  overflow: hidden;
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

.download-badges {
  position: absolute;
  top: 6px;
  right: 10px;
  display: flex;
  gap: 6px;
}

.download-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.download-badge.error {
  background: var(--el-color-danger);
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
