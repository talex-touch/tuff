<script lang="ts" name="SettingOverviewPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingIdentityCard from '../SettingIdentityCard.vue'
import SettingLanguage from '../SettingLanguage.vue'
import SettingUser from '../SettingUser.vue'

/**
 * The AI credits section from artboard `iqbKR` is intentionally absent here — it lands in
 * 08-04-settings-rewrite together with the row-level rewrite of the mounted components.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.overview')">
    <SettingIdentityCard />

    <!--
      Both mounted components are group blocks that already carry their own label and card, so
      they sit here unwrapped: a section wrapper would have printed a second heading above them.
    -->
    <SettingUser />
    <SettingLanguage />
  </SettingsPage>
</template>
