<script setup lang="ts" name="SettingUser">
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getAuthBaseUrl, isLocalAuthMode } from '~/modules/auth/auth-env'
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
  authLoadingState
} = useAuth()
const appSdk = useAppSdk()
const profileEditorVisible = ref(false)

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

const isDev = import.meta.env.DEV
const useLocalServer = computed({
  get: () => appSetting?.dev?.authServer === 'local',
  set: (val: boolean) => {
    if (appSetting?.dev) {
      appSetting.dev.authServer = val ? 'local' : 'production'
    }
  }
})

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
    <!-- Logged in state -->
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
        <TxButton variant="flat" size="sm" @click.stop="handleLoginMethods">
          {{ t('settingUser.loginSettings') }}
        </TxButton>
        <TxButton variant="flat" size="sm" @click.stop="openDeviceManagement">
          {{ t('settingUser.deviceManagement') }}
        </TxButton>
        <TxButton variant="flat" type="danger" size="sm" @click.stop="handleLogout">
          {{ t('settingUser.logout') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <!-- Not logged in state -->
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

    <!-- Dev mode: Auth server selector -->
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
