<script lang="ts" name="SettingIntelligencePage" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { settingCategoryChildren } from '~/modules/settings/categories'
import SettingAssistant from '../SettingAssistant.vue'
import SettingLocalAiCli from '../SettingLocalAiCli.vue'
import SettingSkillsMcp from '../SettingSkillsMcp.vue'

const { t } = useI18n()
const router = useRouter()

/** Workflows and audit remain hub destinations; the other intelligence pages live in the nav. */
const subPages = settingCategoryChildren('intelligence').filter((subPage) => !subPage.navIcon)
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.intelligence')">
    <!-- One shared group: the master switch and its floating/voice options belong together. -->
    <SettingAssistant mode="all" />

    <!-- What the home conversation can reach beyond the model: skills and MCP servers. -->
    <SettingSkillsMcp />

    <!--
      Re-homed from AppSettings.vue, which the category split removed. master added this section
      (64bc4b514) while this branch was deleting the page it lived on, so taking either side alone
      would have dropped it. Intelligence rather than General: it configures an assistant backend.
    -->
    <SettingLocalAiCli data-settings-section="local-ai-cli" />

    <!-- Workflows and audit stay together here; frequently used configuration lives in nav. -->
    <!-- No dividers between the rows: the group card draws its own hairlines between children. -->
    <TuffGroupBlock :name="t('settingsIntelligenceHub.label')">
      <SettingRow
        v-for="subPage in subPages"
        :key="subPage.key"
        :title="t(subPage.labelKey)"
        :description="t(subPage.descriptionKey)"
        navigable
        @activate="router.push(subPage.path)"
      />
    </TuffGroupBlock>
  </SettingsPage>
</template>
