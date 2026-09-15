<script lang="ts" name="SettingPluginsPage" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PluginNavTree from '~/components/plugin/PluginNavTree.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
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

    <!-- The Applications category now has its own sidebar entry; this page keeps the store link. -->
    <TuffGroupBlock>
      <SettingRow
        :title="t('settingsEntries.store')"
        :description="t('settingsEntries.storeDesc')"
        navigable
        @activate="router.push('/store/installed')"
      />
    </TuffGroupBlock>

    <!--
      `PluginNavTree` is the primary way into `/plugin/:name`; it lost its sidebar slot when the
      shell collapsed to v2, so it lives here rather than being dropped.
    -->
    <TuffGroupBlock :name="t('settingsEntries.installedPlugins')">
      <div class="SettingPluginsPage-Tree">
        <PluginNavTree />
      </div>
    </TuffGroupBlock>
  </SettingsPage>
</template>

<style lang="scss" scoped>
.SettingPluginsPage-Tree {
  padding: 8px;
}
</style>
