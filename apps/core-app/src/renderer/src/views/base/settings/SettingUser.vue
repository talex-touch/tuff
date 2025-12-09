<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
// import { appSetting } from '~/modules/channel/storage'
import { toast } from 'vue-sonner'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAuth } from '~/modules/auth/useAuth'

const { t } = useI18n()
const { isLoggedIn, currentUser, loginWithBrowser, logout } = useAuth()

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
      :title="currentUser?.name || '用户'"
      disabled
      :description="currentUser?.email || '已登录'"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
    >
      <FlatButton type="danger" @click="handleLogout">
        {{ t('settingUser.logout') }}
      </FlatButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-else
      :title="t('settingUser.noAccount')"
      disabled
      :description="t('settingUser.noAccountDesc')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
    >
      <FlatButton type="primary" @click="handleLogin">
        {{ t('settingUser.login') }}
      </FlatButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>
