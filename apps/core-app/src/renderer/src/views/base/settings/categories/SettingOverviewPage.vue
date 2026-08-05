<script lang="ts" name="SettingOverviewPage" setup>
import { useI18n } from 'vue-i18n'
import SettingSection from '~/components/settings/SettingSection.vue'
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

    <SettingSection :label="t('settingsOverview.account')" variant="bare">
      <SettingUser />
    </SettingSection>

    <SettingSection :label="t('settingsOverview.general')" variant="bare">
      <SettingLanguage />
    </SettingSection>
  </SettingsPage>
</template>
