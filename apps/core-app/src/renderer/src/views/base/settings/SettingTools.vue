<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'

// Import UI components
import TBlockSlot from '@comp/base/group/TBlockSlot.vue'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'
import TBlockSelect from '~/components/base/select/TBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
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
</script>

<!--
  SettingTools Component Template

  Displays utility settings in a structured layout with switches, slots, and selects.
-->
<template>
  <!-- Utilities group block -->
  <t-group-block
    :name="t('settingTools.groupTitle')"
    icon="suitcase"
    :description="t('settingTools.groupDesc')"
  >
    <!-- Beginner usage guide switch -->
    <t-block-switch
      v-model="appSetting.beginner.init"
      :title="t('settingTools.usage')"
      icon="book-2"
      :description="t('settingTools.usageDesc')"
    />

    <!-- Shortcut key configuration slot -->
    <template v-if="shortcuts">
      <t-block-slot
        v-for="shortcut in shortcuts"
        :key="shortcut.id"
        :title="shortcut.id"
        icon="keyboard"
        :description="t('settingTools.shortcutDesc', { shortcut: shortcut.id })"
      >
        <flat-key-input
          :model-value="shortcut.accelerator"
          @update:model-value="(newValue) => updateShortcut(shortcut.id, String(newValue))"
        />
      </t-block-slot>
    </template>

    <!-- Auto paste time selection -->
    <t-block-select
      v-model="appSetting.tools.autoPaste.time"
      :title="t('settingTools.autoPaste')"
      icon="checkbox-multiple-blank"
      :description="t('settingTools.autoPasteDesc')"
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
    </t-block-select>

    <!-- Auto clear time selection -->
    <t-block-select
      v-model="appSetting.tools.autoClear"
      :title="t('settingTools.autoClear')"
      icon="format"
      icon-change="clear"
      :description="t('settingTools.autoClearDesc')"
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
    </t-block-select>

    <!-- Auto hide switch -->
    <t-block-switch
      v-model="appSetting.tools.autoHide"
      :title="t('settingTools.autoHide')"
      icon="search-eye"
      :description="t('settingTools.autoHideDesc')"
    />
  </t-group-block>
</template>