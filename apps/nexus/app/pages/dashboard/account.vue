<script setup lang="ts">
import { TxAutoSizer } from '@talex-touch/tuffex/auto-sizer'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTimeline, TxTimelineItem } from '@talex-touch/tuffex/timeline'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, ref, watch } from 'vue'
import DashboardAccountProfilePlanCard from '~/components/dashboard/AccountProfilePlanCard.vue'
import { useSubscriptionData } from '~/composables/useDashboardData'
import {
  buildOauthCallbackUrl,
  persistOauthContext,
  type OauthProvider,
} from '~/composables/useOauthContext'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import { patchCurrentUserProfile } from '~/composables/useCurrentUserApi'
import { formatCompactAccountLabel, formatCompactEmail } from '~/utils/account-display'
import { useTypedFetch } from '~/utils/request'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

defineI18nRoute(false)

const { t } = useI18n()
const toast = useToast()
const { user, refresh } = useAuthUser()
const { subscription, pending: subscriptionPending } = useSubscriptionData()

type LoginTabKey = 'methods' | 'history' | 'details'

interface AccountDetailItem {
  key: string
  label: string
  value: string
  title?: string
  copyable?: boolean
}

const displayName = ref('')
const emailDraft = ref('')
const savingProfile = ref(false)
const savingEmail = ref(false)
const avatarUploading = ref(false)
const profileMessage = ref('')
const emailMessage = ref('')
const editingEmail = ref(false)
const activeLoginTab = ref<LoginTabKey>('methods')
const loginTabSizerRef = ref<any>(null)
const profileEditOverlayVisible = ref(false)
const profileEditOverlaySource = ref<HTMLElement | null>(null)
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

const activeLoginTabModel = computed<LoginTabKey>({
  get: () => activeLoginTab.value,
  set: (value) => {
    const next = value === 'history' || value === 'details' ? value : 'methods'
    if (activeLoginTab.value === next)
      return
    const sizer = loginTabSizerRef.value
    if (sizer?.action) {
      void sizer.action(() => {
        activeLoginTab.value = next
      })
      return
    }
    activeLoginTab.value = next
  },
})

