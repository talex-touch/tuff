<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/modules/auth/useAuth'
import TBlockSlot from '@comp/base/group/TBlockSlot.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
// import { appSetting } from '~/modules/channel/storage'
import { ElMessage } from 'element-plus'

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
    ElMessage.error('登录过程中发生错误')
  }
}

async function handleLogout() {
  try {
    await logout()
    ElMessage.success('已登出')
  } catch (error) {
    console.error('登出失败:', error)
    ElMessage.error('登出失败')
  }
}
</script>

<template>
  <t-group-block
    :name="t('settingUser.groupTitle')"
    icon="account-box"
    :description="t('settingUser.groupDesc')"
  >
    <t-block-slot
      v-if="isLoggedIn"
      :title="currentUser?.name || '用户'"
      icon="account-circle"
      disabled
      :description="currentUser?.email || '已登录'"
    >
      <FlatButton type="danger" @click="handleLogout">
        {{ t('settingUser.logout') }}
      </FlatButton>
    </t-block-slot>

    <t-block-slot
      v-else
      :title="t('settingUser.noAccount')"
      icon="account-circle"
      disabled
      :description="t('settingUser.noAccountDesc')"
    >
      <FlatButton type="primary" @click="handleLogin">
        {{ t('settingUser.login') }}
      </FlatButton>
    </t-block-slot>
  </t-group-block>
</template>
