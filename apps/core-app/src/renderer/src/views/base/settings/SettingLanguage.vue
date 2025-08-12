<script setup lang="ts" name="SettingUser">
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import TBlockSwitch from "@comp/base/switch/TBlockSwitch.vue";
import TBlockSelect from "@comp/base/select/TBlockSelect.vue";
import TSelectItem from "@comp/base/select/TSelectItem.vue";
import { appSetting } from '~/modules/channel/storage';

const options = appSetting;

defineProps({
  env: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <t-group-block name="Language Settings" icon="earth"
    description="Select your preferred language for the application.">
    <t-block-switch v-model="options.lang.followSystem" title="Follow System Language" icon="exchange"
      description="Automatically match the system language setting." />
    <t-block-select :disabled="options.lang?.followSystem" v-model="options.lang.locale" title="Choose Language"
      icon="goblet" description="Manually select your preferred display language.">
      <t-select-item v-for="lang in [{ name: 'en-US' }]">{{ lang.name }}</t-select-item>
    </t-block-select>
  </t-group-block>
</template>
