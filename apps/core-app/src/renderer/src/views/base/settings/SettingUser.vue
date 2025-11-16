<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/modules/auth/useAuth'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
// import { appSetting } from '~/modules/channel/storage'
import { toast } from 'vue-sonner'

const { t } = useI18n()
const { isLoggedIn, currentUser, login, logout } = useAuth()

async function handleLogin() {
  try {
    const result = await login()

    if (result.success) {
      console.log('登录结果:', result)
    }
  } catch (error) {
    console.error('登录过程出错:', error)
    toast.error('登录过程中发生错误')
  }
}

async function handleLogout() {
  try {
    await logout()
    toast.success('已登出')
  } catch (error) {
    console.error('登出失败:', error)
    toast.error('登出失败')
  }
}
</script>

<template>
  <tuff-group-block
    :name="t('settingUser.groupTitle')"
    :description="t('settingUser.groupDesc')"
    default-icon="i-carbon-user"
    active-icon="i-carbon-user-avatar"
    memory-name="setting-user"
  >
    <tuff-block-slot
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
    </tuff-block-slot>

    <tuff-block-slot
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
    </tuff-block-slot>
  </tuff-group-block>
</template>
