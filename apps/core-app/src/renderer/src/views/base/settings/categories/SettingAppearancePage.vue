<script lang="ts" name="SettingAppearancePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import ThemeStyle from '~/views/base/styles/ThemeStyle.vue'

/**
 * `ThemeStyle` used to be mounted full-bleed because it is a complete page with its own heading
 * and scroller, which left appearance as the one category with no page title. `embedded` drops
 * that inner chrome so this body reads like every other one.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.appearance')">
    <ThemeStyle embedded />
  </SettingsPage>
</template>