const daysLeftText = computed(() => {
  if (planCode.value === 'FREE')
    return t('dashboard.account.daysLeftForever', '永久')
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
const hasEmailChanges = computed(() => emailDraft.value.trim().toLowerCase() !== (user.value?.email || '').trim().toLowerCase())
const userRoleLabel = computed(() => formatUserRole(user.value?.role))
const accountDetailItems = computed<AccountDetailItem[]>(() => [
  {
    key: 'id',
    label: t('dashboard.account.detailUserId', '账户 ID'),
    value: user.value?.id || '-',
    copyable: true,
  },
  {
    key: 'email',
    label: t('dashboard.account.detailEmail', '邮箱'),
    value: emailLabel.value || '-',
    title: emailLabel.value || '',
    copyable: true,
  },
  {
    key: 'role',
    label: t('dashboard.account.detailRole', '角色'),
    value: userRoleLabel.value,
  },
  {
    key: 'locale',
    label: t('dashboard.account.detailLocale', '语言偏好'),
    value: user.value?.locale || '-',
  },
  {
    key: 'createdAt',
    label: t('dashboard.account.detailCreatedAt', '创建时间'),
    value: formatAccountDate(user.value?.createdAt),
  },
  {
    key: 'updatedAt',
    label: t('dashboard.account.detailUpdatedAt', '最近更新'),
    value: formatAccountDate(user.value?.updatedAt),
  },
])

function providerLabel(provider: string | null | undefined) {
  if (provider === 'github')
    return 'GitHub'
  if (provider === 'linuxdo')
    return 'LinuxDO'
  return provider || t('dashboard.account.unknownProvider', '未知来源')
}

function boundTarget(provider: OauthProvider, accountId?: string | null) {
  const label = providerLabel(provider)
  return accountId ? `${label} (${accountId})` : label
}

function boundMessage(provider: OauthProvider, accountId?: string | null) {
  const target = boundTarget(provider, accountId)
  return t('dashboard.account.boundTo', { target }, `已绑定到 ${target}`)
}

function formatUserRole(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'admin')
    return t('dashboard.account.roles.admin', '管理员')
  if (normalized === 'user')
    return t('dashboard.account.roles.user', '用户')
  return value || '-'
}

function formatAccountDate(value: string | null | undefined) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function copyAccountDetail(item: AccountDetailItem) {
  if (!item.copyable || !item.value || item.value === '-')
    return

  try {
    await navigator.clipboard.writeText(item.value)
    toast.success(t('dashboard.account.detailCopied', '已复制'))
  }
  catch (error) {
    console.error('Failed to copy account detail:', error)
    toast.error(t('dashboard.account.detailCopyFailed', '复制失败'))
  }
}

// OAuth bind feedback is handled on the sign-in page now.

const { data: loginHistory, pending: historyPending, refresh: refreshHistory } = useTypedFetch<any[]>('/api/login-history')
const handleRefreshHistory = () => refreshHistory()

const emailState = computed(() => user.value?.emailState ?? 'unverified')
const emailLabel = computed(() => {
  if (!user.value)
    return ''
  if (emailState.value === 'missing')
    return t('auth.accountNoEmail', '未绑定邮箱')
  return user.value.email || ''
})
const compactDisplayName = computed(() => {
  const fallback = t('dashboard.account.displayNamePlaceholder', '输入显示名称')
  if (!user.value)
    return fallback

  const name = user.value.name?.trim()
  return name ? formatCompactAccountLabel(name) : fallback
})
const compactEmailLabel = computed(() => {
  if (!user.value || emailState.value === 'missing')
    return emailLabel.value
  return user.value.email ? formatCompactEmail(user.value.email) : ''
})
const isEmailVerified = computed(() => emailState.value === 'verified')
const isRestricted = computed(() => user.value?.isRestricted ?? emailState.value !== 'verified')

watch(
  () => user.value,
  (value) => {
    displayName.value = value?.name || ''
    emailDraft.value = value?.email || ''
  },
  { immediate: true },
)

onMounted(() => {
  supportsPasskey.value = hasWindow() && Boolean(window.PublicKeyCredential)
})

function openProfileEdit(source: HTMLElement | null = null) {
  profileEditOverlaySource.value = source
  profileEditOverlayVisible.value = true
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

async function handleAvatarInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !user.value) {
    input.value = ''
    return
  }

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

async function saveEmail() {
  if (!user.value)
    return
  const email = emailDraft.value.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    emailMessage.value = t('auth.invalidEmail', '请输入有效邮箱')
    return
  }
  if (!hasEmailChanges.value) {
    editingEmail.value = false
    emailMessage.value = ''
    return
  }

  savingEmail.value = true
  emailMessage.value = ''
  try {
    await requestJson('/api/auth/bind-email', {
      method: 'POST',
      body: { email },
    })
    await refresh()
    editingEmail.value = false
    emailMessage.value = t('dashboard.account.emailChangeSent', '验证邮件已发送，请完成验证。')
  }
  catch (error: any) {
    emailMessage.value = error?.data?.statusMessage || error?.message || t('dashboard.account.emailChangeFailed', '邮箱更新失败')
  }
  finally {
    savingEmail.value = false
  }
}

