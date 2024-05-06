<script setup lang="ts" name="SettingUser">
import { $t, languages } from "~/modules/lang";
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import TBlockSwitch from "@comp/base/switch/TBlockSwitch.vue";
import TBlockSelect from "@comp/base/select/TBlockSelect.vue";
import TSelectItem from "@comp/base/select/TSelectItem.vue";

const options = window.$storage.appSetting;

defineProps({
  env: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <t-group-block
    :name="$t('settings.application.list-settings.language.name')"
    icon="earth"
    :description="$t('settings.application.list-settings.language.description')"
  >
    <t-block-switch
      v-model="options.lang.followSystem"
      :title="$t('settings.application.list-settings.language.system')"
      icon="exchange"
      :description="$t('settings.application.list-settings.language.description')"
    />
    <t-block-select
      :disabled="options.lang?.followSystem"
      v-model="options.lang.locale"
      :title="$t('settings.application.list-settings.language.select.name')"
      icon="goblet"
      :description="$t('settings.application.list-settings.language.select.description')"
    >
      <t-select-item v-for="lang in languages">{{ lang.name }}</t-select-item>
    </t-block-select>
  </t-group-block>
</template>
