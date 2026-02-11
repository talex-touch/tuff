<script setup lang="ts">
import { TxFlipOverlay } from '@talex-touch/tuffex'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, ref, watch } from 'vue'
import DashboardAccountProfilePlanCard from '~/components/dashboard/AccountProfilePlanCard.vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
import { useSubscriptionData } from '~/composables/useDashboardData'
import {
  buildOauthCallbackUrl,
  persistOauthContext,
  type OauthProvider,
} from '~/composables/useOauthContext'
import { patchCurrentUserProfile } from '~/composables/useCurrentUserApi'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

defineI18nRoute(false)

const { t } = useI18n()
const { user, refresh } = useAuthUser()
const { subscription, pending: subscriptionPending } = useSubscriptionData()


const displayName = ref('')
const savingProfile = ref(false)
const avatarUploading = ref(false)
const profileMessage = ref('')
const manageOverlayVisible = ref(false)
const manageOverlaySource = ref<HTMLElement | null>(null)
const avatarInputRef = ref<HTMLInputElement | null>(null)

const linkingGithub = ref(false)
const linkingLinuxdo = ref(false)
const unlinkingGithub = ref(false)
const unlinkingLinuxdo = ref(false)

const supportsPasskey = ref(false)
const passkeyLoading = ref(false)
const passkeyMessage = ref('')

const hasBoundPasskey = computed(() => (user.value?.passkeyCount ?? 0) > 0)
const linkedAccounts = computed(() => user.value?.linkedAccounts ?? [])

const githubAccount = computed(() => linkedAccounts.value.find(account => account.provider === 'github') ?? null)
const linuxdoAccount = computed(() => linkedAccounts.value.find(account => account.provider === 'linuxdo') ?? null)

const isGithubBound = computed(() => Boolean(githubAccount.value))
const isLinuxdoBound = computed(() => Boolean(linuxdoAccount.value))
const avatarUrl = computed(() => user.value?.image || '')
const profileInitial = computed(() => {
  const seed = displayName.value || emailLabel.value
  return seed ? seed.trim().charAt(0).toUpperCase() : 'U'
})
const planCode = computed(() => {
  const raw = subscription.value?.plan
  if (!raw || typeof raw !== 'string')
    return null
  return raw.toUpperCase()
})
const hasPlanData = computed(() => Boolean(planCode.value))
const showPlanSkeleton = computed(() => subscriptionPending.value || !hasPlanData.value)
const planLabel = computed(() => {
  switch (planCode.value) {
    case 'PRO':
      return t('dashboard.account.planPro', 'Pro Plan')
    case 'PLUS':
      return t('dashboard.account.planPlus', 'Plus Plan')
    case 'TEAM':
      return t('dashboard.account.planTeam', 'Team Plan')
    case 'ENTERPRISE':
      return t('dashboard.account.planEnterprise', 'Enterprise Plan')
    case 'FREE':
      return t('dashboard.account.planFree', 'Free Plan')
    default:
      return ''
  }
})
const planStatusLabel = computed(() => (subscription.value?.isActive === false
  ? t('dashboard.account.planStatusInactive', 'Inactive')
  : t('dashboard.account.planStatusActive', 'Active')))

const daysLeftText = computed(() => {
  const raw = subscription.value?.expiresAt
  if (!raw)
    return t('dashboard.account.daysLeftUnknown', '-- days left')
  const date = new Date(raw)
  if (Number.isNaN(date.getTime()))
    return t('dashboard.account.daysLeftUnknown', '-- days left')
  const diff = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000))
  return t('dashboard.account.daysLeft', { n: diff }, `${diff} days left`)
})
const hasProfileChanges = computed(() => displayName.value.trim() !== (user.value?.name || '').trim())

function providerLabel(provider: OauthProvider) {
  return provider === 'github' ? 'GitHub' : 'LinuxDO'
}

function boundTarget(provider: OauthProvider, accountId?: string | null) {
  const label = providerLabel(provider)
  return accountId ? `${label} (${accountId})` : label
}

function boundMessage(provider: OauthProvider, accountId?: string | null) {
  const target = boundTarget(provider, accountId)
  return t('dashboard.account.boundTo', { target }, `已绑定到 ${target}`)
}

// OAuth bind feedback is handled on the sign-in page now.

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