function cancelEmailEdit() {
  emailDraft.value = user.value?.email || ''
  editingEmail.value = false
  emailMessage.value = ''
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
    await requestJson(`/api/user/linked-accounts/${provider}`, { method: 'DELETE' })
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
    const options = await requestJson<any>('/api/passkeys/register-options', { method: 'POST' })
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
    await requestJson('/api/passkeys/register-verify', {
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
const recentHistory = computed(() => {
  const items = [...historyItems.value]
  items.sort((a, b) => {
    const aTime = new Date(a?.created_at ?? 0).getTime()
    const bTime = new Date(b?.created_at ?? 0).getTime()
    return bTime - aTime
  })
  return items.slice(0, 5)
})

function formatLoginClient(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'cli')
    return t('dashboard.account.clientTypes.cli', 'CLI')
  if (normalized === 'external')
    return t('dashboard.account.clientTypes.external', 'External')
  if (normalized === 'web')
    return t('dashboard.account.clientTypes.web', 'Web')
  if (normalized === 'app')
    return t('dashboard.account.clientTypes.app', 'App')
  return t('dashboard.account.clientTypes.unknown', '未知来源')
}

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
      :display-name="compactDisplayName"
      :email-label="compactEmailLabel"
      :avatar-url="avatarUrl"
      :profile-initial="profileInitial"
      :avatar-edit-text="t('dashboard.account.changeAvatar', '修改头像')"
      :avatar-uploading="avatarUploading"
      :is-email-verified="isEmailVerified"
      :verified-text="t('auth.verified', '已验证')"
      :unverified-text="t('dashboard.account.unverifiedTag', 'Unverified')"
      :edit-profile-text="t('dashboard.account.editProfile', '编辑')"
      :current-plan-text="t('dashboard.account.subscriptionTitle', 'Subscription')"
      :plan-status-label="planStatusLabel"
      :plan-active="subscription?.isActive ?? true"
      :plan-label="planLabel"
      :plan-action-text="t('dashboard.account.managePlan', 'Manage')"
      :days-left-text="daysLeftText"
      :show-plan-skeleton="showPlanSkeleton"
      :plan-code="planCode"
      @profile-edit="openProfileEdit"
      @avatar-edit="triggerAvatarSelect"
      @plan-action="handlePlanAction"
    />
    <input
      ref="avatarInputRef"
      class="sr-only"
      type="file"
      accept="image/*"
      :disabled="avatarUploading"
      :aria-label="t('dashboard.account.changeAvatar', '修改头像')"
      @change="handleAvatarInputChange"
    >

    <p
      v-if="isRestricted"
      class="mx-auto mt-2 w-full max-w-[920px] rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
    >
      {{ t('auth.restrictedAccount', '邮箱未验证，充值与同步功能暂不可用。') }}
    </p>

    <section id="login-methods-card" class="apple-card-lg p-4">
      <TxAutoSizer
        ref="loginTabSizerRef"
        :width="false"
        :height="true"
        :duration-ms="260"
        easing="cubic-bezier(0.4, 0, 0.2, 1)"
        outer-class="overflow-hidden"
        class="w-full"
      >
        <TxTabs
          v-model="activeLoginTabModel"
          placement="top"
          :content-scrollable="false"
          borderless
          class="h-auto"
        >
          <TxTabItem name="methods" activation>
            <template #name>
              {{ t('dashboard.account.loginMethods', '登录方式') }}
            </template>
            <div class="space-y-4 pt-2">
              <div class="space-y-3 text-sm">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] px-4 py-3 dark:border-white/[0.12]">
                  <div class="min-w-0">
                    <p class="text-black dark:text-white">
                      {{ t('auth.email', '邮箱') }}
                    </p>
                    <p v-if="!editingEmail" class="truncate text-xs text-black/50 dark:text-white/50" :title="emailLabel">
                      {{ compactEmailLabel }}
                    </p>
                    <div v-else class="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                      <TuffInput v-model="emailDraft" class="min-w-[240px]" type="email" :placeholder="t('auth.email', '邮箱')" />
                      <TxButton size="small" :loading="savingEmail" :disabled="!hasEmailChanges" @click="saveEmail">
                        {{ t('common.save', '保存') }}
                      </TxButton>
                      <TxButton size="small" variant="secondary" :disabled="savingEmail" @click="cancelEmailEdit">
                        {{ t('common.cancel', '取消') }}
                      </TxButton>
                    </div>
                    <p v-if="emailMessage" class="mt-1 text-xs text-black/55 dark:text-white/55">
                      {{ emailMessage }}
                    </p>
                  </div>
                  <TxButton v-if="!editingEmail" size="small" variant="secondary" @click="editingEmail = true">
                    {{ t('dashboard.account.editEmail', '编辑') }}
                  </TxButton>
                </div>
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
                  <TxButton size="small" :variant="isGithubBound ? 'danger' : 'secondary'" :loading="linkingGithub || unlinkingGithub" :disabled="linkingLinuxdo || unlinkingLinuxdo" @click="handleGithubToggle">
                    {{ isGithubBound ? t('dashboard.account.unbind', '解绑') : t('auth.githubLogin', '绑定') }}
                  </TxButton>
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
                  <TxButton size="small" :variant="isLinuxdoBound ? 'danger' : 'secondary'" :loading="linkingLinuxdo || unlinkingLinuxdo" :disabled="linkingGithub || unlinkingGithub" @click="handleLinuxdoToggle">
                    {{ isLinuxdoBound ? t('dashboard.account.unbind', '解绑') : t('dashboard.account.bind', '绑定') }}
                  </TxButton>
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
                  <TxButton size="small" variant="secondary" :disabled="!supportsPasskey || hasBoundPasskey" :loading="passkeyLoading" @click="handlePasskeyRegister">
                    {{ hasBoundPasskey ? t('dashboard.account.passkeyBound', '已绑定') : t('auth.passkeyRegister', '添加') }}
                  </TxButton>
                </div>
              </div>
              <p v-if="passkeyMessage" class="text-xs text-black/60 dark:text-white/60">
                {{ passkeyMessage }}
              </p>
              <p v-if="!supportsPasskey" class="text-xs text-black/50 dark:text-white/50">
                {{ t('auth.passkeyNotSupported', '当前浏览器不支持 Passkey') }}
              </p>
            </div>
          </TxTabItem>

          <TxTabItem name="history">
            <template #name>
              {{ t('dashboard.account.loginHistory', '登录历史') }}
            </template>
            <div class="space-y-4 pt-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-3">
                  <p class="text-sm font-semibold text-black dark:text-white">
                    {{ t('dashboard.account.loginHistory', '登录历史') }}
                  </p>
                  <span class="text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.account.historyHint', '仅展示最近 5 条') }}
                  </span>
                </div>
                <TxButton size="small" variant="secondary" @click="handleRefreshHistory">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
              </div>
              <div v-if="historyPending" class="space-y-2 py-2">
                <div class="flex items-center justify-center">
                  <TxSpinner :size="18" />
                </div>
                <div class="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <TxSkeleton :loading="true" :lines="2" />
                </div>
                <div class="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <TxSkeleton :loading="true" :lines="2" />
                </div>
              </div>
              <div v-else>
                <TxTimeline v-if="recentHistory.length" class="LoginHistoryTimeline">
                  <TxTimelineItem
                    v-for="item in recentHistory"
                    :key="item.id"
                    :color="item.success ? 'success' : 'error'"
                  >
                    <TxCard
                      variant="plain"
                      background="mask"
                      :radius="16"
                      :padding="12"
                      class="LoginHistoryCard"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 space-y-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-semibold text-black dark:text-white">
                              {{ item.success
                                ? t('dashboard.account.loginSuccess', '登录成功')
                                : t('dashboard.account.loginFailed', '登录失败') }}
                            </p>
                            <span
                              class="rounded-full px-2 py-0.5 text-xs"
                              :class="item.success
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                : 'bg-red-500/15 text-red-600 dark:text-red-300'"
                            >
                              {{ item.success
                                ? t('dashboard.account.statusSuccess', 'Success')
                                : t('dashboard.account.statusFailed', 'Failed') }}
                            </span>
                          </div>
                          <p class="text-xs text-black/55 dark:text-white/55">
                            {{ formatLoginClient(item.clientType) }} · {{ item.reason || '-' }} · {{ item.ipMasked || 'unknown' }}
                          </p>
                        </div>
                        <div class="text-xs text-black/40 dark:text-white/40 whitespace-nowrap">
                          {{ formatHistoryTime(item.created_at) }}
                        </div>
                      </div>
                    </TxCard>
                  </TxTimelineItem>
                </TxTimeline>
                <p v-else class="text-sm text-black/60 dark:text-white/70">
                  {{ t('dashboard.account.noHistory', '暂无登录记录') }}
                </p>
              </div>
            </div>
          </TxTabItem>

          <TxTabItem name="details">
            <template #name>
              {{ t('dashboard.account.detailTab', '详情信息') }}
            </template>
            <div class="space-y-4 pt-1">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-black dark:text-white">
                    {{ t('dashboard.account.detailTitle', '账号详情') }}
                  </p>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.account.detailHint', '展示当前登录账号的基础元数据') }}
                  </p>
                </div>
                <span class="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  {{ userRoleLabel }}
                </span>
              </div>

              <dl class="AccountDetailsList">
                <div
                  v-for="item in accountDetailItems"
                  :key="item.key"
                  class="AccountDetailsLine"
                  :class="{ 'AccountDetailsLine--Copyable': item.copyable }"
                  :role="item.copyable ? 'button' : undefined"
                  :tabindex="item.copyable ? 0 : undefined"
                  @click="copyAccountDetail(item)"
                  @keydown.enter.prevent="copyAccountDetail(item)"
                  @keydown.space.prevent="copyAccountDetail(item)"
                >
                  <dt>{{ item.label }}</dt>
                  <dd :title="item.title || item.value">
                    {{ item.value }}
                  </dd>
                </div>
              </dl>
            </div>
          </TxTabItem>
        </TxTabs>
      </TxAutoSizer>
    </section>

    <FlipDialog
      v-model="profileEditOverlayVisible"
      :reference="profileEditOverlaySource"
      :header="false"
      size="md"
    >
      <template #default="{ close }">
        <div class="AccountProfileEditOverlay-Inner">
          <div class="AccountProfileEditOverlay-Header">
            <div class="min-w-0 space-y-1">
              <h2 class="AccountProfileEditOverlay-Title">
                {{ t('dashboard.account.manageSection', '编辑资料') }}
              </h2>
              <p class="AccountProfileEditOverlay-Desc">
                {{ t('dashboard.account.manageDialogDesc', '更新控制台展示的显示名称。') }}
              </p>
            </div>
            <button
              type="button"
              class="AccountProfileEditOverlay-Close"
              :aria-label="t('common.close', '关闭')"
              @click="close"
            >
              <span class="i-carbon-close" aria-hidden="true" />
            </button>
          </div>

          <div class="space-y-2">
            <label class="text-xs text-black/60 dark:text-white/60">
              {{ t('dashboard.account.displayName', '显示名称') }}
            </label>
            <TuffInput v-model="displayName" type="text" :placeholder="t('dashboard.account.displayNamePlaceholder', '输入显示名称')" />
          </div>

          <p v-if="profileMessage" class="text-xs text-black/60 dark:text-white/60">
            {{ profileMessage }}
          </p>

          <div class="AccountProfileEditOverlay-Actions">
            <TxButton size="small" variant="secondary" @click="close">
              {{ t('common.cancel', '取消') }}
            </TxButton>
            <TxButton size="small" :loading="savingProfile" :disabled="!hasProfileChanges" @click="saveProfile">
              {{ t('common.save', '保存') }}
            </TxButton>
          </div>
        </div>
      </template>
    </FlipDialog>
  </div>
</template>

<style scoped>
.AccountProfileEditOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 18px;
}

