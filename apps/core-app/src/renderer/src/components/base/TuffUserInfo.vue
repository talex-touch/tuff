<script lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import { getAuthBaseUrl, isLocalAuthMode } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { fetchNexusWithAuth } from '~/modules/market/nexus-auth-client'

const { t } = useI18n()
const {
  currentUser,
  isLoggedIn,
  user,
  getDisplayName,
  getPrimaryEmail,
  getUserBio,
  openLoginSettings
} = useAuth()

const profileVisible = ref(false)
const profileEditing = ref(false)
const accountLoading = ref(false)
const accountLoaded = ref(false)
const accountError = ref('')
const subscriptionStatus = ref<SubscriptionStatus | null>(null)
const teamSummary = ref<TeamSummary | null>(null)
const deviceCount = ref<number | null>(null)
const lastFetchedAt = ref(0)
const appSdk = useAppSdk()

const displayName = computed(() => {
  const name = getDisplayName()
  if (name) return name
  return currentUser.value?.name || ''
})
const displayEmail = computed(() => {
  const email = getPrimaryEmail()
  if (email) return email
  return currentUser.value?.email || ''
})
const displayId = computed(() => user.value?.id || currentUser.value?.id || '')
const avatarUrl = computed(() => user.value?.avatar || currentUser.value?.avatar || '')
const displayInitial = computed(() => {
  const seed = displayName.value || displayEmail.value
  return seed ? seed.trim().charAt(0).toUpperCase() : '?'
})
const profileBio = computed(() => getUserBio())
const planLabel = computed(() =>
  subscriptionStatus.value ? formatPlan(subscriptionStatus.value.plan) : '-'
)
const planStatus = computed(() => {
  if (!subscriptionStatus.value) {
    return '-'
  }
  return subscriptionStatus.value.isActive
    ? t('userProfile.planActive', 'Active')
    : t('userProfile.planExpired', 'Expired')
})
const planExpiresAt = computed(() =>
  subscriptionStatus.value ? formatDate(subscriptionStatus.value.expiresAt || null) : '-'
)
const aiRequestsQuota = computed(() =>
  subscriptionStatus.value
    ? formatQuota(
        subscriptionStatus.value.features?.aiRequests?.used,
        subscriptionStatus.value.features?.aiRequests?.limit
      )
    : '-'
)
const aiTokensQuota = computed(() =>
  subscriptionStatus.value
    ? formatQuota(
        subscriptionStatus.value.features?.aiTokens?.used,
        subscriptionStatus.value.features?.aiTokens?.limit
      )
    : '-'
)
const teamName = computed(() => (teamSummary.value ? teamSummary.value.name : '-'))
const teamMembers = computed(() =>
  teamSummary.value?.slots
    ? `${teamSummary.value.slots.used}/${teamSummary.value.slots.total}`
    : '-'
)
const deviceCountLabel = computed(() => (deviceCount.value === null ? '-' : `${deviceCount.value}`))

interface SubscriptionStatus {
  plan: string
  expiresAt: string | null
  activatedAt: string | null
  isActive: boolean
  features: {
    aiRequests: { limit: number; used: number }
    aiTokens: { limit: number; used: number }
    customModels: boolean
    prioritySupport: boolean
    apiAccess: boolean
  }
}

interface TeamSummary {
  name: string
  plan: string
  slots: { total: number; used: number }
  organization?: { role?: string } | null
}

function openUserProfile() {
  const profileUrl = `${getAuthBaseUrl()}/dashboard/account`
  void appSdk.openExternal(profileUrl)
  profileVisible.value = false
}

function openDeviceManagement() {
  const devicesUrl = `${getAuthBaseUrl()}/dashboard/devices`
  void appSdk.openExternal(devicesUrl)
  profileVisible.value = false
}

function toggleProfileEditor() {
  profileEditing.value = !profileEditing.value
}

