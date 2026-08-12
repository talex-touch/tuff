<script lang="ts" name="SettingIntelligencePage" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSection from '~/components/settings/SettingSection.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingAssistant from '../SettingAssistant.vue'
import SettingSkillsMcp from '../SettingSkillsMcp.vue'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.intelligence')">
    <SettingAssistant mode="standard" />
    <!-- Floating ball, voice wake and wake words; inherited from the dissolved `advanced` category. -->
    <SettingAssistant mode="advanced" />

    <!-- What the home conversation can reach beyond the model: skills and MCP servers. -->
    <SettingSkillsMcp />

    <!-- Cross-link to the standalone `/intelligence` surface; the label would just repeat the page title. -->
    <SettingSection>
      <SettingRow
        :title="t('router.intelligence')"
        :description="t('settingsEntries.intelligenceDesc')"
        navigable
        @activate="router.push('/intelligence')"
      />
    </SettingSection>
  </SettingsPage>
</template>
