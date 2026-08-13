<script lang="ts" name="SettingGeneralPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingSetup from '../SettingSetup.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.general')">
    <SettingSetup />
  </SettingsPage>
</template>