async function handleLoginMethods() {
  if (isLocalAuthMode()) {
    toast.info(t('userProfile.loginMethodsLocal'))
    return
  }
  try {
    const opened = await openLoginSettings()
    if (!opened) {
      const loginUrl = `${getAuthBaseUrl()}/dashboard/account`
      await appSdk.openExternal(loginUrl)
      toast.info(t('userProfile.loginMethodsWeb'))
    }
  } catch (error) {
    console.error('Failed to open login methods:', error)
    toast.error(t('userProfile.loginMethodsFailed'))
  }
}

function openProfileDialog() {
  if (!isLoggedIn.value) {
    return
  }
  profileVisible.value = true
}

function resetAccountSnapshot() {
  accountLoaded.value = false
  accountError.value = ''
  subscriptionStatus.value = null
  teamSummary.value = null
  deviceCount.value = null
}

async function fetchNexusJson<T>(path: string): Promise<T> {
  const response = await fetchNexusWithAuth(path, {}, `user-profile:${path}`)
  if (!response) {
    throw new Error(t('userProfile.authRequired', '登录后才能获取账户信息'))
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

async function loadDeviceSummary() {
  try {
    const devices = await fetchNexusJson<Array<{ id: string }>>('/api/devices')
    deviceCount.value = Array.isArray(devices) ? devices.length : 0
  } catch {
    deviceCount.value = null
  }
}

async function loadAccountOverview() {
  if (!isLoggedIn.value || accountLoading.value) {
    return
  }
  const now = Date.now()
  if (accountLoaded.value && now - lastFetchedAt.value < 60000) {
    return
  }
  accountLoading.value = true
  accountError.value = ''
  try {
    const [subscriptionResult, creditsResult] = await Promise.allSettled([
      fetchNexusJson<SubscriptionStatus>('/api/subscription/status'),
      fetchNexusJson<{ team: { quota: number; used: number } }>('/api/credits/summary')
    ])
    let hasSuccess = false
    const errors = new Set<string>()
    if (subscriptionResult.status === 'fulfilled') {
      subscriptionStatus.value = subscriptionResult.value
      hasSuccess = true
    } else {
      const reason =
        subscriptionResult.reason instanceof Error ? subscriptionResult.reason.message : ''
      errors.add(reason || t('userProfile.subscriptionFailed', '订阅信息获取失败'))
    }
    if (creditsResult.status === 'fulfilled') {
      teamSummary.value = {
        name: t('userProfile.personalTeam', 'Personal'),
        plan: subscriptionStatus.value?.plan || 'FREE',
        slots: { total: 1, used: 1 }
      }
      hasSuccess = true
    } else {
      const reason = creditsResult.reason instanceof Error ? creditsResult.reason.message : ''
      errors.add(reason || t('userProfile.teamFailed', '团队信息获取失败'))
    }
    await loadDeviceSummary()
    if (hasSuccess) {
      accountLoaded.value = true
      lastFetchedAt.value = now
    }
    if (errors.size > 0) {
      accountError.value = Array.from(errors).join(' / ')
    }
  } catch (error) {
    accountError.value =
      error instanceof Error ? error.message : t('userProfile.loadFailed', '加载账户信息失败')
  } finally {
    accountLoading.value = false
  }
}

function formatPlan(plan?: string): string {
  switch ((plan || '').toUpperCase()) {
    case 'PRO':
      return t('userProfile.planPro', 'Pro')
    case 'PLUS':
      return t('userProfile.planPlus', 'Plus')
    case 'TEAM':
      return t('userProfile.planTeam', 'Team')
    case 'ENTERPRISE':
      return t('userProfile.planEnterprise', 'Enterprise')
    case 'FREE':
    default:
      return t('userProfile.planFree', 'Free')
  }
}

function formatDate(value: string | number | null | undefined): string {
  if (!value) {
    return '-'
  }
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleDateString()
}

function formatQuota(used?: number, limit?: number): string {
  const usedValue = typeof used === 'number' ? used : 0
  if (limit === undefined || limit === null) {
    return `${usedValue}/-`
  }
  if (limit < 0) {
    return `${usedValue}/∞`
  }
  return `${usedValue}/${limit}`
}

watch(profileVisible, (visible) => {
  if (visible) {
    loadAccountOverview()
  } else {
    profileEditing.value = false
  }
})

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    resetAccountSnapshot()
  }
})
</script>

