<script lang="ts" setup>
import { TxButton, TxFlipOverlay, TxSpinner, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { fetchNexusWithAuth } from '~/modules/market/nexus-auth-client'

const { t } = useI18n()
const {
  isLoggedIn,
  user,
  getDisplayName,
  getPrimaryEmail,
  getUserBio,
  openLoginSettings,
  requestStepUp
} = useAuth()

const profileVisible = ref(false)
const profileEditing = ref(false)
const profileTab = ref<'overview' | 'security'>('overview')
const profileTriggerRef = ref<HTMLElement | null>(null)
const accountLoading = ref(false)
const accountLoaded = ref(false)
const accountError = ref('')
const subscriptionStatus = ref<SubscriptionStatus | null>(null)
const teamSummary = ref<TeamSummary | null>(null)
const deviceCount = ref<number | null>(null)
const lastFetchedAt = ref(0)
const appSdk = useAppSdk()

const displayName = computed(() => {
  return getDisplayName()
})
const displayEmail = computed(() => {
  return getPrimaryEmail()
})
const displayId = computed(() => user.value?.id || '')
const avatarUrl = computed(() => user.value?.avatar || '')
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
  teamSummary.value?.seats
    ? `${teamSummary.value.seats.used}/${teamSummary.value.seats.total}`
    : '-'
)
const teamRole = computed(() => (teamSummary.value?.role ? teamSummary.value.role : '-'))
const showUpgradeTeam = computed(() => Boolean(teamSummary.value?.upgrade?.required))
const deviceCountLabel = computed(() => (deviceCount.value === null ? '-' : `${deviceCount.value}`))
const statusBadgeLabel = computed(() =>
  isLoggedIn.value
    ? t('userProfile.statusSignedIn', 'Signed in')
    : t('userProfile.statusSignedOut', 'Signed out')
)

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
  team?: TeamSummary
}

interface TeamSummary {
  id: string
  name: string
  type: 'personal' | 'organization'
  role: 'owner' | 'admin' | 'member'
  collaborationEnabled: boolean
  seats: { total: number; used: number }
  permissions: {
    canInvite: boolean
    canManageMembers: boolean
    canDisband: boolean
    canCreateTeam: boolean
  }
  upgrade: {
    required: boolean
    targetPlan: 'TEAM' | null
  }
  manageUrl?: string
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

function openTeamManagement() {
  const path = teamSummary.value?.manageUrl || '/dashboard/team'
  const teamUrl = `${getAuthBaseUrl()}${path}`
  void appSdk.openExternal(teamUrl)
  profileVisible.value = false
}

function openTeamUpgrade() {
  const upgradeUrl = `${getAuthBaseUrl()}/pricing`
  void appSdk.openExternal(upgradeUrl)
  profileVisible.value = false
}

function toggleProfileEditor() {
  profileEditing.value = !profileEditing.value
}

async function handleLoginMethods() {
  try {
    const opened = await openLoginSettings()
    if (!opened) {
      const loginUrl = `${getAuthBaseUrl()}/dashboard/account`
      await appSdk.openExternal(loginUrl)
      toast.info(t('userProfile.loginMethodsWeb'))
    }
  } catch {
    toast.error(t('userProfile.loginMethodsFailed'))
  }
}

function openSyncSecurity() {
  const syncSecurityUrl = `${getAuthBaseUrl()}/dashboard/account`
  void appSdk.openExternal(syncSecurityUrl)
  profileVisible.value = false
}

function openProfileDialog() {
  if (!isLoggedIn.value) {
    return
  }
  profileTab.value = 'overview'
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
    const subscription = await fetchNexusJson<SubscriptionStatus>('/api/subscription/status')
    subscriptionStatus.value = subscription
    teamSummary.value = subscription.team || null

    await loadDeviceSummary()
    accountLoaded.value = true
    lastFetchedAt.value = now
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : ''
    accountError.value = /^401\b/.test(errorMessage)
      ? t('userProfile.authRequired', '登录后才能获取账户信息')
      : errorMessage || t('userProfile.loadFailed', '加载账户信息失败')
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
    profileEditing.value = false
    if (profileVisible.value) {
      profileVisible.value = false
    }
  }
})
</script>

