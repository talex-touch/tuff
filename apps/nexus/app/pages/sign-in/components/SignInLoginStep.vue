<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  emailPreview: string
  password: string
  loading: boolean
  magicLoading: boolean
  magicSent: boolean
}>()

const emit = defineEmits<{
  (e: 'update:password', value: string): void
  (e: 'sign-in'): void
  (e: 'magic-link'): void
  (e: 'reset-email'): void
  (e: 'forgot'): void
}>()

const showPassword = ref(false)

const passwordValue = computed({
  get: () => props.password,
  set: (value: string) => emit('update:password', value),
})

const passwordInputType = computed(() => (showPassword.value ? 'text' : 'password'))

const passwordToggleLabel = computed(() => {
  return showPassword.value
    ? props.t('auth.hidePassword', '隐藏')
    : props.t('auth.showPassword', '显示')
})

const signInLabel = computed(() => {
  return props.loading
    ? props.t('auth.signingIn', '登录中...')
    : props.t('auth.signIn', '登录')
})
</script>

<template>
  <div class="auth-step">
    <div class="auth-row">
      <span>{{ emailPreview }}</span>
      <TxButton variant="ghost" size="sm" class="auth-text-button" @click="emit('reset-email')">
        {{ t('auth.changeEmail', '更换邮箱') }}
      </TxButton>
    </div>

    <Input v-model="passwordValue" :type="passwordInputType" :placeholder="t('auth.password', '密码')" class="auth-input">
      <template #suffix>
        <button
          type="button"
          class="auth-password-toggle"
          :aria-label="passwordToggleLabel"
          @click="showPassword = !showPassword"
        >
          <span :class="showPassword ? 'i-carbon-view-off' : 'i-carbon-view'" />
          <span>{{ passwordToggleLabel }}</span>
        </button>
      </template>
    </Input>

    <div class="auth-row">
      <TxButton variant="ghost" size="sm" class="auth-text-button" @click="emit('forgot')">
        {{ t('auth.forgotPassword', '忘记密码？') }}
      </TxButton>
      <TxButton variant="ghost" size="sm" class="auth-text-button" @click="emit('reset-email')">
        {{ t('auth.backToMethods', '返回') }}
      </TxButton>
    </div>

    <TxButton class="auth-button auth-button--primary" size="lg" block :loading="loading" @click="emit('sign-in')">
      {{ signInLabel }}
    </TxButton>

    <TxButton class="auth-button auth-button--ghost" size="lg" block :loading="magicLoading" @click="emit('magic-link')">
      {{ magicSent ? t('auth.magicSent', '已发送 Magic Link') : t('auth.magicLink', '发送 Magic Link') }}
    </TxButton>
  </div>
</template>

<style scoped>
.auth-password-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 11px;
  cursor: pointer;
}

.auth-password-toggle:hover {
  color: rgba(255, 255, 255, 0.88);
}
</style>