<template>
  <div
    :class="{ active: isLoggedIn, clickable: isLoggedIn }"
    class="FlatUserInfo"
    @click="openProfileDialog"
  >
    <template v-if="isLoggedIn">
      <div class="user-avatar">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="displayName || displayEmail || 'User'"
          class="avatar-image"
        />
        <div v-else class="avatar-placeholder">
          {{ displayInitial }}
        </div>
      </div>
      <div class="user-info">
        <p class="user-name">
          {{ displayName || t('userProfile.unknownName', 'User') }}
        </p>
        <span class="user-email">
          {{ displayEmail || t('userProfile.unknownEmail', 'No email') }}
        </span>
      </div>
      <span class="open-external-icon i-carbon-launch" />
    </template>
  </div>
  <TModal v-model="profileVisible" :title="t('userProfile.title', 'Account')">
    <div class="UserProfile">
      <div class="UserProfile-Header">
        <div class="UserProfile-Avatar">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName || displayEmail"
            class="avatar-image"
          />
          <div v-else class="avatar-placeholder">
            {{ displayInitial }}
          </div>
        </div>
        <div class="UserProfile-Identity">
          <p class="UserProfile-Name">
            {{ displayName || t('userProfile.unknownName', 'User') }}
          </p>
          <p class="UserProfile-Email">
            {{ displayEmail || t('userProfile.unknownEmail', 'No email') }}
          </p>
        </div>
      </div>
      <div v-if="profileBio" class="UserProfile-Bio">
        {{ profileBio }}
      </div>
      <div class="UserProfile-Details">
        <div class="UserProfile-Row">
          <span class="label">
            {{ t('userProfile.id', 'User ID') }}
          </span>
          <span class="value">
            {{ displayId || '-' }}
          </span>
        </div>
        <div class="UserProfile-Row">
          <span class="label">
            {{ t('userProfile.status', 'Status') }}
          </span>
          <span class="value">
            {{ t('userProfile.statusSignedIn', 'Signed in') }}
          </span>
        </div>
      </div>
      <div class="UserProfile-Section">
        <div class="UserProfile-SectionTitle">
          {{ t('userProfile.actions', 'Profile actions') }}
        </div>
        <div class="UserProfile-Actions">
          <TxButton variant="flat" size="sm" @click="toggleProfileEditor">
            {{
              profileEditing
                ? t('userProfile.hideEditor', 'Hide editor')
                : t('userProfile.editProfile', 'Edit profile')
            }}
          </TxButton>
          <TxButton variant="flat" size="sm" @click="handleLoginMethods">
            {{ t('userProfile.loginMethods', 'Login methods') }}
          </TxButton>
          <TxButton variant="flat" size="sm" @click="openDeviceManagement">
            {{ t('userProfile.devices', 'Devices') }}
          </TxButton>
        </div>
      </div>
      <div v-if="profileEditing" class="UserProfile-Section">
        <div class="UserProfile-SectionTitle">
          {{ t('userProfile.editTitle', 'Edit profile') }}
        </div>
        <UserProfileEditor :visible="profileEditing" />
      </div>
      <div class="UserProfile-Section">
        <div class="UserProfile-SectionTitle">
          {{ t('userProfile.subscription', 'Subscription & Quota') }}
        </div>
        <div class="UserProfile-Details">
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.plan', 'Plan') }}
            </span>
            <span class="value">
              {{ planLabel }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.planStatus', 'Status') }}
            </span>
            <span class="value">
              {{ planStatus }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.planExpires', 'Expires') }}
            </span>
            <span class="value">
              {{ planExpiresAt }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.aiRequests', 'AI Requests') }}
            </span>
            <span class="value">
              {{ aiRequestsQuota }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.aiTokens', 'AI Tokens') }}
            </span>
            <span class="value">
              {{ aiTokensQuota }}
            </span>
          </div>
        </div>
      </div>
      <div class="UserProfile-Section">
        <div class="UserProfile-SectionTitle">
          {{ t('userProfile.teamDevices', 'Team & Devices') }}
        </div>
        <div class="UserProfile-Details">
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.teamName', 'Team') }}
            </span>
            <span class="value">
              {{ teamName }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.teamMembers', 'Members') }}
            </span>
            <span class="value">
              {{ teamMembers }}
            </span>
          </div>
          <div class="UserProfile-Row">
            <span class="label">
              {{ t('userProfile.devices', 'Devices') }}
            </span>
            <span class="value">
              {{ deviceCountLabel }}
            </span>
          </div>
        </div>
      </div>
      <div v-if="accountLoading" class="UserProfile-Loading">
        <span class="i-carbon-circle-dash animate-spin" />
        {{ t('userProfile.loading', 'Loading account data...') }}
      </div>
      <div v-else-if="accountError" class="UserProfile-Error">
        {{ accountError }}
      </div>
    </div>
    <template #footer>
      <TxButton variant="ghost" @click="profileVisible = false">
        {{ t('userProfile.close', 'Close') }}
      </TxButton>
      <TxButton variant="primary" @click="openUserProfile">
        {{ t('userProfile.openWeb', 'Open on web') }}
      </TxButton>
    </template>
  </TModal>
</template>

<style lang="scss" scoped>
/**
 * User Information Styling
 * Displays user avatar and information in a horizontal layout
 */

@keyframes user-info-enter {
  from {
    transform: translate(0, 100%);
  }
  to {
    transform: translate(0, 0);
  }
}

.FlatUserInfo {
  &.active {
    animation: user-info-enter 0.5s 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
  }

  &.clickable {
    cursor: pointer;
    border-radius: 8px;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--el-fill-color-light);

      .open-external-icon {
        opacity: 1;
      }
    }

    &:active {
      background-color: var(--el-fill-color);
    }
  }

  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0.5rem;
  width: 100%;
  box-sizing: border-box;

  transform: translate(0, 120px);

  .open-external-icon {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:before {
    content: '';
    position: absolute;
    padding: 0 5%;

    top: 0;
    left: 0;

    width: 100%;
    height: 1px;

    opacity: 0.5;
    background: linear-gradient(
      to right,
      transparent 5%,
      var(--el-border-color) 15%,
      var(--el-border-color) 85%,
      transparent 95%
    );
    background-repeat: no-repeat;
  }

  .user-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--el-color-primary-light-8);
    display: flex;
    align-items: center;
    justify-content: center;

    .avatar-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-8);
    }
  }

  .user-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .user-name {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      margin: 0;
      font-size: 11px;
      font-weight: 400;
      color: var(--el-text-color-regular);
      opacity: 0.8;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.UserProfile {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.UserProfile-Header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.UserProfile-Avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--el-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-8);
  }
}

.UserProfile-Identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.UserProfile-Name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfile-Email {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfile-Bio {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

.UserProfile-Details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--el-fill-color-lighter);
}

.UserProfile-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.UserProfile-Section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.UserProfile-SectionTitle {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.UserProfile-Row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);

  .label {
    color: var(--el-text-color-secondary);
  }

  .value {
    color: var(--el-text-color-primary);
    font-weight: 500;
  }
}

.UserProfile-Loading,
.UserProfile-Error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.UserProfile-Error {
  color: var(--el-color-danger);
}
</style>
