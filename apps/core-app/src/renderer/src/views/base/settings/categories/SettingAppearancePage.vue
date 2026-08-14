<script lang="ts" name="SettingAppearancePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import ThemeStyle from '~/views/base/styles/ThemeStyle.vue'

/**
 * The only mount of `ThemeStyle`. It used to carry its own `ViewTemplate` for the standalone
 * `/styles` route, behind an `embedded` prop this page set to drop that chrome; `/styles` is now
 * a redirect here, so the branch is gone and the component renders one way (#1024).
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.appearance')">
    <ThemeStyle embedded />
  </SettingsPage>
</template>
