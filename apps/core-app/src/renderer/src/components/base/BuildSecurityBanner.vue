<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

const { t } = useI18n()
const transport = useTuffTransport()
const showBanner = ref(false)
const verificationFailed = ref(false)
const dismissed = ref(false)

interface VerificationStatus {
  isOfficialBuild: boolean
  verificationFailed: boolean
  hasOfficialKey: boolean
}

function handleVerificationStatus(status: VerificationStatus) {
  if (!status.isOfficialBuild || status.verificationFailed) {
    if (!dismissed.value) {
      showBanner.value = true
      verificationFailed.value = status.verificationFailed || false
    }
  }
}

onMounted(async () => {
  const verificationStatusEvent = defineRawEvent<VerificationStatus, void>(
    'build:verification-status'
  )
  transport.on(verificationStatusEvent, (status) => {
    handleVerificationStatus(status)
  })

  try {
    const getVerificationStatus = defineRawEvent<void, VerificationStatus>(
      'build:get-verification-status'
    )
    const status = await transport.send(getVerificationStatus)
    if (status) {
      handleVerificationStatus(status as VerificationStatus)
    }
  } catch (error) {
    console.warn('[BuildSecurityBanner] Failed to get verification status:', error)
  }
})

function dismissBanner() {
  showBanner.value = false
  dismissed.value = true
}
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="showBanner"
      class="BuildSecurityBanner"
      :class="{ 'verification-failed': verificationFailed }"
    >
      <div class="BuildSecurityBanner-Bar" />
      <div class="BuildSecurityBanner-Content">
        <div class="banner-icon">
          <i v-if="verificationFailed" class="i-ri-error-warning-line" />
          <i v-else class="i-ri-information-line" />
        </div>
        <div class="banner-text">
          <div class="banner-title">
            {{
              verificationFailed
                ? t('buildSecurity.title.verificationFailed')
                : t('buildSecurity.title.unofficial')
            }}
          </div>
          <div class="banner-description">
            {{
              verificationFailed
                ? t('buildSecurity.description.verificationFailed')
                : t('buildSecurity.description.unofficial')
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

<style lang="scss" scoped>
.BuildSecurityBanner-Bar {
  z-index: 1;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 10%;

  filter: blur(2px) brightness(1.1);
  box-shadow: 0 4px 12px 2px var(--el-color-warning);
  background: var(--el-color-warning);
}

.BuildSecurityBanner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  background: var(--el-color-warning-light-9);
  border-bottom: 1px solid var(--el-color-warning);
  padding: 1rem 8rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  &.verification-failed {
    background: var(--el-color-danger-light-9);
    border-bottom-color: var(--el-color-danger);
  }

  &-Content {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1200px;
    margin: 0 auto;

    .banner-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
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
      width: 36px;
      height: 36px;
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
        font-size: 24px;
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
