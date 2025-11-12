<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingTools">
import { useI18n } from 'vue-i18n'

// Import UI components
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'

// Import application settings
import { appSetting } from '~/modules/channel/storage'
import { onMounted, ref } from 'vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'

// Define component props

const { t } = useI18n()

// Reactive reference for shortcut key binding
const shortcuts = ref<Shortcut[] | null>(null)

onMounted(async () => {
  shortcuts.value = await shortconApi.getAll()
})

function updateShortcut(id: string, newAccelerator: string): void {
  if (!id || !newAccelerator) return
  shortconApi.update(id, newAccelerator)
}

function getShortcutLabel(id: string): string {
  const normalized = id.replace(/[\.\-]/g, '_')
  const key = `settingTools.shortcutLabels.${normalized}`
  const translated = t(key)
  return translated === key ? id : translated
}
</script>

<!--
  SettingTools Component Template

  Displays utility settings in a structured layout with switches, slots, and selects.
-->
<template>
  <!-- Utilities group block -->
  <tuff-group-block
    :name="t('settingTools.groupTitle')"
    :description="t('settingTools.groupDesc')"
    default-icon="i-carbon-app-switcher"
    active-icon="i-carbon-application"
    memory-name="setting-tools"
  >
    <!-- Beginner usage guide switch -->
    <tuff-block-switch
      v-model="appSetting.beginner.init"
      :title="t('settingTools.usage')"
      :description="t('settingTools.usageDesc')"
      default-icon="i-carbon-book"
      active-icon="i-carbon-book"
    />

    <!-- Shortcut key configuration slot -->
    <template v-if="shortcuts">
      <tuff-block-slot
        v-for="shortcut in shortcuts"
        :key="shortcut.id"
        :title="getShortcutLabel(shortcut.id)"
        :description="t('settingTools.shortcutDesc', { shortcut: getShortcutLabel(shortcut.id) })"
        default-icon="i-carbon-keyboard"
        active-icon="i-carbon-keyboard"
      >
        <flat-key-input
          :model-value="shortcut.accelerator"
          @update:model-value="(newValue) => updateShortcut(shortcut.id, String(newValue))"
        />
      </tuff-block-slot>
    </template>

    <!-- Auto paste time selection -->
    <tuff-block-select
      v-model="appSetting.tools.autoPaste.time"
      :title="t('settingTools.autoPaste')"
      :description="t('settingTools.autoPasteDesc')"
      default-icon="i-carbon-copy"
      active-icon="i-carbon-copy"
    >
      <t-select-item :model-value="-1">{{ t('settingTools.disabled') }}</t-select-item>
      <t-select-item :model-value="0">{{ t('settingTools.noLimit') }}</t-select-item>
      <t-select-item :model-value="15">15 {{ t('settingTools.sec') }}</t-select-item>
      <t-select-item :model-value="30">30 {{ t('settingTools.sec') }}</t-select-item>
      <t-select-item :model-value="60">1 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="180">3 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="300">5 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="600">10 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="750">15 {{ t('settingTools.min') }}</t-select-item>
    </tuff-block-select>

    <!-- Auto clear time selection -->
    <tuff-block-select
      v-model="appSetting.tools.autoClear"
      :title="t('settingTools.autoClear')"
      :description="t('settingTools.autoClearDesc')"
      default-icon="i-carbon-erase"
      active-icon="i-carbon-erase"
    >
      <t-select-item :model-value="-1">{{ t('settingTools.disabled') }}</t-select-item>
      <t-select-item :model-value="0">{{ t('settingTools.noLimit') }}</t-select-item>
      <t-select-item :model-value="15">15 {{ t('settingTools.sec') }}</t-select-item>
      <t-select-item :model-value="30">30 {{ t('settingTools.sec') }}</t-select-item>
      <t-select-item :model-value="60">1 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="180">3 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="300">5 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="600">10 {{ t('settingTools.min') }}</t-select-item>
      <t-select-item :model-value="750">15 {{ t('settingTools.min') }}</t-select-item>
    </tuff-block-select>

    <!-- Auto hide switch -->
    <tuff-block-switch
      v-model="appSetting.tools.autoHide"
      :title="t('settingTools.autoHide')"
      :description="t('settingTools.autoHideDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
    />

    <!-- Dashboard switch -->
    <tuff-block-switch
      v-model="appSetting.dashboard.enable"
      :title="t('settingTools.dashboard')"
      :description="t('settingTools.dashboardDesc')"
      default-icon="i-carbon-dashboard"
      active-icon="i-carbon-dashboard"
    />

    <!-- Search Engine Logs switch -->
    <tuff-block-switch
      v-model="appSetting.searchEngine.logsEnabled"
      :title="t('settingTools.searchEngineLogs')"
      :description="t('settingTools.searchEngineLogsDesc')"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
    />
  </tuff-group-block>
</template>
