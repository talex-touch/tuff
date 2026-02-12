<script setup lang="ts">
import { TxSpinner, TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
import LinuxdoIcon from '~/components/icon/LinuxdoIcon.vue'
import type { AuthFlow, OauthProvider } from '~/composables/useOauthContext'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  provider: OauthProvider | null
  flow: AuthFlow
  phase: 'idle' | 'redirect' | 'verifying' | 'error'
  errorMessage?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'back'): void
}>()

const providerLabel = computed(() => {
  if (props.provider === 'github')
    return 'GitHub'
  if (props.provider === 'linuxdo')
    return 'LinuxDO'
  return props.t('auth.oauthProvider', '第三方')
})

const isRedirect = computed(() => props.phase === 'redirect')
const isVerifying = computed(() => props.phase === 'verifying' || props.phase === 'idle')
const isError = computed(() => props.phase === 'error')

const message = computed(() => {
  if (isError.value)
    return props.errorMessage || props.t('auth.oauthError', '登录失败，请重试。')
  if (isRedirect.value) {
    if (props.flow === 'bind')
      return props.t('auth.oauthBindRedirect', `正在跳转到 ${providerLabel.value} 完成绑定...`)
    return props.t('auth.oauthRedirect', `正在跳转到 ${providerLabel.value}...`)
  }
  return props.t('auth.callbackProcessing', '正在处理登录回调，请稍候…')
})

const showRetry = computed(() => isError.value)
</script>

<template>
  <div class="auth-step auth-oauth-step">
    <div class="auth-oauth-hero">
      <div class="auth-oauth-visual">
        <div class="auth-oauth-icon" :class="{ 'is-hidden': isVerifying }">
          <span v-if="provider === 'github'" class="i-carbon-logo-github text-2xl" />
          <LinuxdoIcon v-else-if="provider === 'linuxdo'" :size="22" />
          <span v-else class="i-carbon-user text-2xl" />
        </div>
        <div class="auth-oauth-spinner" :class="{ 'is-visible': isVerifying }">
          <TxSpinner :size="26" />
        </div>
      </div>

      <p class="auth-oauth-text">
        {{ message }}
      </p>
    </div>

    <div v-if="showRetry" class="auth-oauth-actions">
      <TxButton class="auth-button auth-button--primary" size="lg" block @click="emit('retry')">
        {{ t('auth.oauthRetry', '重新尝试') }}
      </TxButton>
      <TxButton variant="ghost" size="sm" class="auth-text-button auth-oauth-back" @click="emit('back')">
        {{ t('auth.backToMethods', '返回') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.auth-oauth-step {
  text-align: center;
  min-height: 188px;
  justify-content: space-between;
}

.auth-oauth-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  min-height: 92px;
}

.auth-oauth-visual {
  position: relative;
  width: 48px;
  height: 48px;
}

.auth-oauth-icon,
.auth-oauth-spinner {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  transition: opacity 0.2s ease, transform 0.2s ease;
  position: absolute;
  left: 0;
  top: 0;
}

.auth-oauth-icon.is-hidden {
  opacity: 0;
  transform: scale(0.95);
}

.auth-oauth-spinner {
  opacity: 0;
  transform: scale(0.9);
}

.auth-oauth-spinner.is-visible {
  opacity: 1;
  transform: scale(1);
}

.auth-oauth-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  min-height: 34px;
  max-width: 320px;
  display: flex;
  align-items: center;
  text-align: center;
}

.auth-oauth-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: min(320px, 100%);
  min-height: 46px;
  margin: 0 auto;
}

.auth-oauth-back {
  align-self: center;
  margin-top: -2px;
}
</style>