function openManageProfile(source: HTMLElement | null = null) {
  manageOverlaySource.value = source
  manageOverlayVisible.value = true
  profileMessage.value = ''
}

function handlePlanAction() {
  void navigateTo('/dashboard/team')
}

function triggerAvatarSelect() {
  avatarInputRef.value?.click()
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !user.value)
    return

  avatarUploading.value = true
  profileMessage.value = ''
  try {
    const dataUrl = await fileToDataUrl(file)
    await patchCurrentUserProfile({ image: dataUrl })
    await refresh()
    profileMessage.value = t('dashboard.account.avatarSaved', '头像已更新')
  }
  catch (error: any) {
    profileMessage.value = error?.data?.statusMessage || error?.message || t('dashboard.account.avatarSaveFailed', '头像更新失败')
  }
  finally {
    avatarUploading.value = false
    input.value = ''
  }
}

async function saveProfile() {
  if (!user.value)
    return
  if (!hasProfileChanges.value) {
    profileMessage.value = t('dashboard.account.noProfileChanges', '没有可保存的更改')
    return
  }

  savingProfile.value = true
  profileMessage.value = ''
  try {
    await patchCurrentUserProfile({
      name: displayName.value.trim(),
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

  const linkedAccount = provider === 'github' ? githubAccount.value : linuxdoAccount.value
  if (linkedAccount) {
    return
  }

  loadingState.value = true

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

    const relayUrl = `${callbackUrl}${callbackUrl.includes('?') ? '&' : '?'}oauth_relay=1`
    await navigateTo(relayUrl)
  }
  catch (error: any) {
    console.warn('[account] oauth bind failed', error)
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

async function unbindOauth(provider: OauthProvider) {
  const loadingState = provider === 'github' ? unlinkingGithub : unlinkingLinuxdo
  const linkedAccount = provider === 'github' ? githubAccount.value : linuxdoAccount.value
  if (loadingState.value || !linkedAccount)
    return

  loadingState.value = true
  try {
    await $fetch(`/api/user/linked-accounts/${provider}`, { method: 'DELETE' })
    await refresh()
  }
  catch (error: any) {
    console.warn('[account] oauth unbind failed', error)
  }
  finally {
    loadingState.value = false
  }
}

async function handleGithubToggle() {
  if (isGithubBound.value) {
    await unbindOauth('github')
    return
  }
  await handleGithubLink()
}

async function handleLinuxdoToggle() {
  if (isLinuxdoBound.value) {
    await unbindOauth('linuxdo')
    return
  }
  await handleLinuxdoLink()
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
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.account.title', '账户设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.account.description', '管理账户信息与登录方式') }}
      </p>
    </header>

    <DashboardAccountProfilePlanCard
      :display-name="user?.name || t('dashboard.account.displayNamePlaceholder', '输入显示名称')"
      :email-label="emailLabel"
      :avatar-url="avatarUrl"
      :profile-initial="profileInitial"
      :is-email-verified="isEmailVerified"
      :verified-text="t('auth.verified', '已验证')"
      :unverified-text="t('dashboard.account.unverifiedTag', 'Unverified')"
      :role-label="roleLabel"
      :role-class="roleClass"
      :manage-text="t('dashboard.account.manageProfile', '管理')"
      :current-plan-text="t('dashboard.account.subscriptionTitle', 'Subscription')"
      :plan-status-label="planStatusLabel"
      :plan-active="subscription?.isActive ?? true"
      :plan-label="planLabel"
      :plan-action-text="t('dashboard.account.managePlan', 'Manage')"
      :days-left-text="daysLeftText"
      :show-plan-skeleton="showPlanSkeleton"
      :plan-code="planCode"
      @manage="openManageProfile"
      @plan-action="handlePlanAction"
    />

    <p
      v-if="isRestricted"
      class="mx-auto mt-2 w-full max-w-[920px] rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
    >
      {{ t('auth.restrictedAccount', '邮箱未验证，充值与同步功能暂不可用。') }}
    </p>

    <section id="login-methods-card" class="apple-card-lg p-6 space-y-4">
        <h2 class="apple-heading-sm">
          {{ t('dashboard.account.loginMethods', '登录方式') }}
        </h2>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] px-4 py-3 dark:border-white/[0.12]">
            <div>
              <p class="text-black dark:text-white">
GitHub
</p>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.account.githubDesc', '用于绑定 GitHub 账号与同步开发者信息') }}
              </p>
              <p v-if="isGithubBound" class="mt-1 text-xs text-emerald-600 dark:text-emerald-300">
                {{ boundMessage('github', githubAccount?.providerAccountId) }}
              </p>
            </div>
            <Button
              size="small"
              :variant="isGithubBound ? 'danger' : 'secondary'"
              :loading="linkingGithub || unlinkingGithub"
              :disabled="linkingLinuxdo || unlinkingLinuxdo"
              class="rounded-full border border-black/[0.12] dark:border-white/[0.14]"
              @click="handleGithubToggle"
            >
              {{ isGithubBound ? t('dashboard.account.unbind', '解绑') : t('auth.githubLogin', '绑定') }}
            </Button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] px-4 py-3 dark:border-white/[0.12]">
            <div>
              <p class="text-black dark:text-white">
LinuxDO
</p>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.account.linuxdoDesc', '用于连接 LinuxDO 社区账号') }}
              </p>
              <p v-if="isLinuxdoBound" class="mt-1 text-xs text-emerald-600 dark:text-emerald-300">
                {{ boundMessage('linuxdo', linuxdoAccount?.providerAccountId) }}
              </p>
            </div>
            <Button
              size="small"
              :variant="isLinuxdoBound ? 'danger' : 'secondary'"
              :loading="linkingLinuxdo || unlinkingLinuxdo"
              :disabled="linkingGithub || unlinkingGithub"
              class="rounded-full border border-black/[0.12] dark:border-white/[0.14]"
              @click="handleLinuxdoToggle"
            >
              {{ isLinuxdoBound ? t('dashboard.account.unbind', '解绑') : t('dashboard.account.bind', '绑定') }}
            </Button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] px-4 py-3 dark:border-white/[0.12]">
            <div>
              <p class="text-black dark:text-white">
Passkey
</p>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.account.passkeyDesc', '使用系统 Passkey 快速登录') }}
              </p>
            </div>
            <Button
              size="small"
              variant="secondary"
              :disabled="!supportsPasskey || hasBoundPasskey"
              :loading="passkeyLoading"
              class="rounded-full border border-black/[0.12] dark:border-white/[0.14]"
              @click="handlePasskeyRegister"
            >
              {{ hasBoundPasskey ? t('dashboard.account.passkeyBound', '已绑定') : t('auth.passkeyRegister', '添加') }}
            </Button>
          </div>
        </div>
        <p v-if="passkeyMessage" class="text-xs text-black/60 dark:text-white/60">
          {{ passkeyMessage }}
        </p>
        <p v-if="!supportsPasskey" class="text-xs text-black/50 dark:text-white/50">
          {{ t('auth.passkeyNotSupported', '当前浏览器不支持 Passkey') }}
        </p>
    </section>

    <section class="apple-card-lg p-6 space-y-4">
      <div>
        <h2 class="apple-heading-sm">
          {{ t('dashboard.account.loginHistory', '登录历史') }}
        </h2>
      </div>
      <div>
        <Button size="small" variant="secondary" @click="handleRefreshHistory">
          {{ t('common.refresh', '刷新') }}
        </Button>
      </div>
      <div v-if="historyPending" class="space-y-3 py-3">
        <div class="flex items-center justify-center">
          <TxSpinner :size="18" />
        </div>
        <div class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
      <div v-else class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <p class="text-xs text-black/60 dark:text-white/60">
            {{ t('dashboard.account.loginAbnormal', '异常登录') }}
          </p>
          <ul v-if="abnormalHistory.length" class="space-y-2 text-sm">
            <li
              v-for="item in abnormalHistory"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/[0.04] bg-black/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
            >
              <div class="space-y-1">
                <p class="text-black dark:text-white">
                  {{ t('dashboard.account.loginFailed', '登录失败') }}
                  <span class="text-xs text-black/50 dark:text-white/50">· {{ item.reason || '-' }}</span>
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ formatHistoryTime(item.created_at) }} · {{ item.ip || 'unknown' }}
                </p>
              </div>
              <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
                {{ t('dashboard.account.statusFailed', 'Failed') }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-black/60 dark:text-white/70">
            {{ t('dashboard.account.noAbnormal', '暂无异常记录') }}
          </p>
        </div>
        <div class="space-y-2">
          <p class="text-xs text-black/60 dark:text-white/60">
            {{ t('dashboard.account.loginCommon', '常用登录') }}
          </p>
          <ul v-if="commonHistory.length" class="space-y-2 text-sm">
            <li
              v-for="item in commonHistory"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/[0.04] bg-black/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
            >
              <div class="space-y-1">
                <p class="text-black dark:text-white">
                  {{ t('dashboard.account.loginSuccess', '登录成功') }}
                  <span class="text-xs text-black/50 dark:text-white/50">· {{ item.reason || '-' }}</span>
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ formatHistoryTime(item.created_at) }} · {{ item.ip || 'unknown' }}
                </p>
              </div>
              <span class="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
                {{ t('dashboard.account.statusSuccess', 'Success') }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-black/60 dark:text-white/70">
            {{ t('dashboard.account.noHistory', '暂无登录记录') }}
          </p>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="manageOverlayVisible"
        :source="manageOverlaySource"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="AccountManageOverlay-Mask"
        mask-class="AccountManageOverlay-Mask"
        card-class="AccountManageOverlay-Card"
      >
        <template #default="{ close }">
          <div class="AccountManageOverlay-Inner">
            <div class="space-y-1">
              <h2 class="AccountManageOverlay-Title">
                {{ t('dashboard.account.manageSection', 'Profile Manage') }}
              </h2>
              <p class="AccountManageOverlay-Desc">
                {{ t('dashboard.account.manageDialogDesc', '更新头像、显示名称与基础资料。') }}
              </p>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] p-3 dark:border-white/[0.12]">
              <div class="flex min-w-0 items-center gap-3">
                <div class="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-black/[0.1] bg-black/[0.03] dark:border-white/[0.12] dark:bg-white/[0.04]">
                  <img
                    v-if="avatarUrl"
                    :src="avatarUrl"
                    :alt="displayName || emailLabel || 'User'"
                    class="h-full w-full object-cover"
                  >
                  <div v-else class="flex h-full w-full items-center justify-center text-sm font-semibold text-black/65 dark:text-white/75">
                    {{ profileInitial }}
                  </div>
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-black dark:text-white">
                    {{ user?.name || t('dashboard.account.displayNamePlaceholder', '输入显示名称') }}
                  </p>
                  <p class="truncate text-xs text-black/50 dark:text-white/50">
                    {{ emailLabel }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Button size="small" variant="secondary" :loading="avatarUploading" @click="triggerAvatarSelect">
                  {{ t('dashboard.account.changeAvatar', '修改头像') }}
                </Button>
                <input
                  ref="avatarInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleAvatarChange"
                >
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.account.displayName', '显示名称') }}
                </label>
                <Input v-model="displayName" type="text" :placeholder="t('dashboard.account.displayNamePlaceholder', '输入显示名称')" />
              </div>
              <div class="space-y-2 rounded-xl border border-black/[0.08] p-3 dark:border-white/[0.12]">
                <p class="text-xs text-black/60 dark:text-white/60">
                  {{ t('auth.email', '邮箱') }}
                </p>
                <p class="truncate text-sm text-black dark:text-white">
                  {{ emailLabel }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.account.emailHint', '邮箱修改由登录方式提供方管理。') }}
                </p>
              </div>
            </div>

            <p v-if="profileMessage" class="text-xs text-black/60 dark:text-white/60">
              {{ profileMessage }}
            </p>

            <div class="AccountManageOverlay-Actions">
              <Button size="small" variant="secondary" @click="close">
                {{ t('common.cancel', '取消') }}
              </Button>
              <Button size="small" :loading="savingProfile" :disabled="!hasProfileChanges" @click="saveProfile">
                {{ t('common.save', '保存') }}
              </Button>
            </div>
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>
  </div>
</template>

<style scoped>
.AccountManageOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 18px;
}

.AccountManageOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.AccountManageOverlay-Desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.AccountManageOverlay-Actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<style>
.AccountManageOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(12, 12, 16, 0.4);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.AccountManageOverlay-Mask-enter-active,
.AccountManageOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.AccountManageOverlay-Mask-enter-from,
.AccountManageOverlay-Mask-leave-to {
  opacity: 0;
}

.AccountManageOverlay-Card {
  width: min(560px, 92vw);
  min-height: 320px;
  max-height: 82vh;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: auto;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>
