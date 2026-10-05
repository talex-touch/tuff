<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingSkills from '../settings/SettingSkills.vue'

/**
 * The skills page (the route keeps its old name, `/setting/intelligence/capabilities`): every skill
 * the agents on this machine keep, one row per real file with Tuff's own switch, and Tuff's built-in
 * skills with their channels, models and prompts.
 *
 * The list owns the page's title row (`InsightsHeader`), the way the voice, audit and MCP pages do,
 * so the page frame carries no title of its own.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage>
    <SettingSkills :title="t('settingsIntelligenceHub.capabilities')" />
  </SettingsPage>
</template>
