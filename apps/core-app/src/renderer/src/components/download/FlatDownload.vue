<script setup lang="ts" name="FlatDownload">
import FlatButton from '../base/button/FlatButton.vue'
import { Download } from '@element-plus/icons-vue'
import { useAuth } from '~/modules/auth/useAuth'

const { isLoggedIn } = useAuth()
</script>

<template>
  <FlatButton :class="{ active: isLoggedIn }" class="download-btn">
    <el-icon :size="16">
      <Download />
    </el-icon>
    <span class="download-text">下载管理</span>
  </FlatButton>
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
