<script lang="ts" name="SettingDownloadPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingDownload from '../SettingDownload.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.download')">
    <SettingDownload />
  </SettingsPage>
</template>
