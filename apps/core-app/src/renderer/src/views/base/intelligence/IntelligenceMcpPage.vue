<script lang="ts" name="IntelligenceMcpPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingMcpHost from '../settings/SettingMcpHost.vue'
import SettingMcpServers from '../settings/SettingMcpServers.vue'

/**
 * Both directions of MCP on one page: the servers Tuff talks to, then Tuff itself as a server other
 * agents talk to. Each section reads its own source, so a failure in one never blanks the other.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsIntelligenceHub.mcp')">
    <SettingMcpServers />
    <SettingMcpHost />
  </SettingsPage>
</template>
