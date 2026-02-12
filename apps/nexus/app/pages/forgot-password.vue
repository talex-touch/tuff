<script setup lang="ts">
import { ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const email = ref('')
const loading = ref(false)
const success = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  success.value = false
  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = t('auth.invalidEmail', '请输入有效邮箱')
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/password/forgot', {
      method: 'POST',
      body: { email: email.value.trim().toLowerCase() },
    })
    success.value = true
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.resetFailed', '发送失败')
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
          {{ t('auth.forgotTitle', '找回密码') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('auth.forgotSubtitle', '输入邮箱，我们会发送重置链接') }}
        </p>
      </header>

      <Input v-model="email" type="text" :placeholder="t('auth.email', '邮箱')" />
      <TxButton block :loading="loading" @click="handleSubmit">
        {{ t('auth.sendReset', '发送重置邮件') }}
      </TxButton>
      <NuxtLink to="/sign-in" class="text-center text-xs text-black/60 underline-offset-4 hover:underline dark:text-light/70">
        {{ t('auth.backToSignIn', '返回登录') }}
      </NuxtLink>

      <p
        v-if="success"
        class="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 dark:bg-green-500/10 dark:text-green-200"
      >
        {{ t('auth.resetEmailSent', '如果邮箱存在，我们已发送重置链接。') }}
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
