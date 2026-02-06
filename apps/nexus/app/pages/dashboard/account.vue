<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, ref, watch } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

defineI18nRoute(false)

const { t } = useI18n()
const { user, refresh } = useAuthUser()
const { signIn } = useAuth()

const OAUTH_STATE_KEY = 'tuff_oauth_state'

const displayName = ref('')
const savingProfile = ref(false)
const profileMessage = ref('')

const magicLinkMessage = ref('')
const linkingGithub = ref(false)
const sendingMagic = ref(false)

const supportsPasskey = ref(false)
const passkeyLoading = ref(false)
const passkeyMessage = ref('')

const { data: loginHistory, pending: historyPending, refresh: refreshHistory } = useFetch<any[]>('/api/login-history')
const handleRefreshHistory = () => refreshHistory()

const emailState = computed(() => user.value?.emailState ?? 'unverified')
const emailLabel = computed(() => {
  if (!user.value)
    return ''
  if (emailState.value === 'missing')
    return t('auth.accountNoEmail', '未绑定邮箱')
  return user.value.email || ''
})
const isEmailVerified = computed(() => emailState.value === 'verified')
const isRestricted = computed(() => user.value?.isRestricted ?? emailState.value !== 'verified')

watch(
  () => user.value,
  (value) => {
    displayName.value = value?.name || ''
  },
  { immediate: true },
)

onMounted(() => {
  supportsPasskey.value = hasWindow() && Boolean(window.PublicKeyCredential)
})

async function saveProfile() {
  if (!user.value)
    return
  savingProfile.value = true
  profileMessage.value = ''
  try {
    await $fetch('/api/auth/profile', {
      method: 'PATCH',
      body: {
        name: displayName.value.trim(),
      },
    })
    await refresh()
    profileMessage.value = t('dashboard.account.profileSaved', '已保存')
  }
  catch (error: any) {
    profileMessage.value = error?.data?.statusMessage || error?.message || t('dashboard.account.profileSaveFailed', '保存失败')
  }
  finally {
    savingProfile.value = false
  }
}

async function handleGithubLink() {
  if (linkingGithub.value)
    return
  linkingGithub.value = true
  try {
    const redirectUrl = '/dashboard/account'
    const callbackUrl = `/sign-in?${new URLSearchParams({
      oauth: '1',
      flow: 'bind',
      provider: 'github',
      redirect_url: redirectUrl,
    }).toString()}`
    if (hasWindow()) {
      window.localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({
        flow: 'bind',
        provider: 'github',
        redirect: redirectUrl,
        ts: Date.now(),
      }))
    }
    await signIn('github', { callbackUrl })
  }
  catch (error: any) {
    magicLinkMessage.value = error?.data?.statusMessage || error?.message || t('auth.githubFailed', 'GitHub 绑定失败')
  }
  finally {
    linkingGithub.value = false
  }
}

async function handleMagicLink() {
  if (emailState.value === 'missing') {
    magicLinkMessage.value = t('auth.accountNoEmail', '未绑定邮箱')
    return
  }
  if (!user.value?.email)
    return
  sendingMagic.value = true
  magicLinkMessage.value = ''
  try {
    const result = await signIn('email', {
      email: user.value.email,
      redirect: false,
      callbackUrl: '/dashboard/account',
    })
    if (result?.error) {
      magicLinkMessage.value = result.error
    }
    else {
      magicLinkMessage.value = t('auth.magicSent', 'Magic Link 已发送')
    }
  }
  catch (error: any) {
    magicLinkMessage.value = error?.data?.statusMessage || error?.message || t('auth.magicLinkFailed', '发送失败')
  }
  finally {
    sendingMagic.value = false
  }
}

async function handlePasskeyRegister() {
  if (!supportsPasskey.value) {
    passkeyMessage.value = t('auth.passkeyNotSupported', '当前浏览器不支持 Passkey')
    return
  }
  passkeyLoading.value = true
  passkeyMessage.value = ''
  try {
    const options = await $fetch<any>('/api/passkeys/register-options', { method: 'POST' })
    const publicKey: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: base64UrlToBuffer(options.challenge),
      user: {
        ...options.user,
        id: base64UrlToBuffer(options.user.id),
      },
    }
    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null
    if (!credential) {
      passkeyMessage.value = t('auth.passkeyCancelled', '操作已取消')
      return
    }
    const payload = serializeCredential(credential)
    await $fetch('/api/passkeys/register-verify', {
      method: 'POST',
      body: { credential: payload },
    })
    passkeyMessage.value = t('auth.passkeySuccess', 'Passkey 已绑定')
  }
  catch (error: any) {
    passkeyMessage.value = error?.data?.statusMessage || error?.message || t('auth.passkeyFailed', '绑定失败')
  }
  finally {
    passkeyLoading.value = false
  }
}

