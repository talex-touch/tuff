<script setup lang="ts">
import { ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const success = ref(false)
const errorMessage = ref('')

async function handleReset() {
  errorMessage.value = ''
  success.value = false
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    errorMessage.value = t('auth.resetTokenMissing', '重置链接无效')
    return
  }
  if (password.value.length < 8) {
    errorMessage.value = t('auth.passwordTooShort', '密码至少 8 位')
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = t('auth.passwordMismatch', '两次密码不一致')
    return
  }

  loading.value = true
  try {
    await $fetch('/api/auth/password/reset', {
      method: 'POST',
      body: {
        token,
        password: password.value,
      },
    })
    success.value = true
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.resetFailed', '重置失败')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md space-y-6 rounded-3xl border border-primary/10 bg-white/80 p-8 shadow-lg dark:border-light/10 dark:bg-dark/70">
      <header class="text-center space-y-2">
        <h1 class="text-2xl font-semibold text-black dark:text-light">
          {{ t('auth.resetTitle', '重置密码') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('auth.resetSubtitle', '设置新密码后即可登录') }}
        </p>
      </header>

      <Input v-model="password" type="password" :placeholder="t('auth.password', '新密码')" />
      <Input v-model="confirmPassword" type="password" :placeholder="t('auth.confirmPassword', '确认密码')" />
      <TxButton block :loading="loading" @click="handleReset">
        {{ t('auth.resetPassword', '更新密码') }}
      </TxButton>
      <NuxtLink to="/sign-in" class="text-center text-xs text-black/60 underline-offset-4 hover:underline dark:text-light/70">
        {{ t('auth.backToSignIn', '返回登录') }}
      </NuxtLink>

      <p
        v-if="success"
        class="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 dark:bg-green-500/10 dark:text-green-200"
      >
        {{ t('auth.resetSuccess', '密码已更新，请登录') }}
      </p>
      <p
        v-if="errorMessage"
        class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200"
      >
        {{ errorMessage }}
      </p>
    </div>
  </div>
</template>
