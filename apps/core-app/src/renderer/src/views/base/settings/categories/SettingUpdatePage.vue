<script lang="ts" name="SettingUpdatePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingUpdate from '../SettingUpdate.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.update')">
    <SettingUpdate />
  </SettingsPage>
</template>
