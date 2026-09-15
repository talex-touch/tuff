<script lang="ts" name="SettingIntelligencePage" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { settingCategoryChildren } from '~/modules/settings/categories'
import { appSetting } from '~/modules/storage/app-storage'
import SettingAssistant from '../SettingAssistant.vue'
import SettingSkillsMcp from '../SettingSkillsMcp.vue'

const { t } = useI18n()
const router = useRouter()

const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))

/** Workflows and audit remain hub destinations; the other intelligence pages live in the nav. */
const subPages = computed(() =>
  settingCategoryChildren('intelligence', developerMode.value).filter((subPage) => !subPage.navIcon)
)
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.intelligence')">
    <!-- One shared group: the master switch, its floating entry, and the wake-word placeholder. -->
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
      >
        <template v-if="subPage.beta" #trailing>
          <SettingChip tone="info">{{ t('settings.platformTags.beta') }}</SettingChip>
        </template>
      </SettingRow>
    </TuffGroupBlock>
  </SettingsPage>
</template>
