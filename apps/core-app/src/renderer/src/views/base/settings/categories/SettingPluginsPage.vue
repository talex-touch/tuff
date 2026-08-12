<script lang="ts" name="SettingPluginsPage" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PluginNavTree from '~/components/plugin/PluginNavTree.vue'
import SettingDivider from '~/components/settings/SettingDivider.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSection from '~/components/settings/SettingSection.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import SettingTools from '../SettingTools.vue'

/**
 * New home for the entries that left the sidebar when the shell collapsed to the v2 design:
 * the application index and the plugin tree that `App.vue` used to pass through `#plugins`.
 */
const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.plugins')">
    <!--
      Both halves of the tools UI: the standard block plus the advanced one inherited from the
      dissolved `advanced` category. `SettingTools` renders them mutually exclusively.
    -->
    <SettingTools />
    <SettingTools advanced-only />

    <!--
      Cross-links to other surfaces, not a transit page: `/application` and `/store/installed`
      have no other entry point since the sidebar collapsed to v2. The former "Entries" heading
      is dropped so the page reads as content rather than a menu.
    -->
    <SettingSection>
      <SettingRow
        :title="t('settingsEntries.application')"
        :description="t('settingsEntries.applicationDesc')"
        navigable
        @activate="router.push('/application')"
      />
      <SettingDivider />
      <SettingRow
        :title="t('settingsEntries.store')"
        :description="t('settingsEntries.storeDesc')"
        navigable
        @activate="router.push('/store/installed')"
      />
    </SettingSection>

    <!--
      `PluginNavTree` is the primary way into `/plugin/:name`; it lost its sidebar slot when the
      shell collapsed to v2, so it lives here rather than being dropped.
    -->
    <SettingSection :label="t('settingsEntries.installedPlugins')">
      <div class="SettingPluginsPage-Tree">
        <PluginNavTree />
      </div>
    </SettingSection>
  </SettingsPage>
</template>

<style lang="scss" scoped>
.SettingPluginsPage-Tree {
  padding: 8px;
}
</style>
