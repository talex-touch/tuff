<script setup lang="ts" name="SettingUser">
import { useLogin } from "~/modules/hooks/function-hooks.ts";
import TBlockSlot from "@comp/base/group/TBlockSlot.vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'

defineProps({
  env: {
    type: Object,
    required: true
  }
})

function login() {
  useLogin()
}
</script>

<template>
  <t-group-block name="Account" icon="account-box" description="Manage your account information and login status.">

    <t-block-slot v-if="env.account?.user" :title="env.account?.user.username" icon="account-circle" disabled
      :description="env.account?.user.email">

      <FlatButton>
        Logout
      </FlatButton>
    </t-block-slot>

    <t-block-slot v-else title="No Account" icon="account-circle" disabled
      description="Account access is currently unavailable.">

      <FlatButton @click="login">
        Login
      </FlatButton>
    </t-block-slot>
  </t-group-block>
</template>