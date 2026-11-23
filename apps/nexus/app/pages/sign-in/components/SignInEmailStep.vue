<script setup lang="ts">
import { computed } from 'vue'
import LinuxdoIcon from '~/components/icon/LinuxdoIcon.vue'
import type { LoginMethod } from '~/composables/useSignIn'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  email: string
  lastLoginMethod: LoginMethod | null
  passkeyLoading: boolean
  emailCheckLoading: boolean
  supportsPasskey: boolean
}>()

const emit = defineEmits<{
  (e: 'update:email', value: string): void
  (e: 'passkey'): void
  (e: 'email-next'): void
  (e: 'github'): void
  (e: 'linuxdo'): void
}>()

const emailValue = computed({
  get: () => props.email,
  set: (value: string) => emit('update:email', value),
})

const lastMethod = computed(() => {
  if (props.lastLoginMethod === 'magic')
    return 'email'
  return props.lastLoginMethod
})

const lastUsedLabel = computed(() => props.t('auth.lastUsed', '上次使用'))
</script>

<template>
  <div class="auth-step">
    <div class="auth-method auth-method--full">
      <button
        type="button"
        class="auth-button auth-button--ghost"
        :aria-label="t('auth.oauthLinuxdo', 'LinuxDO')"
        @click="emit('linuxdo')"
      >
        <LinuxdoIcon :size="18" />
        <span>{{ t('auth.oauthLinuxdo', 'LinuxDO') }}</span>
      </button>
      <span v-if="lastMethod === 'linuxdo'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </span>
    </div>

    <div class="auth-method auth-method--full">
      <button
        type="button"
        class="auth-button auth-button--ghost"
        :aria-label="t('auth.oauthGithub', 'GitHub')"
        @click="emit('github')"
      >
        <span class="i-carbon-logo-github text-base" aria-hidden="true" />
        <span>{{ t('auth.oauthGithub', 'GitHub') }}</span>
      </button>
      <span v-if="lastMethod === 'github'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </span>
    </div>

    <div class="auth-method auth-method--full">
      <button
        type="button"
        class="auth-button auth-button--ghost auth-button--passkey"
        :disabled="!supportsPasskey || passkeyLoading"
        :aria-busy="passkeyLoading"
        @click="emit('passkey')"
      >
        <span v-if="passkeyLoading" class="auth-button__spinner" aria-hidden="true" />
        <span v-else class="i-carbon-fingerprint-recognition text-base" aria-hidden="true" />
        <span>{{ t('auth.passkeyLogin', 'Passkey') }}</span>
      </button>
      <span v-if="lastMethod === 'passkey'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </span>
    </div>

    <div class="auth-divider">
      <span class="auth-divider__line" />
      <span>OR</span>
      <span class="auth-divider__line" />
    </div>

    <input
      v-model="emailValue"
      type="text"
      autocomplete="email"
      :placeholder="t('auth.email', '邮箱')"
      class="auth-input"
      @keydown.enter.prevent="!emailCheckLoading && emit('email-next')"
    >

    <div class="auth-method auth-method--full">
      <button
        type="button"
        class="auth-button auth-button--primary"
        :disabled="emailCheckLoading"
        :aria-busy="emailCheckLoading"
        @click="emit('email-next')"
      >
        <span v-if="emailCheckLoading" class="auth-button__spinner auth-button__spinner--dark" aria-hidden="true" />
        <span>{{ t('auth.continueWithEmail', 'Continue with Email') }}</span>
      </button>
      <span v-if="lastMethod === 'email'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.auth-method {
  position: relative;
  display: flex;
  align-items: center;
}

.auth-method--full {
  width: 100%;
}

.auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease, transform 0.12s ease;
}

.auth-button:active:not(:disabled) {
  transform: scale(0.99);
}

.auth-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-button:focus-visible {
  outline: 2px solid rgba(167, 139, 250, 0.8);
  outline-offset: 2px;
}

.auth-button--ghost {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
}

.auth-button--ghost:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.1);
}

.auth-button--primary {
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: #fff;
  color: #09090b;
  font-weight: 600;
}

.auth-button--primary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.9);
}

.auth-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.auth-input::placeholder {
  color: rgba(255, 255, 255, 0.42);
}

.auth-input:focus {
  border-color: rgba(167, 139, 250, 0.72);
  background: rgba(255, 255, 255, 0.08);
}

.auth-button__spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: #fff;
  border-radius: 999px;
  animation: auth-btn-spin 0.75s linear infinite;
}

.auth-button__spinner--dark {
  border-color: rgba(9, 9, 11, 0.25);
  border-top-color: #09090b;
}

@keyframes auth-btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.auth-last-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(167, 139, 250, 0.45);
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.2);
  color: rgba(229, 220, 255, 0.95);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  padding: 2px 6px;
  letter-spacing: 0.02em;
  pointer-events: none;
}
</style>
