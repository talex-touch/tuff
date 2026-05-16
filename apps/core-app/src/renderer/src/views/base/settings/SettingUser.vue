<script setup lang="ts" name="SettingUser">
import { TxButton } from '@talex-touch/tuffex'
import type { SecureStoreHealthResponse } from '@talex-touch/utils/transport/events/types'
import { isDevEnv } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import CreditsSummaryBlock from '~/components/account/CreditsSummaryBlock.vue'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getSyncPreferenceState, setSyncPreferenceByUser } from '~/modules/auth/sync-preferences'
import { useAuth } from '~/modules/auth/useAuth'
import {
  getRuntimeNexusBaseUrl,
  getRuntimeServerMode,
  setRuntimeServerMode
} from '~/modules/nexus/runtime-base'
import { triggerManualSync } from '~/modules/sync'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()
const transport = useTuffTransport()
const {
  isLoggedIn,
  user,
  getDisplayName,
  getPrimaryEmail,
  loginWithBrowser,
  reopenBrowserLogin,
  cancelPendingBrowserLogin,
  logout,
  runSyncBootstrap,
  authLoadingState
} = useAuth()

const profileEditorVisible = ref(false)
const loginDialogVisible = ref(false)
const loginErrorMessage = ref('')
const syncSubmitting = ref(false)
const secureStoreHealth = ref<SecureStoreHealthResponse | null>(null)

function ensureSecuritySettings() {
  if (!appSetting.security) {
    appSetting.security = {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    }
  }
}

function ensureAuthSettings() {
  if (!appSetting.auth) {
    appSetting.auth = {
      deviceId: '',
      deviceName: '',
      devicePlatform: '',
      useSecureStorage: true,
      secureStorageUserOverridden: false,
      secureStorageReminderShown: false,
      secureStorageUnavailable: false
    }
    return
  }

  if (typeof appSetting.auth.secureStorageUserOverridden !== 'boolean') {
    appSetting.auth.secureStorageUserOverridden = false
  }
  if (typeof appSetting.auth.useSecureStorage !== 'boolean') {
    appSetting.auth.useSecureStorage = true
  } else if (
    appSetting.auth.useSecureStorage === false &&
    appSetting.auth.secureStorageUserOverridden === false
  ) {
    appSetting.auth.useSecureStorage = true
  }
  if (typeof appSetting.auth.secureStorageReminderShown !== 'boolean') {
    appSetting.auth.secureStorageReminderShown = false
  }
  if (typeof appSetting.auth.secureStorageUnavailable !== 'boolean') {
    appSetting.auth.secureStorageUnavailable = false
  }
}

ensureSecuritySettings()
ensureAuthSettings()

const displayName = computed(() => getDisplayName())
const displayEmail = computed(() => getPrimaryEmail())
const avatarUrl = computed(() => user.value?.avatar || '')

const displayInitial = computed(() => {
  const seed = displayName.value || displayEmail.value
  return seed ? seed.trim().charAt(0).toUpperCase() : '?'
})

const syncEnabled = computed({
  get: () => getSyncPreferenceState().enabled,
  set: (val: boolean) => {
    const enabled = Boolean(val)
    setSyncPreferenceByUser(enabled)
    if (enabled && isLoggedIn.value) {
      void runSyncBootstrap().catch(() => {
        // ignore sync bootstrap failure on manual toggle
      })
    }
  }
})

const syncToggleDescription = computed(() => {
  const sync = getSyncPreferenceState()
  if (syncEnabled.value) {
    return sync.autoEnabledAt ? '登录后默认启用，可在此关闭。' : '同步已开启。'
  }
  return sync.userOverridden ? '你已手动关闭，同步不会在登录时自动恢复。' : '同步已关闭。'
})

function formatIsoTime(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    return '未记录'
  }
  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp)) {
    return normalized
  }
  return new Date(timestamp).toLocaleString()
}

const syncRuntimeDescription = computed(() => {
  const sync = getSyncPreferenceState()
  const statusTextMap: Record<string, string> = {
    idle: '空闲',
    syncing: '同步中',
    paused: '已暂停',
    error: '异常'
  }
  const statusText = statusTextMap[sync.status] ?? sync.status
  const lastSuccess = formatIsoTime(sync.lastSuccessAt ?? '')
  const queueDepth = Number.isFinite(sync.queueDepth) ? sync.queueDepth : 0
  const lastPush = formatIsoTime(sync.lastPushAt ?? '')
  const lastPull = formatIsoTime(sync.lastPullAt ?? '')
  const errorCode = (sync.lastErrorCode ?? '').trim()
  const blockedTextMap: Record<string, string> = {
    quota: '配额受限',
    device: '设备未授权',
    auth: '鉴权异常'
  }
  const blockedText = blockedTextMap[sync.blockedReason] ?? ''
  const parts = [
    `状态：${statusText}`,
    `最近成功：${lastSuccess}`,
    `最近推送：${lastPush}`,
    `最近拉取：${lastPull}`,
    `队列：${queueDepth}`
  ]
  if (blockedText) {
    parts.push(`阻塞：${blockedText}`)
  }
  if (errorCode) {
    parts.push(`错误：${errorCode}`)
  }
  return parts.join(' · ')
})