const historyItems = computed(() => loginHistory.value ?? [])

function formatHistoryTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.account.title', '账户设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.account.description', '管理账户信息与登录方式') }}
      </p>
    </header>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-4">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.account.profile', '个人资料') }}
      </h2>
      <div class="space-y-3">
        <label class="text-xs text-black/60 dark:text-light/60">
          {{ t('auth.email', '邮箱') }}
        </label>
        <div class="flex flex-wrap items-center gap-2 text-sm text-black dark:text-light">
          <span>{{ emailLabel }}</span>
          <span
            class="rounded-full px-2 py-0.5 text-xs"
            :class="isEmailVerified ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'"
          >
            {{ isEmailVerified ? t('auth.verified', '已验证') : t('auth.unverified', '未验证') }}
          </span>
        </div>
        <p
          v-if="isRestricted"
          class="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
        >
          {{ t('auth.restrictedAccount', '邮箱未验证，充值与同步功能暂不可用。') }}
        </p>
        <label class="text-xs text-black/60 dark:text-light/60">
          {{ t('dashboard.account.displayName', '显示名称') }}
        </label>
        <Input v-model="displayName" type="text" :placeholder="t('dashboard.account.displayNamePlaceholder', '输入显示名称')" />
        <div class="flex items-center gap-2">
          <Button size="small" :loading="savingProfile" @click="saveProfile">
            {{ t('common.save', '保存') }}
          </Button>
          <span v-if="profileMessage" class="text-xs text-black/60 dark:text-light/60">
            {{ profileMessage }}
          </span>
        </div>
      </div>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-4">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.account.loginMethods', '登录方式') }}
      </h2>
      <div class="flex flex-col gap-3">
        <Button variant="secondary" :loading="linkingGithub" @click="handleGithubLink">
          {{ t('auth.githubLogin', '绑定 GitHub') }}
        </Button>
        <Button variant="secondary" :loading="sendingMagic" :disabled="emailState === 'missing'" @click="handleMagicLink">
          {{ t('auth.magicLink', '发送 Magic Link') }}
        </Button>
        <Button
          v-if="supportsPasskey"
          variant="secondary"
          :loading="passkeyLoading"
          @click="handlePasskeyRegister"
        >
          {{ t('auth.passkeyRegister', '添加 Passkey') }}
        </Button>
        <p v-if="magicLinkMessage" class="text-xs text-black/60 dark:text-light/60">
          {{ magicLinkMessage }}
        </p>
        <p v-if="passkeyMessage" class="text-xs text-black/60 dark:text-light/60">
          {{ passkeyMessage }}
        </p>
      </div>
      <NuxtLink to="/forgot-password" class="text-xs text-black/60 underline-offset-4 hover:underline dark:text-light/70">
        {{ t('auth.resetPassword', '重置密码') }}
      </NuxtLink>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg text-black font-semibold dark:text-light">
          {{ t('dashboard.account.loginHistory', '登录历史') }}
        </h2>
        <Button size="small" variant="secondary" @click="handleRefreshHistory">
          {{ t('common.refresh', '刷新') }}
        </Button>
      </div>
      <div v-if="historyPending" class="flex items-center justify-center py-4">
        <span class="i-carbon-circle-dash animate-spin text-primary" />
      </div>
      <ul v-else-if="historyItems.length" class="space-y-2 text-sm">
        <li
          v-for="item in historyItems"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40"
        >
          <div class="space-y-1">
            <p class="text-black dark:text-light">
              {{ item.success ? t('dashboard.account.loginSuccess', '登录成功') : t('dashboard.account.loginFailed', '登录失败') }}
              <span class="text-xs text-black/50 dark:text-light/50">· {{ item.reason || '-' }}</span>
            </p>
            <p class="text-xs text-black/50 dark:text-light/50">
              {{ formatHistoryTime(item.created_at) }} · {{ item.ip || 'unknown' }}
            </p>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-xs"
            :class="item.success ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'"
          >
            {{ item.success ? t('dashboard.account.statusSuccess', 'Success') : t('dashboard.account.statusFailed', 'Failed') }}
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-black/60 dark:text-light/70">
        {{ t('dashboard.account.noHistory', '暂无登录记录') }}
      </p>
    </section>
  </div>
</template>
