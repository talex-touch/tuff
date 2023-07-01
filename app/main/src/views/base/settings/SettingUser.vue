<script setup lang="ts" name="SettingUser">
import { useLogin } from "@modules/hooks/function-hooks";
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
  <t-group-block :name="$t('base.account')" icon="account-box"
    :description="$t('settings.application.list-settings.account.description')">
    <t-block-slot v-if="env.account?.user" :title="env.account?.user.username" icon="account-circle" disabled
      :description="env.account?.user.email">
      <FlatButton>
        {{ $t('base.logout') }}
      </FlatButton>
    </t-block-slot>
    <t-block-slot v-else :title="$t('base.none-account')" icon="account-circle" disabled
      :description="$t('settings.application.list-settings.account.unavailable')">
      <FlatButton @click="login">
        {{ $t('base.login') }}
      </FlatButton>
    </t-block-slot>
  </t-group-block>
</template>