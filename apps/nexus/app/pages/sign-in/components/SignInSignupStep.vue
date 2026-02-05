<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  emailPreview: string
  password: string
  confirmPassword: string
  signupLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:password', value: string): void
  (e: 'update:confirmPassword', value: string): void
  (e: 'sign-up'): void
  (e: 'reset-email'): void
}>()

const passwordValue = computed({
  get: () => props.password,
  set: (value: string) => emit('update:password', value),
})

const confirmValue = computed({
  get: () => props.confirmPassword,
  set: (value: string) => emit('update:confirmPassword', value),
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
    <Input v-model="confirmValue" type="password" :placeholder="t('auth.confirmPassword', '确认密码')" class="auth-input" />
    <Button class="auth-button auth-button--primary" size="lg" block :loading="signupLoading" @click="emit('sign-up')">
      {{ t('auth.signUp', '注册') }}
    </Button>
  </div>
</template>
