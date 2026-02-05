<script setup lang="ts">
import { TxSpinner, TxTransition } from '@talex-touch/tuffex'
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
    return props.errorMessage || props.t('auth.passkeyError', '出错了，请稍后再试。')
  return ''
})
</script>

<template>
  <div class="auth-step auth-passkey-step">
    <div class="auth-passkey-hero">
      <TxTransition preset="fade" mode="out-in" :duration="180">
        <div v-if="isVerifying" key="spinner" class="auth-passkey-spinner">
          <TxSpinner :size="26" />
        </div>
        <div v-else key="fingerprint" class="auth-passkey-icon" :class="{ 'is-blur': isPrepare }">
          <span class="i-carbon-fingerprint-recognition text-2xl" />
        </div>
      </TxTransition>

      <TxTransition preset="fade" mode="out-in" :duration="160">
        <p v-if="!isVerifying" :key="message" class="auth-passkey-text">
          {{ message }}
        </p>
      </TxTransition>
    </div>

    <div v-if="isError" class="auth-passkey-actions">
      <Button class="auth-button auth-button--primary" size="lg" block @click="emit('retry')">
        {{ t('auth.passkeyRetry', '重新尝试') }}
      </Button>
    </div>

    <TxTransition preset="fade" :duration="160">
      <Button
        v-if="!isVerifying"
        key="back"
        variant="ghost"
        size="sm"
        class="auth-text-button auth-passkey-back"
        :style="{ transitionDelay: isError ? '120ms' : '0ms' }"
        @click="emit('back')"
      >
        {{ t('auth.backToMethods', '返回') }}
      </Button>
    </TxTransition>
  </div>
</template>

<style scoped>
.auth-passkey-step {
  text-align: center;
}

.auth-passkey-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
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
  transition: filter 0.2s ease, opacity 0.2s ease;
}

.auth-passkey-icon.is-blur {
  filter: blur(6px);
  opacity: 0.65;
}

.auth-passkey-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.auth-passkey-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-passkey-back {
  align-self: center;
}
</style>
