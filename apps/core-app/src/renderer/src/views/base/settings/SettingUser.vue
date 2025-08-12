<!--
  SettingUser Component

  Displays account information and login status in the settings page.
  Allows users to login or logout from their account.
-->
<script setup lang="ts" name="SettingUser">
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
    name="Account"
    icon="account-box"
    description="Manage your account information and login status."
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
      <FlatButton> Logout </FlatButton>
    </t-block-slot>

    <!-- No account slot (shown when not logged in) -->
    <t-block-slot
      v-else
      title="No Account"
      icon="account-circle"
      disabled
      description="Account access is currently unavailable."
    >
      <!-- Login button -->
      <FlatButton @click="login"> Login </FlatButton>
    </t-block-slot>
  </t-group-block>
</template>
