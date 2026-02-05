<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'
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

const passwordValue = computed({
  get: () => props.password,
  set: (value: string) => emit('update:password', value),
})
</script>

<template>
  <div class="auth-step">
    <div class="auth-row">
      <span>{{ emailPreview }}</span>
      <Button variant="ghost" size="sm" class="auth-text-button" @click="emit('reset-email')">
        {{ t('auth.changeEmail', '更换邮箱') }}
      </Button>
    </div>
    <Input v-model="passwordValue" type="password" :placeholder="t('auth.password', '密码')" class="auth-input" />
    <div class="auth-row">
      <Button variant="ghost" size="sm" class="auth-text-button" @click="emit('forgot')">
        {{ t('auth.forgotPassword', '忘记密码？') }}
      </Button>
      <Button variant="ghost" size="sm" class="auth-text-button" @click="emit('reset-email')">
        {{ t('auth.changeEmail', '更换邮箱') }}
      </Button>
    </div>
    <Button class="auth-button auth-button--primary" size="lg" block :loading="loading" @click="emit('sign-in')">
      {{ t('auth.signIn', '登录') }}
    </Button>
    <Button class="auth-button auth-button--ghost" size="lg" block :loading="magicLoading" @click="emit('magic-link')">
      {{ magicSent ? t('auth.magicSent', '已发送 Magic Link') : t('auth.magicLink', '发送 Magic Link') }}
    </Button>
  </div>
</template>
