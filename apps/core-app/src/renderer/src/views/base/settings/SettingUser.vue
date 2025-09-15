<!--
  SettingUser Component

  Displays account information and login status in the settings page.
  Allows users to login or logout from their account.
-->
<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'

// Import utility hooks
import { useLogin } from '~/modules/hooks/function-hooks'

// Import UI components
import TBlockSlot from '@comp/base/group/TBlockSlot.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'

// Define component props
interface Props {
  env: any
}

defineProps<Props>()

const { t } = useI18n()

/**
 * Handle user login action
 * Calls the useLogin hook to initiate the login process
 * @returns void
 */
function login(): void {
  useLogin()
}
</script>

<!--
  SettingUser Component Template

  Displays account information and login/logout options in a structured layout.
-->
<template>
  <!-- Account group block -->
  <t-group-block
    :name="t('settingUser.groupTitle')"
    icon="account-box"
    :description="t('settingUser.groupDesc')"
  >
    <!-- User account information slot (shown when logged in) -->
    <t-block-slot
      v-if="env.account?.user"
      :title="env.account?.user.username"
      icon="account-circle"
      disabled
      :description="env.account?.user.email"
    >
      <!-- Logout button -->
      <FlatButton> {{ t('settingUser.logout') }} </FlatButton>
    </t-block-slot>

    <!-- No account slot (shown when not logged in) -->
    <t-block-slot
      v-else
      :title="t('settingUser.noAccount')"
      icon="account-circle"
      disabled
      :description="t('settingUser.noAccountDesc')"
    >
      <!-- Login button -->
      <FlatButton @click="login"> {{ t('settingUser.login') }} </FlatButton>
    </t-block-slot>
  </t-group-block>
</template>
