<script setup lang="ts" name="SettingLanguage">
import { useI18n } from 'vue-i18n'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useLanguageSettings } from '~/modules/hooks/useLanguageSettings'

const { t } = useI18n()
const { followSystem, selectedLanguage, supportedLanguages } = useLanguageSettings()
</script>

<template>
  <TuffGroupBlock
    :name="t('settingLanguage.groupTitle')"
    :description="t('settingLanguage.groupDesc')"
    default-icon="i-carbon-translate"
    active-icon="i-carbon-translate"
    memory-name="setting-language"
  >
    <TuffBlockSwitch
      v-model="followSystem"
      :title="t('settingLanguage.followSystem')"
      :description="t('settingLanguage.followSystemDesc')"
      default-icon="i-carbon-virtual-machine"
      active-icon="i-carbon-virtual-machine"
    />
    <TuffBlockSelect
      v-model="selectedLanguage"
      :disabled="followSystem"
      :title="t('settingLanguage.chooseLanguage')"
      :description="t('settingLanguage.chooseLanguageDesc')"
      default-icon="i-carbon-language"
      active-icon="i-carbon-language"
    >
      <TSelectItem v-for="lang in supportedLanguages" :key="lang.key" :value="lang.key">
        {{ lang.name }}
      </TSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>
</template>
