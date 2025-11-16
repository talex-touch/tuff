<script setup lang="ts" name="SettingLanguage">
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import { useLanguageSettings } from '~/modules/hooks/useLanguageSettings'

const { t } = useI18n()
const { followSystem, selectedLanguage, supportedLanguages } = useLanguageSettings()
</script>

<template>
  <tuff-group-block
    :name="t('settingLanguage.groupTitle')"
    :description="t('settingLanguage.groupDesc')"
    default-icon="i-carbon-translate"
    active-icon="i-carbon-translate"
    memory-name="setting-language"
  >
    <tuff-block-switch
      v-model="followSystem"
      :title="t('settingLanguage.followSystem')"
      :description="t('settingLanguage.followSystemDesc')"
      default-icon="i-carbon-virtual-machine"
      active-icon="i-carbon-virtual-machine"
    />
    <tuff-block-select
      v-model="selectedLanguage"
      :disabled="followSystem"
      :title="t('settingLanguage.chooseLanguage')"
      :description="t('settingLanguage.chooseLanguageDesc')"
      default-icon="i-carbon-language"
      active-icon="i-carbon-language"
    >
      <t-select-item v-for="lang in supportedLanguages" :key="lang.key" :value="lang.key">
        {{ lang.name }}
      </t-select-item>
    </tuff-block-select>
  </tuff-group-block>
</template>
