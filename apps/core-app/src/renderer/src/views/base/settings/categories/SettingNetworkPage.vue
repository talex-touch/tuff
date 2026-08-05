<script lang="ts" name="SettingNetworkPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingNetwork from '../SettingNetwork.vue'

/**
 * Full network settings: proxy plus the shared request policy. Previously the proxy half lived
 * on the dissolved `advanced` category while update and download settings occupied this page.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.network')">
    <SettingNetwork />
  </SettingsPage>
</template>
