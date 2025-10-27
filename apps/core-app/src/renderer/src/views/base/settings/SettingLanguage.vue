<script setup lang="ts" name="SettingLanguage">
import { useI18n } from 'vue-i18n'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import TBlockSelect from '@comp/base/select/TBlockSelect.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import { useLanguageSettings } from '~/modules/hooks/useLanguageSettings'

const { t } = useI18n()
const { followSystem, selectedLanguage, supportedLanguages } = useLanguageSettings()
</script>

<template>
  <t-group-block
    :name="t('settingLanguage.groupTitle')"
    icon="earth"
    :description="t('settingLanguage.groupDesc')"
  >
    <t-block-switch
      v-model="followSystem"
      :title="t('settingLanguage.followSystem')"
      icon="exchange"
      :description="t('settingLanguage.followSystemDesc')"
    />
    <t-block-select
      v-model="selectedLanguage"
      :disabled="followSystem"
      :title="t('settingLanguage.chooseLanguage')"
      icon="goblet"
      :description="t('settingLanguage.chooseLanguageDesc')"
    >
      <t-select-item v-for="lang in supportedLanguages" :key="lang.key" :value="lang.key">
        {{ lang.name }}
      </t-select-item>
    </t-block-select>
  </t-group-block>
</template>
