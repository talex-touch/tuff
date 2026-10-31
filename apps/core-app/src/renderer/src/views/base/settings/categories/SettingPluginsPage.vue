<script lang="ts" name="SettingPluginsPage" setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PluginNavTree from '~/components/plugin/PluginNavTree.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  SETTINGS_PANEL_QUERY,
  SHORTCUTS_SETTINGS_PANEL
} from '../../../../../../shared/app-destinations'
import SettingTools from '../SettingTools.vue'

/**
 * New home for the entries that left the sidebar when the shell collapsed to the v2 design:
 * the application index and the plugin tree that `App.vue` used to pass through `#plugins`.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tools = ref<InstanceType<typeof SettingTools> | null>(null)

/**
 * `?panel=shortcuts` is CoreBox's 「快捷键」 result: open the manager and drop the query, so a
 * reload or a later visit to this page does not open it again. The same query reaches this page
 * under `/setting/plugins` and inside the Browser workspace's settings tab.
 */
watch(
  () => route.query[SETTINGS_PANEL_QUERY],
  async (panel) => {
    if (panel !== SHORTCUTS_SETTINGS_PANEL) return
    await nextTick()
    tools.value?.openShortcuts()
    const { [SETTINGS_PANEL_QUERY]: _opened, ...rest } = route.query
    void router.replace({ query: rest })
  },
  { immediate: true }
)
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.plugins')">
    <!--
      Both halves of the tools UI: the standard block plus the advanced one inherited from the
      dissolved `advanced` category. `SettingTools` renders them mutually exclusively.
    -->
    <SettingTools ref="tools" />
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
