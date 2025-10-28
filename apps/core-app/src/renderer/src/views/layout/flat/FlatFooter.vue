<template>
  <div class="FlatFooter">
    <FlatButton class="download-btn" @click="handleDownloadClick">
      <el-icon :size="16">
        <Download />
      </el-icon>
      <span class="download-text">下载管理</span>
    </FlatButton>
    <FlatUserInfo :current-user="currentUser" />
  </div>
</template>

<script lang="ts" setup>
/**
 * FlatFooter Component
 *
 * Footer component that combines download management button and user info
 *
 * Props:
 * - currentUser: User object for displaying user information
 *
 * Emits:
 * - click-download: Triggered when download management button is clicked
 */

import { Download } from '@element-plus/icons-vue'
import FlatUserInfo from './FlatUserInfo.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'

interface User {
  name: string
  email: string
  avatar?: string
}

defineProps<{
  currentUser?: User | null
}>()

const emit = defineEmits<{
  'click-download': []
}>()

const handleDownloadClick = () => {
  emit('click-download')
  // TODO: Navigate to download center or open download modal
  console.log('Download management clicked')
}
</script>

<style lang="scss" scoped>
/**
 * Flat Footer Styling
 * Contains download management button and user information
 */

.FlatFooter {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  -webkit-app-region: no-drag;

  .download-btn {
    width: calc(100% - 1rem);
    margin: 0.5rem 0.5rem 0.5rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 12px;

    .download-text {
      font-size: 12px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }

    .el-icon {
      color: var(--el-color-primary);
    }
  }
}
</style>