.AccountProfileEditOverlay-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.AccountProfileEditOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.AccountProfileEditOverlay-Desc {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.AccountProfileEditOverlay-Close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, rgba(255, 255, 255, 0.18)) 70%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #101114) 72%, transparent);
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.AccountProfileEditOverlay-Close:hover {
  border-color: color-mix(in srgb, var(--tx-text-color-primary) 22%, transparent);
  background: color-mix(in srgb, var(--tx-text-color-primary) 8%, transparent);
  color: var(--tx-text-color-primary);
}

.AccountProfileEditOverlay-Actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.LoginHistoryTimeline :deep(.tx-timeline-item--vertical) {
  padding-bottom: 14px;
}

.LoginHistoryTimeline :deep(.tx-timeline-item--vertical::before) {
  bottom: -14px;
}

.LoginHistoryTimeline :deep(.tx-timeline-item__content) {
  width: 100%;
}

.AccountDetailsList {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, rgba(255, 255, 255, 0.12)) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-text-color-primary) 3%, transparent);
}

.AccountDetailsLine {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  padding: 3px 18px 3px 48px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color, rgba(255, 255, 255, 0.12)) 52%, transparent);
  transition: background 0.16s ease, color 0.16s ease;
}

.AccountDetailsLine:last-child {
  border-bottom: 0;
}

.AccountDetailsLine dt {
  width: 120px;
  flex: 0 0 120px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.AccountDetailsLine dd {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.4;
  color: var(--tx-text-color-secondary);
}

.AccountDetailsLine--Copyable {
  cursor: pointer;
}

.AccountDetailsLine--Copyable:hover,
.AccountDetailsLine--Copyable:focus-visible {
  background: color-mix(in srgb, var(--tx-color-primary, #3b82f6) 8%, transparent);
  outline: none;
}

.AccountDetailsLine--Copyable:hover dd,
.AccountDetailsLine--Copyable:focus-visible dd {
  color: var(--tx-color-primary, #3b82f6);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

@media (max-width: 640px) {
  .AccountDetailsLine {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding: 8px 14px;
  }

  .AccountDetailsLine dt {
    width: auto;
    flex-basis: auto;
  }
}
</style>
