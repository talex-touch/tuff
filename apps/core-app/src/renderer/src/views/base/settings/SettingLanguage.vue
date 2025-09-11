<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import TBlockSelect from '@comp/base/select/TBlockSelect.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import { appSetting } from '~/modules/channel/storage'
import { useLanguage, SUPPORTED_LANGUAGES } from '~/modules/lang'

const { t } = useI18n()
const { currentLanguage } = useLanguage()
const options = appSetting

defineProps({
  env: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <t-group-block
    :name="t('settingLanguage.groupTitle')"
    icon="earth"
    :description="t('settingLanguage.groupDesc')"
  >
    <t-block-switch
      v-model="options.lang.followSystem"
      :title="t('settingLanguage.followSystem')"
      icon="exchange"
      :description="t('settingLanguage.followSystemDesc')"
    />
    <t-block-select
      :disabled="options.lang?.followSystem"
      v-model="currentLanguage"
      :title="t('settingLanguage.chooseLanguage')"
      icon="goblet"
      :description="t('settingLanguage.chooseLanguageDesc')"
    >
      <t-select-item v-for="lang in SUPPORTED_LANGUAGES" :key="lang.key" :value="lang.key">
        {{ lang.name }}
      </t-select-item>
    </t-block-select>
  </t-group-block>
</template>