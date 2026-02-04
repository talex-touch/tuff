<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t, locale, setLocale } = useI18n()
const route = useRoute()
const { signIn } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const magicLoading = ref(false)
const errorMessage = ref('')
const magicSent = ref(false)
const supportsPasskey = ref(false)

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
const signUpUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: redirectTarget.value,
  })
  return `/sign-up?${params.toString()}`
})

const forgotUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
  })
  return `/forgot-password?${params.toString()}`
})

onMounted(() => {
  supportsPasskey.value = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential)
})

async function handlePasswordSignIn() {
  errorMessage.value = ''
  magicSent.value = false
  loading.value = true
  try {
    const result = await signIn('credentials', {
      email: email.value.trim().toLowerCase(),
      password: password.value,
      redirect: false,
    })
    if (result?.error) {
      errorMessage.value = result.error
      return
    }
    await navigateTo(redirectTarget.value)
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.loginFailed', 'Login failed')
  }
  finally {
    loading.value = false
  }
}

async function handleMagicLink() {
  errorMessage.value = ''
  magicSent.value = false
  if (!email.value) {
    errorMessage.value = t('auth.invalidEmail', '请输入有效邮箱')
    return
  }
  magicLoading.value = true
  try {
    const result = await signIn('email', {
      email: email.value.trim().toLowerCase(),
      redirect: false,
      callbackUrl: redirectTarget.value,
    })
    if (result?.error) {
      errorMessage.value = result.error
      return
    }
    magicSent.value = true
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.magicLinkFailed', 'Failed to send magic link')
  }
  finally {
    magicLoading.value = false
  }
}

async function handleGithubSignIn() {
  errorMessage.value = ''
  try {
    await signIn('github', { callbackUrl: redirectTarget.value })
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.githubFailed', 'GitHub sign-in failed')
  }
}

async function handlePasskeySignIn() {
  if (!supportsPasskey.value) {
    errorMessage.value = t('auth.passkeyNotSupported', 'Passkeys not supported in this browser.')
    return
  }
  if (!email.value) {
    errorMessage.value = t('auth.passkeyNeedEmail', 'Please enter your email first.')
    return
  }

  errorMessage.value = ''
  passkeyLoading.value = true

  try {
    const options = await $fetch<any>('/api/passkeys/options', {
      query: { email: email.value.trim().toLowerCase() },
    })
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: base64UrlToBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentials: Array.isArray(options.allowCredentials)
        ? options.allowCredentials.map((cred: any) => ({
            ...cred,
            id: base64UrlToBuffer(cred.id),
          }))
        : undefined,
    }

    const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
    if (!credential) {
      errorMessage.value = t('auth.passkeyCancelled', 'Passkey cancelled.')
      return
    }

    const payload = serializeCredential(credential)
    const { token } = await $fetch<{ token: string }>('/api/passkeys/verify', {
      method: 'POST',
      body: { credential: payload },
    })

    const result = await signIn('credentials', { loginToken: token, redirect: false })
    if (result?.error) {
      errorMessage.value = result.error
      return
    }
    await navigateTo(redirectTarget.value)
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('auth.passkeyFailed', 'Passkey login failed')
  }
  finally {
    passkeyLoading.value = false
  }
}
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md space-y-8 rounded-3xl border border-primary/10 bg-white/80 p-8 shadow-lg dark:border-light/10 dark:bg-dark/70">
      <header class="space-y-2 text-center">
        <h1 class="text-2xl font-semibold text-black dark:text-light">
          {{ t('auth.signInTitle', '登录 Tuff') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('auth.signInSubtitle', '使用邮箱密码登录，也可绑定 GitHub / Magic Link / Passkeys') }}
        </p>
      </header>

      <div class="space-y-4">
        <Input v-model="email" type="text" :placeholder="t('auth.email', '邮箱')" />
        <Input v-model="password" type="password" :placeholder="t('auth.password', '密码')" />
        <div class="flex items-center justify-between text-xs text-black/60 dark:text-light/70">
          <NuxtLink :to="forgotUrl" class="hover:underline">
            {{ t('auth.forgotPassword', '忘记密码？') }}
          </NuxtLink>
          <NuxtLink :to="signUpUrl" class="hover:underline">
            {{ t('auth.createAccount', '注册新账号') }}
          </NuxtLink>
        </div>
        <Button block :loading="loading" @click="handlePasswordSignIn">
          {{ t('auth.signIn', '登录') }}
        </Button>
      </div>

      <div class="space-y-3 border-t border-primary/10 pt-4 dark:border-light/10">
        <Button
          variant="secondary"
          block
          :loading="magicLoading"
          @click="handleMagicLink"
        >
          {{ magicSent ? t('auth.magicSent', '已发送 Magic Link') : t('auth.magicLink', '发送 Magic Link') }}
        </Button>
        <Button variant="secondary" block @click="handleGithubSignIn">
          {{ t('auth.githubLogin', '使用 GitHub 登录') }}
        </Button>
        <Button
          v-if="supportsPasskey"
          variant="secondary"
          block
          :loading="passkeyLoading"
          @click="handlePasskeySignIn"
        >
          {{ t('auth.passkeyLogin', '使用 Passkey 登录') }}
        </Button>
      </div>

      <p v-if="errorMessage" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
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
