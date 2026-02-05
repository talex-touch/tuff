<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuffex'
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  phase: 'idle' | 'prepare' | 'prompt' | 'verifying' | 'error' | 'success'
  errorMessage?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'back'): void
}>()

const isPrepare = computed(() => props.phase === 'prepare')
const isPrompt = computed(() => props.phase === 'prompt')
const isVerifying = computed(() => props.phase === 'verifying')
const isError = computed(() => props.phase === 'error')

const message = computed(() => {
  if (isPrepare.value)
    return props.t('auth.passkeyPreparing', '将调用系统 Passkey，这里就准备调用。')
  if (isPrompt.value)
    return props.t('auth.passkeyPrompt', '确认系统弹出完成验证。')
  if (isError.value)
    return props.t('auth.passkeyError', '出错了，请重试。')
  return ''
})

const showRetry = computed(() => isError.value)
</script>

<template>
  <div class="auth-step auth-passkey-step">
    <div class="auth-passkey-hero">
      <div class="auth-passkey-visual">
        <div class="auth-passkey-icon" :class="{ 'is-hidden': isVerifying, 'is-blur': isPrepare }">
          <span class="i-carbon-fingerprint-recognition text-2xl" />
        </div>
        <div class="auth-passkey-spinner" :class="{ 'is-visible': isVerifying }">
          <TxSpinner :size="26" />
        </div>
      </div>

      <p class="auth-passkey-text" :class="{ 'is-hidden': isVerifying }">
        {{ message }}
      </p>
    </div>

    <div class="auth-passkey-actions" :class="{ 'is-visible': showRetry }">
      <Button class="auth-button auth-button--primary" size="lg" block @click="emit('retry')">
        {{ t('auth.passkeyRetry', '重新尝试') }}
      </Button>
    </div>

    <Button
      variant="ghost"
      size="sm"
      class="auth-text-button auth-passkey-back"
      :class="{ 'is-visible': showRetry }"
      @click="emit('back')"
    >
      {{ t('auth.backToMethods', '返回') }}
    </Button>
  </div>
</template>

<style scoped>
.auth-passkey-step {
  text-align: center;
  min-height: 188px;
  justify-content: space-between;
}

.auth-passkey-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  min-height: 92px;
}

.auth-passkey-visual {
  position: relative;
  width: 48px;
  height: 48px;
}

.auth-passkey-icon,
.auth-passkey-spinner {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  transition: filter 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
  position: absolute;
  left: 0;
  top: 0;
}

.auth-passkey-icon.is-blur {
  filter: blur(6px);
  opacity: 0.65;
}

.auth-passkey-icon.is-hidden {
  opacity: 0;
  transform: scale(0.95);
}

.auth-passkey-spinner {
  opacity: 0;
  transform: scale(0.9);
}

.auth-passkey-spinner.is-visible {
  opacity: 1;
  transform: scale(1);
}

.auth-passkey-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  min-height: 34px;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  text-align: center;
}

.auth-passkey-text.is-hidden {
  opacity: 0;
}

.auth-passkey-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 46px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.auth-passkey-actions.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.auth-passkey-back {
  align-self: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.auth-passkey-back.is-visible {
  opacity: 1;
  pointer-events: auto;
  transition-delay: 120ms;
}
</style>
