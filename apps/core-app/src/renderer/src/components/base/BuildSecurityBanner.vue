<template>
  <Transition name="banner-slide">
    <div
      v-if="showBanner"
      class="build-security-banner"
      :class="{ 'verification-failed': verificationFailed }"
    >
      <div class="banner-content">
        <div class="banner-icon">
          <i class="i-ri-error-warning-line" v-if="verificationFailed" />
          <i class="i-ri-information-line" v-else />
        </div>
        <div class="banner-text">
          <div class="banner-title">
            {{ verificationFailed ? '构建验证失败' : '非官方构建' }}
          </div>
          <div class="banner-description">
            {{
              verificationFailed
                ? '应用签名验证失败，可能已被修改，请谨慎使用'
                : '当前版本未通过官方构建验证，可能不安全'
            }}
          </div>
        </div>
        <button class="banner-close" @click="dismissBanner">
          <i class="i-ri-close-line" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { touchChannel } from '@modules/channel/channel-core'

const showBanner = ref(false)
const verificationFailed = ref(false)
const dismissed = ref(false)

interface VerificationStatus {
  isOfficialBuild: boolean
  verificationFailed: boolean
  hasOfficialKey: boolean
}

onMounted(() => {
  // 监听构建验证状态
  touchChannel.regChannel('build:verification-status', ({ data }) => {
    const status = data as VerificationStatus

    // 如果不是官方构建或验证失败，显示横幅
    if (!status.isOfficialBuild || status.verificationFailed) {
      if (!dismissed.value) {
        showBanner.value = true
        verificationFailed.value = status.verificationFailed || false
      }
    }
  })
})

function dismissBanner() {
  showBanner.value = false
  dismissed.value = true
}
</script>

<style lang="scss" scoped>
.build-security-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  background: var(--el-color-warning-light-9);
  border-bottom: 1px solid var(--el-color-warning);
  padding: 12px 16px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  &.verification-failed {
    background: var(--el-color-danger-light-9);
    border-bottom-color: var(--el-color-danger);
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1200px;
    margin: 0 auto;

    .banner-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--el-color-warning);
      font-size: 20px;

      .verification-failed & {
        color: var(--el-color-danger);
      }
    }

    .banner-text {
      flex: 1;
      min-width: 0;

      .banner-title {
        font-weight: 600;
        font-size: 14px;
        color: var(--el-text-color-primary);
        margin-bottom: 2px;
      }

      .banner-description {
        font-size: 12px;
        color: var(--el-text-color-regular);
        line-height: 1.4;
      }
    }

    .banner-close {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--el-text-color-secondary);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;

      &:hover {
        background: var(--el-fill-color-light);
        color: var(--el-text-color-primary);
      }

      i {
        font-size: 18px;
      }
    }
  }
}

.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: all 0.3s ease;
}

.banner-slide-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.banner-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>