<template>
  <div
    ref="profileTriggerRef"
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
  <Teleport to="body">
    <TxFlipOverlay
      v-model="profileVisible"
      :source="profileTriggerRef"
      :duration="420"
      :rotate-x="6"
      :rotate-y="8"
      :speed-boost="1.1"
      transition-name="UserProfileOverlay-Mask"
      mask-class="UserProfileOverlay-Mask"
      card-class="UserProfileOverlay-Card"
    >
      <template #default="{ close }">
        <div class="UserProfileOverlay">
          <div class="UserProfileOverlay-Header">
            <div class="UserProfileOverlay-Title">{{ t('userProfile.title', 'Account') }}</div>
            <TxButton variant="flat" size="sm" class="UserProfileOverlay-CloseBtn" @click="close">
              <i class="i-ri-close-line" />
            </TxButton>
          </div>
          <TxTabs
            v-model="profileTab"
            class="UserProfileOverlay-Tabs"
            placement="top"
            :content-padding="0"
            :content-scrollable="true"
            :animation="{ indicator: { durationMs: 500 } }"
            borderless
          >
            <TxTabItem name="overview" activation>
              <template #name>{{ t('userProfile.overview', '概览') }}</template>
              <div class="UserProfile">
                <div class="UserProfile-TopCard">
                  <div class="UserProfile-TopIdentity">
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
                      <div class="UserProfile-NameRow">
                        <p class="UserProfile-Name">
                          {{ displayName || t('userProfile.unknownName', 'User') }}
                        </p>
                        <span class="UserProfile-Badge">
                          {{ statusBadgeLabel }}
                        </span>
                      </div>
                      <p class="UserProfile-Email">
                        {{ displayEmail || t('userProfile.unknownEmail', 'No email') }}
                      </p>
                      <p class="UserProfile-MetaText">
                        {{ t('userProfile.id', 'User ID') }}: {{ displayId || '-' }}
                      </p>
                      <p v-if="profileBio" class="UserProfile-MetaText">
                        {{ profileBio }}
                      </p>
                    </div>
                  </div>
                  <div class="UserProfile-TopPlan">
                    <p class="UserProfile-TopPlanLabel">
                      {{ t('userProfile.plan', 'Plan') }}
                    </p>
                    <p class="UserProfile-TopPlanValue">
                      {{ planLabel }}
                    </p>
                    <p class="UserProfile-TopPlanMeta">{{ planStatus }} · {{ planExpiresAt }}</p>
                    <TxButton variant="flat" size="sm" @click="toggleProfileEditor">
                      {{
                        profileEditing
                          ? t('userProfile.hideEditor', 'Hide editor')
                          : t('userProfile.manage', 'Manage')
                      }}
                    </TxButton>
                  </div>
                </div>

                <div v-if="profileEditing" class="UserProfile-ManagePanel">
                  <div class="UserProfile-SectionTitle">
                    {{ t('userProfile.editTitle', 'Edit profile') }}
                  </div>
                  <UserProfileEditor :visible="profileEditing" />
                </div>

                <div class="UserProfile-MetricsGrid">
                  <div class="UserProfile-Section">
                    <div class="UserProfile-SectionTitle">
                      {{ t('userProfile.subscription', 'Subscription & Quota') }}
                    </div>
                    <div class="UserProfile-Details">
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
                          {{ t('userProfile.teamRole', 'Role') }}
                        </span>
                        <span class="value">
                          {{ teamRole }}
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
                    <div class="UserProfile-Actions">
                      <TxButton variant="flat" size="sm" @click="openTeamManagement">
                        {{ t('userProfile.manageTeam', 'Manage Team') }}
                      </TxButton>
                      <TxButton
                        v-if="showUpgradeTeam"
                        variant="flat"
                        size="sm"
                        @click="openTeamUpgrade"
                      >
                        {{ t('userProfile.upgradeTeam', 'Upgrade to Team') }}
                      </TxButton>
                    </div>
                  </div>
                </div>
                <div v-if="accountLoading" class="UserProfile-Loading">
                  <TxSpinner :size="16" />
                  {{ t('userProfile.loading', 'Loading account data...') }}
                </div>
                <div v-else-if="accountError" class="UserProfile-Error">
                  {{ accountError }}
                </div>
                <div class="UserProfile-Actions">
                  <TxButton variant="flat" size="sm" @click="openUserProfile">
                    {{ t('userProfile.openWeb', 'Open on web') }}
                  </TxButton>
                </div>
              </div>
            </TxTabItem>
            <TxTabItem name="security">
              <template #name>{{ t('userProfile.security', '安全与登录') }}</template>
              <div class="UserProfileTabContent">
                <div class="UserProfile-SectionTitle">
                  {{ t('userProfile.securityActions', '登录与安全选项') }}
                </div>
                <div class="UserProfile-Actions">
                  <TxButton variant="flat" size="sm" @click="handleLoginMethods">
                    {{ t('userProfile.openEmailSettings', 'Manage email') }}
                  </TxButton>
                  <TxButton variant="flat" size="sm" @click="openSyncSecurity">
                    {{ t('settingUser.syncSecurity', '同步安全') }}
                  </TxButton>
                  <TxButton variant="flat" size="sm" @click="openDeviceManagement">
                    {{ t('userProfile.devices', 'Devices') }}
                  </TxButton>
                  <TxButton variant="flat" size="sm" @click="requestStepUp">
                    {{ t('settingUser.stepUp', '二次验证') }}
                  </TxButton>
                </div>
              </div>
            </TxTabItem>
          </TxTabs>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
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
    transition:
      background-color 0.2s ease,
      transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background-color: var(--el-fill-color-light);

      .open-external-icon {
        opacity: 1;
        transform: translate(1px, -1px);
      }
    }

    &:active {
      background-color: var(--el-fill-color);
      transform: scale(0.98);
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
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
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
  gap: 14px;
  padding: 14px 16px 18px;
}

.UserProfileOverlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.UserProfileOverlay-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.UserProfileOverlay-Title {
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.UserProfileOverlay-CloseBtn {
  flex: 0 0 auto;
}

.UserProfileOverlay-Tabs {
  flex: 1;
  min-height: 0;
}

.UserProfileTabContent {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.UserProfile-TopCard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: stretch;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: var(--el-fill-color-lighter);
  padding: 14px;
}

.UserProfile-TopIdentity {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.UserProfile-Avatar {
  width: 54px;
  height: 54px;
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
    font-size: 17px;
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
  gap: 3px;
}

.UserProfile-NameRow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.UserProfile-Name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfile-Badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.UserProfile-Email {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfile-MetaText {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfile-TopPlan {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 16px;
  border-left: 1px solid var(--el-border-color-light);
  justify-content: center;
}

.UserProfile-TopPlanLabel {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.UserProfile-TopPlanValue {
  margin: 0;
  font-size: 24px;
  line-height: 1;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.UserProfile-TopPlanMeta {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.UserProfile-ManagePanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.UserProfile-ManageFooter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
}

.UserProfile-ManageInfo {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.UserProfile-ManageLabel {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.UserProfile-ManageValue {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.UserProfile-ManageHint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.UserProfile-MetricsGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.UserProfile-Details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
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
  gap: 10px;
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

@media (max-width: 760px) {
  .UserProfile-TopCard {
    grid-template-columns: 1fr;
  }

  .UserProfile-TopPlan {
    min-width: 0;
    border-left: none;
    border-top: 1px solid var(--el-border-color-light);
    padding-left: 0;
    padding-top: 12px;
  }

  .UserProfile-MetricsGrid {
    grid-template-columns: 1fr;
  }
}
</style>

<style lang="scss">
.UserProfileOverlay-Mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.UserProfileOverlay-Mask-enter-active,
.UserProfileOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.UserProfileOverlay-Mask-enter-from,
.UserProfileOverlay-Mask-leave-to {
  opacity: 0;
}

.UserProfileOverlay-Card {
  width: min(940px, 92vw);
  height: min(760px, 88vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.2rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