const secureStorageEnabled = computed({
  get: () => Boolean(appSetting.auth?.useSecureStorage),
  set: (val: boolean) => {
    ensureAuthSettings()
    const enabled = Boolean(val)
    appSetting.auth.useSecureStorage = enabled
    appSetting.auth.secureStorageUserOverridden = true
    if (enabled) {
      toast.success('已启用登录凭证持久保护')
      void refreshSecureStoreHealth()
      return
    }
    toast.info('已切换为会话模式：登录凭证仅在本次运行有效')
  }
})

const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))
const showRuntimeApiServer = computed(() => isDevEnv() && !isLoggedIn.value)

const secureStorageDescription = computed(() => {
  if (!secureStorageEnabled.value) {
    if (isLoggedIn.value) {
      return '你已关闭凭证持久保护：当前为会话模式，重启后需要重新登录。'
    }
    return '你已关闭凭证持久保护：下次登录仅在本次会话有效。'
  }

  const health = secureStoreHealth.value
  if (!health) {
    return '正在检测本地凭证保护后端。'
  }
  if (!health.available || appSetting.auth?.secureStorageUnavailable === true) {
    return '本地安全上下文不可用，登录凭证仅在本次运行内保持。'
  }
  if (health.backend === 'local-secret') {
    return '本地加密保护已启用：凭证由本机 root 密钥加密保存，重启后仍可保持登录状态。'
  }
  return '本地安全上下文不可用，登录凭证仅在本次运行内保持。'
})

const canTriggerManualSync = computed(
  () => isLoggedIn.value && syncEnabled.value && !syncSubmitting.value
)

const useLocalServer = computed({
  get: () => getRuntimeServerMode() === 'local',
  set: (val: boolean) => {
    setRuntimeServerMode(val ? 'local' : 'production')
  }
})

const runtimeServerDescription = computed(() => getRuntimeNexusBaseUrl())
const loginDialogTitle = computed(() => {
  if (authLoadingState.loginStage === 'failed') {
    return t('settingUser.loginDialogFailedTitle')
  }
  if (authLoadingState.loginStage === 'success') {
    return t('settingUser.loginDialogSuccessTitle')
  }
  if (authLoadingState.loginStage === 'waiting') {
    return t('settingUser.loginDialogWaitingTitle')
  }
  return t('settingUser.loginDialogPreparingTitle')
})
const loginDialogDescription = computed(() => {
  if (authLoadingState.loginStage === 'failed') {
    return loginErrorMessage.value || t('settingUser.loginDialogFailedDesc')
  }
  if (authLoadingState.loginStage === 'success') {
    return t('settingUser.loginDialogSuccessDesc')
  }
  if (authLoadingState.loginStage === 'waiting') {
    return t('settingUser.loginDialogWaitingDesc', {
      seconds: authLoadingState.loginTimeRemaining || ''
    })
  }
  return t('settingUser.loginDialogPreparingDesc')
})

async function handleLogin() {
  loginDialogVisible.value = true
  loginErrorMessage.value = ''
  try {
    const result = await loginWithBrowser()
    if (result.success) {
      window.setTimeout(() => {
        loginDialogVisible.value = false
      }, 700)
      return
    }
    loginErrorMessage.value = result.error instanceof Error ? result.error.message : ''
  } catch (error) {
    loginErrorMessage.value = error instanceof Error ? error.message : ''
    toast.error(t('settingUser.loginError'))
  }
}

async function handleReopenLogin() {
  try {
    await reopenBrowserLogin()
  } catch {
    toast.error(t('settingUser.loginError'))
  }
}

function handleCancelLogin() {
  cancelPendingBrowserLogin()
  loginDialogVisible.value = false
  toast.info(t('settingUser.loginCancelled'))
}

async function handleLogout() {
  try {
    await logout()
    toast.success(t('settingUser.logoutSuccess'))
  } catch {
    toast.error(t('settingUser.logoutFailed'))
  }
}

function openProfileEditor() {
  profileEditorVisible.value = true
}

async function handleSyncNow() {
  if (!isLoggedIn.value) {
    return
  }
  if (!syncEnabled.value) {
    toast.info('请先开启同步')
    return
  }
  if (syncSubmitting.value) {
    return
  }

  syncSubmitting.value = true
  try {
    await triggerManualSync('user')
    toast.success('同步完成')
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败'
    toast.error(message || '同步失败')
  } finally {
    syncSubmitting.value = false
  }
}

async function refreshSecureStoreHealth() {
  try {
    secureStoreHealth.value = await transport.send(AppEvents.system.getSecureStoreHealth)
  } catch {
    secureStoreHealth.value = {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Failed to query secure store health'
    }
  }
}

