<script lang="ts" name="SettingGeneralPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingSentry from '../SettingSentry.vue'
import SettingSetup from '../SettingSetup.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.general')">
    <SettingSetup />
    <!--
      Telemetry consent lives on a default-visible page on purpose. The previous group was only
      reachable behind the advanced flag and was then deleted outright in the app-shell-v2 rewrite
      (2026-08-12), so for two months the upload switch had no surface at all; the Storage category
      would have repeated that mistake, since it is `advanced` and refuses direct links.
    -->
    <SettingSentry />
  </SettingsPage>
</template>
