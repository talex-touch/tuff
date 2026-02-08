<script setup lang="ts" name="SettingUser">
import { CloudSyncError, CloudSyncSDK, type KeyringMeta } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  getAppAuthToken,
  getAppDeviceId,
  getAuthBaseUrl,
  isLocalAuthMode
} from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { appSetting } from '~/modules/channel/storage'

const { t } = useI18n()
const {
  isLoggedIn,
  currentUser,
  user,
  getDisplayName,
  getPrimaryEmail,
  openLoginSettings,
  loginWithBrowser,
  logout,
  authLoadingState,
  requestStepUp,
  getStepUpToken,
  runWithStepUpToken
} = useAuth()
const appSdk = useAppSdk()

const profileEditorVisible = ref(false)
const syncSecurityVisible = ref(false)
const syncLoading = ref(false)
const syncSubmitting = ref(false)
const syncStatus = ref('')
const syncRecoveredCount = ref<number | null>(null)
const syncKeyrings = ref<KeyringMeta[]>([])

const syncIssueForm = reactive({
  targetDeviceId: '',
  keyType: 'uk',
  encryptedKey: '',
  recoveryCodeHash: ''
})

const syncRecoverForm = reactive({
  recoveryCode: ''
})

function ensureSecuritySettings() {
  if (!appSetting.security) {
    appSetting.security = {
      machineSeed: '',
      machineCodeHash: '',
      machineCodeAttestedAt: '',
      machineSeedMigratedAt: '',
      allowLegacyMachineSeedFallback: false
    }
  }
}

ensureSecuritySettings()

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

const avatarUrl = computed(() => user.value?.avatar || currentUser.value?.avatar || '')

const displayInitial = computed(() => {
  const seed = displayName.value || displayEmail.value
  return seed ? seed.trim().charAt(0).toUpperCase() : '?'
})

const stepUpReady = computed(() => Boolean(getStepUpToken()))

const syncKeyringSummary = computed(() => {
  const total = syncKeyrings.value.length
  if (!total) return '暂无 keyring 记录'
  const devices = new Set(syncKeyrings.value.map((item) => item.device_id).filter(Boolean)).size
  return `共 ${total} 条 keyring，设备数 ${devices}`
})

const machineSeedMigratedAt = computed(() => {
  const value = appSetting.security?.machineSeedMigratedAt
  return typeof value === 'string' ? value.trim() : ''
})

const isDev = import.meta.env.DEV
const useLocalServer = computed({
  get: () => appSetting?.dev?.authServer === 'local',
  set: (val: boolean) => {
    if (appSetting?.dev) {
      appSetting.dev.authServer = val ? 'local' : 'production'
    }
  }
})

const allowLegacySeedFallback = computed({
  get: () => Boolean(appSetting.security?.allowLegacyMachineSeedFallback),
  set: (val: boolean) => {
    ensureSecuritySettings()
    appSetting.security.allowLegacyMachineSeedFallback = val
  }
})

function createCloudSyncSdk(): CloudSyncSDK {
  return new CloudSyncSDK({
    baseUrl: getAuthBaseUrl(),
    getAuthToken: () => {
      const token = getAppAuthToken()
      if (!token) throw new Error('登录状态已失效，请重新登录')
      return token
    },
    getDeviceId: () => {
      const deviceId = getAppDeviceId()
      if (!deviceId) throw new Error('设备 ID 不可用')
      return deviceId
    }
  })
}

function getCloudSyncErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof CloudSyncError) {
    if (typeof error.data === 'object' && error.data && 'message' in error.data) {
      const detail = (error.data as { message?: unknown }).message
      if (typeof detail === 'string' && detail.trim()) {
        return detail
      }
    }
    if (typeof error.errorCode === 'string' && error.errorCode) {
      return error.errorCode
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function formatKeyringTime(value: string | null): string {
  if (!value) return '-'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleString()
}

function resetSyncStatus() {
  syncStatus.value = ''
}

async function refreshSyncKeyrings(showToast = false) {
  if (isLocalAuthMode()) {
    return
  }

  try {
    syncLoading.value = true
    const sdk = createCloudSyncSdk()
    syncKeyrings.value = await sdk.listKeyrings()
    if (showToast) {
      toast.success('同步密钥列表已刷新')
    }
  } catch (error) {
    const message = getCloudSyncErrorMessage(error, '获取同步密钥失败')
    syncStatus.value = message
    if (showToast) {
      toast.error(message)
    }
  } finally {
    syncLoading.value = false
  }
}

function openSyncSecurityPanel() {
  if (isLocalAuthMode()) {
    toast.info('本地模式不支持云同步安全面板')
    return
  }

  if (!syncIssueForm.targetDeviceId) {
    syncIssueForm.targetDeviceId = getAppDeviceId() ?? ''
  }
  syncSecurityVisible.value = true
  resetSyncStatus()
  syncRecoveredCount.value = null
  void refreshSyncKeyrings(false)
}

async function handleRecoverDeviceKeys() {
  if (isLocalAuthMode()) {
    toast.info('本地模式不支持云端密钥恢复')
    return
  }

  const recoveryCode = syncRecoverForm.recoveryCode.trim()
  if (!recoveryCode) {
    syncStatus.value = '请先输入恢复码'
    return
  }

  try {
    syncSubmitting.value = true
    resetSyncStatus()
    const sdk = createCloudSyncSdk()
    const keyrings = await runWithStepUpToken((stepUpToken) =>
      sdk.recoverDevice({ recovery_code: recoveryCode }, { stepUpToken })
    )
    syncRecoveredCount.value = keyrings.length
    syncStatus.value = `恢复成功，共 ${keyrings.length} 条密钥记录`
    syncRecoverForm.recoveryCode = ''
    await refreshSyncKeyrings(false)
  } catch (error) {
    syncStatus.value = getCloudSyncErrorMessage(error, '恢复密钥失败')
  } finally {
    syncSubmitting.value = false
  }
}

async function handleIssueDeviceKey() {
  if (isLocalAuthMode()) {
    toast.info('本地模式不支持设备密钥授权')
    return
  }

  const targetDeviceId = syncIssueForm.targetDeviceId.trim()
  const keyType = syncIssueForm.keyType.trim()
  const encryptedKey = syncIssueForm.encryptedKey.trim()
  const recoveryCodeHash = syncIssueForm.recoveryCodeHash.trim()

  if (!targetDeviceId) {
    syncStatus.value = '目标设备 ID 不能为空'
    return
  }

  if (!keyType) {
    syncStatus.value = 'key type 不能为空'
    return
  }

  if (!encryptedKey) {
    syncStatus.value = 'encrypted key 不能为空'
    return
  }

  try {
    syncSubmitting.value = true
    resetSyncStatus()
    const sdk = createCloudSyncSdk()
    const result = await runWithStepUpToken((stepUpToken) =>
      sdk.issueDeviceKey(
        {
          target_device_id: targetDeviceId,
          key_type: keyType,
          encrypted_key: encryptedKey,
          recovery_code_hash: recoveryCodeHash || undefined
        },
        { stepUpToken }
      )
    )
    syncStatus.value = `授权成功：${result.keyring_id}`
    syncIssueForm.encryptedKey = ''
    await refreshSyncKeyrings(false)
  } catch (error) {
    syncStatus.value = getCloudSyncErrorMessage(error, '授权设备密钥失败')
  } finally {
    syncSubmitting.value = false
  }
}

async function handleLogin() {
  try {
    const result = await loginWithBrowser()

    if (result.success) {
      console.log('登录结果:', result)
    }
  } catch (error) {
    console.error('登录过程出错:', error)
    toast.error(t('settingUser.loginError'))
  }
}

async function handleLogout() {
  try {
    await logout()
    toast.success(t('settingUser.logoutSuccess'))
  } catch (error) {
    console.error('登出失败:', error)
    toast.error(t('settingUser.logoutFailed'))
  }
}

function openProfileEditor() {
  profileEditorVisible.value = true
}

function openDeviceManagement() {
  const devicesUrl = `${getAuthBaseUrl()}/dashboard/devices`
  void appSdk.openExternal(devicesUrl)
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
        <span v-if="stepUpReady && !isLocalAuthMode()" class="user-tag user-tag-stepup">
          <span class="i-carbon-two-factor-authentication text-xs" />
          {{ t('settingUser.stepUpReady', '二次验证已完成') }}
        </span>
      </template>
      <div class="user-actions">
        <TxButton variant="flat" size="sm" @click.stop="openProfileEditor">
          {{ t('settingUser.editProfile') }}
        </TxButton>
        <TxButton variant="flat" size="sm" @click.stop="handleLoginMethods">
          {{ t('settingUser.loginSettings') }}
        </TxButton>
        <TxButton v-if="!isLocalAuthMode()" variant="flat" size="sm" @click.stop="requestStepUp">
          {{ t('settingUser.stepUp', '二次验证') }}
        </TxButton>
        <TxButton
          v-if="!isLocalAuthMode()"
          variant="flat"
          size="sm"
          @click.stop="openSyncSecurityPanel"
        >
          {{ t('settingUser.syncSecurity', '同步安全') }}
        </TxButton>
        <TxButton variant="flat" size="sm" @click.stop="openDeviceManagement">
          {{ t('settingUser.deviceManagement') }}
        </TxButton>
        <TxButton variant="flat" type="danger" size="sm" @click.stop="handleLogout">
          {{ t('settingUser.logout') }}
        </TxButton>
      </div>
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
        :disabled="authLoadingState.isLoggingIn"
        @click="handleLogin"
      >
        <span v-if="authLoadingState.isLoggingIn" class="i-carbon-circle-dash animate-spin mr-1" />
        {{ authLoadingState.isLoggingIn ? t('settingUser.loggingIn') : t('settingUser.login') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="isDev && isLoggedIn"
      v-model="allowLegacySeedFallback"
      :title="t('settingUser.allowLegacySeedFallback', '允许明文 machine seed 回退（调试）')"
      :description="machineSeedMigratedAt ? `已迁移：${machineSeedMigratedAt}` : '未检测到迁移记录'"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
    />

    <TuffBlockSwitch
      v-if="isDev && !isLoggedIn"
      v-model="useLocalServer"
      :title="t('settingUser.devAuthServer', '本地服务器')"
      :description="useLocalServer ? 'localhost:3200' : 'tuff.tagzxia.com'"
      default-icon="i-carbon-development"
      active-icon="i-carbon-development"
    />
  </TuffGroupBlock>

  <TModal v-model="profileEditorVisible" :title="t('userProfile.editTitle', 'Edit profile')">
    <UserProfileEditor :visible="profileEditorVisible" />
    <template #footer>
      <TxButton variant="ghost" @click="profileEditorVisible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TModal>

  <TModal
    v-model="syncSecurityVisible"
    :title="t('settingUser.syncSecurity', '同步安全')"
    width="760px"
  >
    <div class="sync-panel">
      <div class="sync-header">
        <div class="sync-summary">{{ syncKeyringSummary }}</div>
        <div v-if="syncRecoveredCount !== null" class="sync-summary">
          最近恢复：{{ syncRecoveredCount }} 条
        </div>
        <div class="sync-actions">
          <TxButton
            variant="flat"
            size="sm"
            :loading="syncLoading"
            @click="refreshSyncKeyrings(true)"
          >
            刷新
          </TxButton>
          <TxButton variant="flat" size="sm" @click="requestStepUp"> 二次验证 </TxButton>
        </div>
      </div>

      <div v-if="syncStatus" class="sync-status">{{ syncStatus }}</div>

      <div v-if="syncKeyrings.length" class="sync-list">
        <div v-for="item in syncKeyrings" :key="item.keyring_id" class="sync-item">
          <div class="sync-item-main">
            <div class="sync-item-line">
              <span class="sync-item-label">device</span>
              <span class="sync-item-value">{{ item.device_id }}</span>
            </div>
            <div class="sync-item-line">
              <span class="sync-item-label">type</span>
              <span class="sync-item-value">{{ item.key_type }}</span>
            </div>
            <div class="sync-item-line">
              <span class="sync-item-label">created</span>
              <span class="sync-item-value">{{ formatKeyringTime(item.created_at) }}</span>
            </div>
            <div class="sync-item-line">
              <span class="sync-item-label">rotated</span>
              <span class="sync-item-value">{{ formatKeyringTime(item.rotated_at) }}</span>
            </div>
          </div>
          <div class="sync-item-meta">
            <span class="sync-chip" :class="item.has_recovery_code ? 'ok' : 'warn'">
              {{ item.has_recovery_code ? 'has recovery code' : 'no recovery code' }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="sync-empty">暂无 keyring 数据</div>

      <div class="sync-forms">
        <div class="sync-form">
          <div class="sync-form-title">恢复设备密钥</div>
          <input
            v-model="syncRecoverForm.recoveryCode"
            class="sync-input"
            type="password"
            placeholder="输入 Recovery Code"
          />
          <TxButton
            variant="flat"
            type="primary"
            :loading="syncSubmitting"
            @click="handleRecoverDeviceKeys"
          >
            执行恢复
          </TxButton>
        </div>

        <div class="sync-form">
          <div class="sync-form-title">授权设备密钥</div>
          <input
            v-model="syncIssueForm.targetDeviceId"
            class="sync-input"
            type="text"
            placeholder="target device id"
          />
          <input
            v-model="syncIssueForm.keyType"
            class="sync-input"
            type="text"
            placeholder="key type"
          />
          <textarea
            v-model="syncIssueForm.encryptedKey"
            class="sync-input sync-textarea"
            rows="3"
            placeholder="encrypted key"
          />
          <input
            v-model="syncIssueForm.recoveryCodeHash"
            class="sync-input"
            type="text"
            placeholder="recovery code hash (optional)"
          />
          <TxButton
            variant="flat"
            type="primary"
            :loading="syncSubmitting"
            @click="handleIssueDeviceKey"
          >
            执行授权
          </TxButton>
        </div>
      </div>
    </div>

    <template #footer>
      <TxButton variant="ghost" @click="syncSecurityVisible = false">
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
  background: color-mix(in srgb, var(--el-color-success) 15%, transparent);
  color: var(--el-color-success);
}

.user-tag + .user-tag {
  margin-left: 6px;
}

.user-tag-stepup {
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  color: var(--el-color-primary);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--el-color-primary-light-8);
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
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
}

.user-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sync-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sync-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.sync-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sync-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.sync-status {
  font-size: 12px;
  color: var(--el-color-primary);
}

.sync-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  padding-right: 4px;
}

.sync-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
}

.sync-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-item-line {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.sync-item-label {
  color: var(--el-text-color-secondary);
}

.sync-item-value {
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.sync-item-meta {
  display: flex;
  align-items: center;
}

.sync-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
}

.sync-chip.ok {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 15%, transparent);
}

.sync-chip.warn {
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 15%, transparent);
}

.sync-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sync-forms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.sync-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px;
}

.sync-form-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sync-input {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.sync-textarea {
  resize: vertical;
}

@media (max-width: 920px) {
  .sync-forms {
    grid-template-columns: 1fr;
  }
}
</style>
