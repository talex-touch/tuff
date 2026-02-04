<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t, locale, setLocale } = useI18n()
const route = useRoute()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const success = ref(false)
const errorMessage = ref('')

const redirectTarget = computed(() => {
  const redirect = route.query.redirect_url
  if (typeof redirect === 'string' && redirect.length > 0) {
    return redirect
  }
  return '/dashboard'
})

const langParam = computed(() => {
  const raw = route.query.lang
  if (!raw)
    return null
  const value = Array.isArray(raw) ? raw[0] : raw
  return value || null
})

const localeFromQuery = computed(() => {
  const param = langParam.value
  if (!param)
    return null
  const normalized = param.toLowerCase()
  if (normalized.startsWith('zh'))
    return 'zh'
  if (normalized.startsWith('en'))
    return 'en'
  return null
})

watchEffect(() => {
  const next = localeFromQuery.value
  if (next && next !== locale.value)
    setLocale(next)
})

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const signInUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: redirectTarget.value,
  })
  return `/sign-in?${params.toString()}`
})

async function handleRegister() {
  errorMessage.value = ''
  success.value = false
  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = t('auth.invalidEmail', '请输入有效邮箱')
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
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: email.value.trim().toLowerCase(),
        password: password.value,
        name: name.value.trim() || null,
      },
    })
    success.value = true
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.registerFailed', '注册失败')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md space-y-8 rounded-3xl border border-primary/10 bg-white/80 p-8 shadow-lg dark:border-light/10 dark:bg-dark/70">
      <header class="space-y-2 text-center">
        <h1 class="text-2xl font-semibold text-black dark:text-light">
          {{ t('auth.signUpTitle', '创建账号') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('auth.signUpSubtitle', '邮箱 + 密码注册，验证邮箱后即可登录') }}
        </p>
      </header>

      <div class="space-y-4">
        <Input v-model="name" type="text" :placeholder="t('auth.name', '昵称（可选）')" />
        <Input v-model="email" type="text" :placeholder="t('auth.email', '邮箱')" />
        <Input v-model="password" type="password" :placeholder="t('auth.password', '密码')" />
        <Input v-model="confirmPassword" type="password" :placeholder="t('auth.confirmPassword', '确认密码')" />
        <Button block :loading="loading" @click="handleRegister">
          {{ t('auth.signUp', '注册') }}
        </Button>
        <NuxtLink :to="signInUrl" class="text-center text-xs text-black/60 underline-offset-4 hover:underline dark:text-light/70">
          {{ t('auth.alreadyHaveAccount', '已有账号？去登录') }}
        </NuxtLink>
      </div>

      <p
        v-if="success"
        class="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 dark:bg-green-500/10 dark:text-green-200"
      >
        {{ t('auth.registerSuccess', '注册成功，请检查邮箱完成验证。') }}
      </p>
      <p
        v-if="errorMessage"
        class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200"
      >
        {{ errorMessage }}
      </p>
    </div>

    <div class="fixed bottom-6 left-6">
      <NuxtLink
        to="/"
        class="text-sm font-medium text-black/70 underline-offset-4 transition hover:text-black hover:underline dark:text-light/70 dark:hover:text-light"
      >
        {{ t('auth.backToHome') }}
      </NuxtLink>
    </div>
    <div class="fixed bottom-6 right-6">
      <LanguageToggle />
    </div>
  </div>
</template>
