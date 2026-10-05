<script lang="ts" name="IntelligenceMcpPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingMcpHost from '../settings/SettingMcpHost.vue'
import SettingMcpServers from '../settings/SettingMcpServers.vue'

/**
 * Both directions of MCP on one page: the servers Tuff talks to — every server this machine's
 * agents declare, plus the ones typed in by hand — and below them Tuff itself as a server other
 * agents talk to. Each section reads its own source, so a failure in one never blanks the other.
 *
 * The servers section owns the page's title row (`InsightsHeader`), the way the voice and audit
 * pages do, so the page frame carries no title of its own.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage>
    <SettingMcpServers :title="t('settingsIntelligenceHub.mcp')" />
    <SettingMcpHost />
  </SettingsPage>
</template>
