<script lang="ts" name="SettingFileIndexPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingFileIndex from '../SettingFileIndex.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.fileIndex')">
    <SettingFileIndex />
  </SettingsPage>
</template>
