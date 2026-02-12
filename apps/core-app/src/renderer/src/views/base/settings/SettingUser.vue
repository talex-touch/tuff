<script setup lang="ts" name="SettingUser">
import { TxButton } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getSyncPreferenceState, setSyncPreferenceByUser } from '~/modules/auth/sync-preferences'
import { useAuth } from '~/modules/auth/useAuth'
import { startAutoSync, stopAutoSync, triggerManualSync } from '~/modules/sync'
import { appSetting } from '~/modules/channel/storage'

const { t } = useI18n()
const {
  isLoggedIn,
  user,
  getDisplayName,
  getPrimaryEmail,
  loginWithBrowser,
  logout,
  runSyncBootstrap,
  authLoadingState
} = useAuth()

const profileEditorVisible = ref(false)
const syncSubmitting = ref(false)

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
      void runSyncBootstrap()
        .then((bootstrapped) => {
          if (bootstrapped) {
            return startAutoSync()
          }
          return undefined
        })
        .catch(() => {
          // ignore sync bootstrap failure on manual toggle
        })
    } else if (!enabled) {
      stopAutoSync('user-disabled')
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

const canTriggerManualSync = computed(
  () => isLoggedIn.value && syncEnabled.value && !syncSubmitting.value
)

const machineSeedMigratedAt = computed(() => {
  const value = appSetting.security?.machineSeedMigratedAt
  return typeof value === 'string' ? value.trim() : ''
})

const isDev = import.meta.env.DEV
const useLocalServer = computed({
  get: () => appSetting?.dev?.authServer === 'local',
  set: (val: boolean) => {
    if (!appSetting?.dev) {
      return
    }
    appSetting.dev.authServer = val ? 'local' : 'production'
  }
})

const allowLegacySeedFallback = computed({
  get: () => Boolean(appSetting.security?.allowLegacyMachineSeedFallback),
  set: (val: boolean) => {
    ensureSecuritySettings()
    appSetting.security.allowLegacyMachineSeedFallback = val
  }
})

async function handleLogin() {
  try {
    await loginWithBrowser()
  } catch {
    toast.error(t('settingUser.loginError'))
  }
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
      v-if="isLoggedIn"
      v-model="syncEnabled"
      :title="t('settingUser.syncEnabledTitle', '默认同步')"
      :description="syncToggleDescription"
      default-icon="i-carbon-cloud-satellite-config"
      active-icon="i-carbon-cloud-satellite"
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
        :disabled="authLoadingState.isLoggingIn"
        @click="handleLogin"
      >
        <span v-if="authLoadingState.isLoggingIn" class="i-carbon-circle-dash animate-spin mr-1" />
        {{ authLoadingState.isLoggingIn ? t('settingUser.loggingIn') : t('settingUser.login') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="isDev && !isLoggedIn"
      v-model="useLocalServer"
      :title="t('settingUser.devAuthServer', '本地服务器')"
      :description="useLocalServer ? 'localhost:3200' : 'tuff.tagzxia.com'"
      default-icon="i-carbon-development"
      active-icon="i-carbon-development"
    />

    <TuffBlockSwitch
      v-if="isDev && isLoggedIn"
      v-model="allowLegacySeedFallback"
      :title="t('settingUser.allowLegacySeedFallback', '允许明文 machine seed 回退（调试）')"
      :description="machineSeedMigratedAt ? `已迁移：${machineSeedMigratedAt}` : '未检测到迁移记录'"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
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
</style>
