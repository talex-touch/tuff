<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAuth } from '~/modules/auth/useAuth'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'

const { t } = useI18n()
const { isLoggedIn, currentUser, loginWithBrowser, logout, authLoadingState } = useAuth()

const isDev = import.meta.env.DEV
const NEXUS_URL = import.meta.env.VITE_NEXUS_URL || 'https://tuff.tagzxia.com'

const useLocalServer = computed({
  get: () => appSetting?.dev?.authServer === 'local',
  set: (val: boolean) => {
    if (appSetting?.dev) {
      appSetting.dev.authServer = val ? 'local' : 'production'
    }
  },
})

async function handleLogin() {
  try {
    const result = await loginWithBrowser()

    if (result.success) {
      console.log('登录结果:', result)
    }
  }
  catch (error) {
    console.error('登录过程出错:', error)
    toast.error('登录过程中发生错误')
  }
}

async function handleLogout() {
  try {
    await logout()
    toast.success('已登出')
  }
  catch (error) {
    console.error('登出失败:', error)
    toast.error('登出失败')
  }
}

function openUserProfile() {
  const profileUrl = `${NEXUS_URL}/dashboard/account`
  touchChannel.send('open-external', { url: profileUrl })
}

function openDeviceManagement() {
  const devicesUrl = `${NEXUS_URL}/dashboard/devices`
  touchChannel.send('open-external', { url: devicesUrl })
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
      :title="currentUser?.name || '用户'"
      :description="currentUser?.email || '已登录'"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
      @click="openUserProfile"
    >
      <template #tags>
        <span class="user-tag">
          <span class="i-carbon-checkmark-filled text-xs text-green-500" />
          {{ t('settingUser.verified', '已验证') }}
        </span>
      </template>
      <FlatButton mini @click.stop="openDeviceManagement">
        <span class="i-carbon-devices text-sm" />
      </FlatButton>
      <FlatButton type="danger" @click.stop="handleLogout">
        {{ t('settingUser.logout') }}
      </FlatButton>
    </TuffBlockSlot>

    <!-- Not logged in state -->
    <TuffBlockSlot
      v-else
      :title="t('settingUser.noAccount')"
      :description="t('settingUser.noAccountDesc')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
    >
      <FlatButton
        type="primary"
        :disabled="authLoadingState.isLoggingIn"
        @click="handleLogin"
      >
        <span v-if="authLoadingState.isLoggingIn" class="i-carbon-circle-dash animate-spin mr-1" />
        {{ authLoadingState.isLoggingIn ? t('settingUser.loggingIn', '登录中...') : t('settingUser.login') }}
      </FlatButton>
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
</style>
