<script setup lang="ts" name="FlatDownload">
import { Download } from '@element-plus/icons-vue'
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/modules/auth/useAuth'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import DownloadCenter from './DownloadCenter.vue'

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const { taskStats, tasksByStatus, currentDownloadSpeed, formatSpeed } = useDownloadCenter()

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.1

const downloadDialogVisible = ref(false)
const downloadDialogSource = ref<HTMLElement | null>(null)

const activeTaskCount = computed(() => taskStats.value.downloading + taskStats.value.pending)
const failedCount = computed(() => taskStats.value.failed)

const aggregateProgress = computed(() => {
  const activeTasks = [...tasksByStatus.value.downloading, ...tasksByStatus.value.pending]

  if (!activeTasks.length) {
    return 0
  }

  let totalBytes = 0
  let downloadedBytes = 0
  let fallbackPercentageSum = 0
  let fallbackPercentageCount = 0

  for (const task of activeTasks) {
    const progress = task.progress
    if (!progress) {
      continue
    }

    const totalSize = typeof progress.totalSize === 'number' ? progress.totalSize : 0
    const downloadedSize = typeof progress.downloadedSize === 'number' ? progress.downloadedSize : 0

    if (totalSize > 0) {
      totalBytes += totalSize
      downloadedBytes += Math.min(Math.max(downloadedSize, 0), totalSize)
      continue
    }

    const percentage = typeof progress.percentage === 'number' ? progress.percentage : NaN
    if (Number.isFinite(percentage)) {
      fallbackPercentageSum += Math.min(Math.max(percentage, 0), 100)
      fallbackPercentageCount += 1
    }
  }

  if (totalBytes > 0) {
    return (downloadedBytes / totalBytes) * 100
  }

  if (fallbackPercentageCount > 0) {
    return fallbackPercentageSum / fallbackPercentageCount
  }

  return 0
})

const progressPercent = computed(() => Number(aggregateProgress.value.toFixed(1)))

const speedLabel = computed(() => {
  if (currentDownloadSpeed.value <= 0) {
    return '0 B/s'
  }
  return formatSpeed(currentDownloadSpeed.value)
})

const summaryLabel = computed(() => {
  if (activeTaskCount.value <= 0) {
    return t('download.no_tasks')
  }

  return `${speedLabel.value} · ${progressPercent.value}% · ${activeTaskCount.value}${t('download.items')}`
})

function handleClick(event: MouseEvent): void {
  downloadDialogSource.value =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  downloadDialogVisible.value = true
}
</script>

<template>
  <TxButton
    variant="flat"
    :class="{ active: isLoggedIn, downloading: activeTaskCount > 0 }"
    class="download-btn"
    @click="handleClick"
  >
    <span
      class="download-progress-bg"
      :style="{ width: `${progressPercent}%`, opacity: activeTaskCount > 0 ? 1 : 0 }"
    />

    <div class="download-content">
      <div class="download-main">
        <el-icon :size="16">
          <Download />
        </el-icon>
        <span class="download-text">{{ t('download.title') }}</span>
      </div>
      <span class="download-meta">{{ summaryLabel }}</span>
    </div>

    <div v-if="activeTaskCount > 0 || failedCount > 0" class="download-badges">
      <span v-if="activeTaskCount > 0" class="download-badge">
        {{ activeTaskCount }}
      </span>
      <span v-if="failedCount > 0" class="download-badge error">
        {{ failedCount }}
      </span>
    </div>
  </TxButton>

  <Teleport to="body">
    <TxFlipOverlay
      v-model="downloadDialogVisible"
      :source="downloadDialogSource"
      :duration="FLIP_DURATION"
      :rotate-x="FLIP_ROTATE_X"
      :rotate-y="FLIP_ROTATE_Y"
      :speed-boost="FLIP_SPEED_BOOST"
      transition-name="DownloadDialog-Mask"
      mask-class="DownloadDialog-Mask"
      card-class="DownloadDialog-Card"
    >
      <template #default="{ close }">
        <div class="DownloadDialog">
          <div class="DownloadDialog-Header">
            <div class="DownloadDialog-TitleBlock">
              <div class="DownloadDialog-Title">{{ t('download.title') }}</div>
              <div class="DownloadDialog-Subtitle">{{ summaryLabel }}</div>
            </div>
            <TxButton variant="flat" size="sm" class="DownloadDialog-CloseBtn" @click="close">
              <i class="i-ri-close-line" />
            </TxButton>
          </div>

          <div class="DownloadDialog-Body">
            <DownloadCenter />
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style lang="scss" scoped>
.download-btn {
  &.active {
    --h: 0;
  }

  position: relative;
  width: calc(100% - 1rem);
  margin: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-radius: 12px;
  overflow: hidden;
  transform: translate(0, 20vh);
  animation: download-btn-enter 0.5s 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;

  --h: 30px;

  .el-icon {
    color: var(--el-color-primary);
  }
}

.download-progress-bg {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.24), rgba(103, 194, 58, 0.2));
  transition:
    width 240ms ease,
    opacity 200ms ease;
  pointer-events: none;
}

.download-content {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 56px;
}

.download-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.download-meta {
  font-size: 11px;
  line-height: 1.2;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.download-badges {
  position: absolute;
  top: 6px;
  right: 10px;
  display: flex;
  gap: 6px;
  z-index: 2;
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

.DownloadDialog {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.DownloadDialog-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.DownloadDialog-TitleBlock {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.DownloadDialog-Title {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.DownloadDialog-Subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.DownloadDialog-CloseBtn {
  flex: 0 0 auto;
}

.DownloadDialog-Body {
  flex: 1;
  min-height: 0;
  overflow: auto;
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
.DownloadDialog-Mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.DownloadDialog-Mask-enter-active,
.DownloadDialog-Mask-leave-active {
  transition: opacity 200ms ease;
}

.DownloadDialog-Mask-enter-from,
.DownloadDialog-Mask-leave-to {
  opacity: 0;
}

.DownloadDialog-Card {
  width: min(1120px, 92vw);
  height: min(820px, 86vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
