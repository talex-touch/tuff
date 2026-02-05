<script setup lang="ts">
import { TxBadge } from '@talex-touch/tuffex'
import { computed } from 'vue'
import LinuxdoIcon from '~/components/icon/LinuxdoIcon.vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
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
  if (props.lastLoginMethod === 'password' || props.lastLoginMethod === 'magic')
    return 'email'
  return props.lastLoginMethod
})

const lastUsedLabel = computed(() => props.t('auth.lastUsed', '上次使用'))
</script>

<template>
  <div class="auth-step">
    <div class="auth-method auth-method--full">
      <Button
        class="auth-button auth-button--passkey"
        size="lg"
        block
        :loading="passkeyLoading"
        :disabled="!supportsPasskey"
        @click="emit('passkey')"
      >
        <span class="i-carbon-fingerprint-recognition text-base" />
        {{ t('auth.passkeyLogin', 'Login with Passkey') }}
      </Button>
      <TxBadge v-if="lastMethod === 'passkey'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </TxBadge>
    </div>

    <div class="auth-method auth-method--full">
      <Button
        variant="ghost"
        class="auth-button auth-button--ghost"
        size="lg"
        block
        :aria-label="t('auth.oauthGithub', 'GitHub')"
        @click="emit('github')"
      >
        <span class="i-carbon-logo-github text-base" />
        {{ t('auth.oauthGithub', 'GitHub') }}
      </Button>
      <TxBadge v-if="lastMethod === 'github'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </TxBadge>
    </div>

    <div class="auth-method auth-method--full">
      <Button
        variant="ghost"
        class="auth-button auth-button--ghost"
        size="lg"
        block
        :aria-label="t('auth.oauthLinuxdo', 'LinuxDO')"
        @click="emit('linuxdo')"
      >
        <LinuxdoIcon :size="18" />
        {{ t('auth.oauthLinuxdo', 'LinuxDO') }}
      </Button>
      <TxBadge v-if="lastMethod === 'linuxdo'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </TxBadge>
    </div>

    <div class="auth-divider">
      <span class="auth-divider__line" />
      <span>OR</span>
      <span class="auth-divider__line" />
    </div>

    <Input v-model="emailValue" type="text" :placeholder="t('auth.email', '邮箱')" class="auth-input" />

    <div class="auth-method auth-method--full">
      <Button class="auth-button auth-button--ghost" size="lg" block :loading="emailCheckLoading" @click="emit('email-next')">
        {{ t('auth.continueWithEmail', 'Continue with Email') }}
      </Button>
      <TxBadge v-if="lastMethod === 'email'" class="auth-last-badge">
        {{ lastUsedLabel }}
      </TxBadge>
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

.auth-last-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 2;
  font-size: 10px;
  padding: 2px 6px;
  letter-spacing: 0.02em;
  --tx-badge-bg: rgba(167, 139, 250, 0.2);
  --tx-badge-text: rgba(229, 220, 255, 0.95);
  --tx-badge-border: rgba(167, 139, 250, 0.45);
  pointer-events: none;
}

</style>
