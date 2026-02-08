<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, ref, watch } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
import { buildOauthCallbackUrl, persistOauthContext, type OauthProvider } from '~/composables/useOauthContext'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

defineI18nRoute(false)

const { t } = useI18n()
const { user, refresh } = useAuthUser()
const { signIn } = useAuth()


const displayName = ref('')
const savingProfile = ref(false)
const profileMessage = ref('')

const oauthMessage = ref('')
const linkingGithub = ref(false)
const linkingLinuxdo = ref(false)

const supportsPasskey = ref(false)
const passkeyLoading = ref(false)
const passkeyMessage = ref('')

const hasBoundPasskey = computed(() => (user.value?.passkeyCount ?? 0) > 0)

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
const roleLabel = computed(() => (user.value?.role ?? 'user').toUpperCase())
const roleClass = computed(() => (user.value?.role === 'admin'
  ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300'
  : 'bg-slate-500/20 text-slate-600 dark:text-slate-300'))

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

async function startOauthBind(provider: OauthProvider) {
  const loadingState = provider === 'github' ? linkingGithub : linkingLinuxdo
  if (loadingState.value)
    return

  loadingState.value = true
  oauthMessage.value = ''

  try {
    const redirect = '/dashboard/account'
    const callbackUrl = buildOauthCallbackUrl({
      flow: 'bind',
      provider,
      redirect,
    })

    persistOauthContext({
      flow: 'bind',
      provider,
      redirect,
    })

    await signIn(provider, { callbackUrl })
  }
  catch (error: any) {
    oauthMessage.value = error?.data?.statusMessage
      || error?.message
      || (provider === 'github'
        ? t('auth.githubFailed', 'GitHub 绑定失败')
        : t('auth.linuxdoFailed', 'LinuxDO 绑定失败'))
  }
  finally {
    loadingState.value = false
  }
}

async function handleGithubLink() {
  await startOauthBind('github')
}

async function handleLinuxdoLink() {
  await startOauthBind('linuxdo')
}

async function handlePasskeyRegister() {
  if (!supportsPasskey.value) {
    passkeyMessage.value = t('auth.passkeyNotSupported', '当前浏览器不支持 Passkey')
    return
  }
  if (hasBoundPasskey.value) {
    passkeyMessage.value = t('dashboard.account.passkeyBoundHint', '当前账号已绑定 Passkey')
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
    await refresh()
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
const abnormalHistory = computed(() => historyItems.value.filter(item => !item.success))
const commonHistory = computed(() => historyItems.value.filter(item => item.success).slice(0, 5))

function formatHistoryTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
}

const { deviceId: currentDeviceId, deviceName: currentDeviceName, setDeviceName } = useDeviceIdentity()
const { data: deviceData, pending: devicePending, refresh: refreshDevices } = useFetch<DeviceItem[]>('/api/devices')
const actionLoading = ref(false)
const editingId = ref<string | null>(null)
const renameValue = ref('')

const devices = computed(() => deviceData.value ?? [])

function isCurrent(device: DeviceItem) {
  return device.id === currentDeviceId.value
}

function formatLastActive(value: string | null) {
  if (!value)
    return t('dashboard.devices.unknown', '未知')
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1)
    return t('dashboard.devices.justNow', '刚刚')
  if (minutes < 60)
    return t('dashboard.devices.minutesAgo', { n: minutes })
  if (hours < 24)
    return t('dashboard.devices.hoursAgo', { n: hours })
  return t('dashboard.devices.daysAgo', { n: days })
}

function startRename(device: DeviceItem) {
  editingId.value = device.id
  renameValue.value = device.deviceName || currentDeviceName.value || ''
}

function cancelRename() {
  editingId.value = null
  renameValue.value = ''
}

async function saveRename(device: DeviceItem) {
  if (!renameValue.value.trim())
    return
  actionLoading.value = true
  try {
    await $fetch('/api/devices/rename', {
      method: 'POST',
      body: { deviceId: device.id, name: renameValue.value.trim() },
    })
    if (isCurrent(device))
      setDeviceName(renameValue.value.trim())
    await refreshDevices()
    cancelRename()
  }
  catch (error) {
    console.error('Failed to rename device:', error)
  }
  finally {
    actionLoading.value = false
  }
}