onMounted(() => {
  void refreshSecureStoreHealth()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settingUser.groupTitle')"
    :description="t('settingUser.groupDesc')"
    default-icon="i-carbon-user"
    active-icon="i-carbon-user-avatar"
    memory-name="setting-user"
  >
    <TuffBlockSlot
      v-if="isLoggedIn"
      :title="displayName || t('settingUser.defaultName')"
      :description="displayEmail || t('settingUser.loggedIn')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
      @click="openProfileEditor"
    >
      <template #icon>
        <div class="user-avatar">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName || displayEmail || 'User'"
            class="user-avatar-image"
          />
          <div v-else class="user-avatar-placeholder">
            {{ displayInitial }}
          </div>
        </div>
      </template>

      <template #tags>
        <span class="user-tag">
          <span class="i-carbon-checkmark-filled text-xs text-green-500" />
          {{ t('settingUser.verified') }}
        </span>
      </template>

      <div class="user-actions">
        <TxButton variant="flat" size="sm" @click.stop="openProfileEditor">
          {{ t('settingUser.editProfile') }}
        </TxButton>
        <TxButton variant="flat" type="danger" size="sm" @click.stop="handleLogout">
          {{ t('settingUser.logout') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="isLoggedIn && showAdvancedSettings"
      v-model="syncEnabled"
      :title="t('settingUser.syncEnabledTitle', '默认同步')"
      :description="syncToggleDescription"
      default-icon="i-carbon-cloud-satellite-config"
      active-icon="i-carbon-cloud-satellite"
    />

    <TuffBlockSwitch
      v-if="showAdvancedSettings"
      v-model="secureStorageEnabled"
      :title="t('settingUser.secureStorageTitle', '登录凭证保护')"
      :description="secureStorageDescription"
      default-icon="i-carbon-locked"
      active-icon="i-carbon-locked"
    />

    <TuffBlockSlot
      v-if="isLoggedIn"
      :title="t('settingUser.syncStatusTitle', '同步状态')"
      :description="syncRuntimeDescription"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <TxButton
        variant="flat"
        size="sm"
        type="primary"
        :loading="syncSubmitting"
        :disabled="!canTriggerManualSync"
        @click.stop="handleSyncNow"
      >
        {{ t('settingUser.syncNow', '立即同步') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-else
      :title="t('settingUser.noAccount')"
      :description="t('settingUser.noAccountDesc')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
    >
      <TxButton
        variant="flat"
        type="primary"
        :loading="authLoadingState.isLoggingIn"
        :disabled="authLoadingState.isLoggingIn"
        @click="handleLogin"
      >
        {{ t('settingUser.login') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="showRuntimeApiServer"
      v-model="useLocalServer"
      :title="t('settingUser.runtimeApiServer', '运行时 API 服务器')"
      :description="runtimeServerDescription"
      default-icon="i-carbon-development"
      active-icon="i-carbon-development"
    />
  </TuffGroupBlock>

  <CreditsSummaryBlock context="settings" />

  <TModal v-model="loginDialogVisible" :title="loginDialogTitle">
    <div class="login-dialog">
      <div class="login-dialog__icon" :class="`is-${authLoadingState.loginStage}`">
        <span
          :class="
            authLoadingState.loginStage === 'failed'
              ? 'i-carbon-warning-filled'
              : authLoadingState.loginStage === 'success'
                ? 'i-carbon-checkmark-filled'
                : 'i-carbon-circle-dash animate-spin'
          "
        />
      </div>
      <p>{{ loginDialogDescription }}</p>
    </div>
    <template #footer>
      <TxButton
        v-if="authLoadingState.loginStage === 'waiting'"
        variant="ghost"
        @click="handleReopenLogin"
      >
        {{ t('settingUser.reopenLogin') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.loginStage === 'failed'"
        variant="flat"
        type="primary"
        @click="handleLogin"
      >
        {{ t('settingUser.retryLogin') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.isLoggingIn"
        variant="ghost"
        type="danger"
        @click="handleCancelLogin"
      >
        {{ t('settingUser.cancelLogin') }}
      </TxButton>
      <TxButton v-else variant="ghost" @click="loginDialogVisible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TModal>

  <TModal v-model="profileEditorVisible" :title="t('userProfile.editTitle', 'Edit profile')">
    <UserProfileEditor :visible="profileEditorVisible" />
    <template #footer>
      <TxButton variant="ghost" @click="profileEditorVisible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TModal>
</template>

<style scoped>
.user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: color-mix(in srgb, var(--tx-color-success) 15%, transparent);
  color: var(--tx-color-success);
}

.user-tag + .user-tag {
  margin-left: 6px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--tx-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-placeholder {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-light-8);
}

.user-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.login-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 4px 12px;
  text-align: center;
  color: var(--tx-text-color-secondary);
}

.login-dialog__icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
  font-size: 26px;
}

.login-dialog__icon.is-success {
  color: var(--tx-color-success);
  background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
}

.login-dialog__icon.is-failed {
  color: var(--tx-color-danger);
  background: color-mix(in srgb, var(--tx-color-danger) 14%, transparent);
}
</style>
