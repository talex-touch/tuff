<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  const email = typeof route.query.email === 'string' ? route.query.email : ''
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!email || !token) {
    status.value = 'error'
    message.value = t('auth.verifyMissing', '缺少验证信息')
    return
  }

  try {
    await $fetch('/api/auth/verify', {
      method: 'POST',
      body: { email, token },
    })
    status.value = 'success'
  }
  catch (error: any) {
    status.value = 'error'
    message.value = error?.data?.statusMessage || error?.message || t('auth.verifyFailed', '验证失败')
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md rounded-3xl border border-primary/10 bg-white/80 p-8 text-center shadow-lg dark:border-light/10 dark:bg-dark/70">
      <div v-if="status === 'loading'" class="space-y-4">
        <span class="i-carbon-circle-dash animate-spin text-3xl text-primary" />
        <p class="text-sm text-black/70 dark:text-light/70">
          {{ t('auth.verifying', '正在验证邮箱...') }}
        </p>
      </div>
      <div v-else-if="status === 'success'" class="space-y-4">
        <span class="i-carbon-checkmark-filled text-3xl text-green-500" />
        <p class="text-sm text-black/70 dark:text-light/70">
          {{ t('auth.verifySuccess', '验证成功，请登录') }}
        </p>
        <NuxtLink
          to="/sign-in"
          class="inline-flex items-center justify-center rounded-full bg-dark px-6 py-2 text-sm text-white font-medium dark:bg-light dark:text-black"
        >
          {{ t('auth.signIn', '登录') }}
        </NuxtLink>
      </div>
      <div v-else class="space-y-4">
        <span class="i-carbon-warning-filled text-3xl text-red-500" />
        <p class="text-sm text-red-500">
          {{ message }}
        </p>
        <NuxtLink
          to="/sign-in"
          class="inline-flex items-center justify-center rounded-full border border-primary/20 px-6 py-2 text-sm text-black font-medium dark:text-light"
        >
          {{ t('auth.backToSignIn', '返回登录') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