async function revokeDevice(device: DeviceItem) {
  if (isCurrent(device))
    return
  actionLoading.value = true
  try {
    await $fetch('/api/devices/revoke', {
      method: 'POST',
      body: { deviceId: device.id },
    })
    await refreshDevices()
  }
  catch (error) {
    console.error('Failed to revoke device:', error)
  }
  finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.account.title', '账户设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.account.description', '管理账户信息与登录方式') }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg text-black font-semibold dark:text-light">
            {{ t('dashboard.account.profile', '个人资料') }}
          </h2>
          <span class="rounded-full px-2 py-0.5 text-xs" :class="roleClass">
            {{ roleLabel }}
          </span>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 text-sm dark:border-light/10 dark:bg-dark/40">
            <p class="text-xs text-black/60 dark:text-light/60">
              {{ t('auth.email', '邮箱') }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-black dark:text-light">
              <span>{{ emailLabel }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="isEmailVerified ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'"
              >
                {{ isEmailVerified ? t('auth.verified', '已验证') : t('auth.unverified', '未验证') }}
              </span>
            </div>
          </div>
          <div class="rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 text-sm dark:border-light/10 dark:bg-dark/40">
            <p class="text-xs text-black/60 dark:text-light/60">
              {{ t('dashboard.account.displayName', '显示名称') }}
            </p>
            <p class="mt-2 text-black dark:text-light">
              {{ user?.name || t('dashboard.account.displayNamePlaceholder', '输入显示名称') }}
            </p>
          </div>
        </div>
        <p
          v-if="isRestricted"
          class="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
        >
          {{ t('auth.restrictedAccount', '邮箱未验证，充值与同步功能暂不可用。') }}
        </p>
        <div class="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div class="space-y-2">
            <label class="text-xs text-black/60 dark:text-light/60">
              {{ t('dashboard.account.displayName', '显示名称') }}
            </label>
            <Input v-model="displayName" type="text" :placeholder="t('dashboard.account.displayNamePlaceholder', '输入显示名称')" />
          </div>
          <div class="flex items-center gap-2">
            <Button size="small" :loading="savingProfile" @click="saveProfile">
              {{ t('common.save', '保存') }}
            </Button>
            <span v-if="profileMessage" class="text-xs text-black/60 dark:text-light/60">
              {{ profileMessage }}
            </span>
          </div>
        </div>
      </div>

      <div class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-4">
        <h2 class="text-lg text-black font-semibold dark:text-light">
          {{ t('dashboard.account.loginMethods', '登录方式') }}
        </h2>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40">
            <div>
              <p class="text-black dark:text-light">
GitHub
</p>
              <p class="text-xs text-black/50 dark:text-light/50">
                {{ t('dashboard.account.githubDesc', '用于绑定 GitHub 账号与同步开发者信息') }}
              </p>
            </div>
            <Button size="small" variant="secondary" :loading="linkingGithub" @click="handleGithubLink">
              {{ t('auth.githubLogin', '绑定') }}
            </Button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40">
            <div>
              <p class="text-black dark:text-light">
LinuxDO
</p>
              <p class="text-xs text-black/50 dark:text-light/50">
                {{ t('dashboard.account.linuxdoDesc', '用于连接 LinuxDO 社区账号') }}
              </p>
            </div>
            <Button size="small" variant="secondary" :loading="linkingLinuxdo" @click="handleLinuxdoLink">
              {{ t('dashboard.account.bind', '绑定') }}
            </Button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40">
            <div>
              <p class="text-black dark:text-light">
Passkey
</p>
              <p class="text-xs text-black/50 dark:text-light/50">
                {{ t('dashboard.account.passkeyDesc', '使用系统 Passkey 快速登录') }}
              </p>
            </div>
            <Button
              size="small"
              variant="secondary"
              :disabled="!supportsPasskey || hasBoundPasskey"
              :loading="passkeyLoading"
              @click="handlePasskeyRegister"
            >
              {{ hasBoundPasskey ? t('dashboard.account.passkeyBound', '已绑定') : t('auth.passkeyRegister', '添加') }}
            </Button>
          </div>
        </div>
        <p v-if="oauthMessage" class="text-xs text-black/60 dark:text-light/60">
          {{ oauthMessage }}
        </p>
        <p v-if="passkeyMessage" class="text-xs text-black/60 dark:text-light/60">
          {{ passkeyMessage }}
        </p>
        <p v-if="!supportsPasskey" class="text-xs text-black/50 dark:text-light/50">
          {{ t('auth.passkeyNotSupported', '当前浏览器不支持 Passkey') }}
        </p>
      </div>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg text-black font-semibold dark:text-light">
          {{ t('dashboard.devices.title', '设备与会话') }}
        </h2>
        <Button size="small" variant="secondary" @click="refreshDevices">
          {{ t('common.refresh', '刷新') }}
        </Button>
      </div>
      <div v-if="devicePending" class="flex items-center justify-center py-6">
        <span class="i-carbon-circle-dash animate-spin text-primary" />
      </div>
      <ul v-else-if="devices.length" class="space-y-2 text-sm">
        <li
          v-for="device in devices"
          :key="device.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40"
        >
          <div class="space-y-1">
            <p class="text-black dark:text-light">
              {{ device.deviceName || t('dashboard.devices.unnamed', '未命名设备') }}
              <span
                v-if="isCurrent(device)"
                class="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400"
              >
                {{ t('dashboard.devices.currentDevice', '当前设备') }}
              </span>
              <span
                v-if="device.revokedAt"
                class="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
              >
                {{ t('dashboard.devices.revoked', '已撤销') }}
              </span>
            </p>
            <p class="text-xs text-black/50 dark:text-light/50">
              {{ device.platform || 'Web' }} · {{ formatLastActive(device.lastSeenAt) }}
            </p>
            <p v-if="device.userAgent" class="text-xs text-black/40 dark:text-light/40">
              {{ device.userAgent }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="editingId !== device.id"
              size="small"
              variant="secondary"
              @click="startRename(device)"
            >
              {{ t('dashboard.devices.rename', '重命名') }}
            </Button>
            <Button
              size="small"
              variant="secondary"
              :disabled="actionLoading || isCurrent(device) || Boolean(device.revokedAt)"
              @click="revokeDevice(device)"
            >
              {{ t('dashboard.devices.revoke', '踢出') }}
            </Button>
          </div>
          <div v-if="editingId === device.id" class="flex flex-wrap items-center gap-2 w-full">
            <Input v-model="renameValue" type="text" :placeholder="t('dashboard.devices.renamePlaceholder', '输入设备名称')" />
            <Button size="small" :loading="actionLoading" @click="saveRename(device)">
              {{ t('common.save', '保存') }}
            </Button>
            <Button size="small" variant="secondary" @click="cancelRename">
              {{ t('common.cancel', '取消') }}
            </Button>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-black/60 dark:text-light/70">
        {{ t('dashboard.devices.noSessions', '暂无设备') }}
      </p>
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
      <div v-else class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <p class="text-xs text-black/60 dark:text-light/60">
            {{ t('dashboard.account.loginAbnormal', '异常登录') }}
          </p>
          <ul v-if="abnormalHistory.length" class="space-y-2 text-sm">
            <li
              v-for="item in abnormalHistory"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40"
            >
              <div class="space-y-1">
                <p class="text-black dark:text-light">
                  {{ t('dashboard.account.loginFailed', '登录失败') }}
                  <span class="text-xs text-black/50 dark:text-light/50">· {{ item.reason || '-' }}</span>
                </p>
                <p class="text-xs text-black/50 dark:text-light/50">
                  {{ formatHistoryTime(item.created_at) }} · {{ item.ip || 'unknown' }}
                </p>
              </div>
              <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
                {{ t('dashboard.account.statusFailed', 'Failed') }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-black/60 dark:text-light/70">
            {{ t('dashboard.account.noAbnormal', '暂无异常记录') }}
          </p>
        </div>
        <div class="space-y-2">
          <p class="text-xs text-black/60 dark:text-light/60">
            {{ t('dashboard.account.loginCommon', '常用登录') }}
          </p>
          <ul v-if="commonHistory.length" class="space-y-2 text-sm">
            <li
              v-for="item in commonHistory"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40"
            >
              <div class="space-y-1">
                <p class="text-black dark:text-light">
                  {{ t('dashboard.account.loginSuccess', '登录成功') }}
                  <span class="text-xs text-black/50 dark:text-light/50">· {{ item.reason || '-' }}</span>
                </p>
                <p class="text-xs text-black/50 dark:text-light/50">
                  {{ formatHistoryTime(item.created_at) }} · {{ item.ip || 'unknown' }}
                </p>
              </div>
              <span class="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
                {{ t('dashboard.account.statusSuccess', 'Success') }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-black/60 dark:text-light/70">
            {{ t('dashboard.account.noHistory', '暂无登录记录') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
