<script lang="ts" name="SettingIntelligencePage" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { settingCategoryChildren } from '~/modules/settings/categories'
import SettingAssistant from '../SettingAssistant.vue'
import SettingSkillsMcp from '../SettingSkillsMcp.vue'

const { t } = useI18n()
const router = useRouter()

/**
 * The six pages that used to sit at `/intelligence/*`. Read from the category table rather than
 * listed here, so a sub-page can never appear as a row without a route behind it.
 */
const subPages = settingCategoryChildren('intelligence')
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.intelligence')">
    <SettingAssistant mode="standard" />
    <!-- Floating ball, voice wake and wake words; inherited from the dissolved `advanced` category. -->
    <SettingAssistant mode="advanced" />

    <!-- What the home conversation can reach beyond the model: skills and MCP servers. -->
    <SettingSkillsMcp />

    <!--
      The former standalone Intelligence surface, folded in as entry rows. Its landing page did
      nothing this page does not, so the six destinations are linked directly.
    -->
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
