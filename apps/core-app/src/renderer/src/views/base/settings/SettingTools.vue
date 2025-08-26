<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingUser">
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
interface Props {
  env: any
}

defineProps<Props>()

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
    name="Utilities"
    icon="suitcase"
    description="Practical tools provide a unified fast desktop arbitrary promoter for you to use."
  >
    <!-- Beginner usage guide switch -->
    <t-block-switch
      v-model="appSetting.beginner.init"
      title="Usage"
      icon="book-2"
      description="Guide you to use app when enter."
    />

    <!-- Shortcut key configuration slot -->
    <template v-if="shortcuts">
      <t-block-slot
        v-for="shortcut in shortcuts"
        :key="shortcut.id"
        :title="shortcut.id"
        icon="keyboard"
        :description="`Define shortcut for ${shortcut.id}`"
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
      title="Auto paste"
      icon="checkbox-multiple-blank"
      description="Paste what you copied in searchbar."
    >
      <t-select-item :model-value="-1">Disabled</t-select-item>
      <t-select-item :model-value="0">No limit</t-select-item>
      <t-select-item :model-value="15">15 sec</t-select-item>
      <t-select-item :model-value="30">30 sec</t-select-item>
      <t-select-item :model-value="60">1 min</t-select-item>
      <t-select-item :model-value="180">3 min</t-select-item>
      <t-select-item :model-value="300">5 min</t-select-item>
      <t-select-item :model-value="600">10 min</t-select-item>
      <t-select-item :model-value="750">15 min</t-select-item>
    </t-block-select>

    <!-- Auto clear time selection -->
    <t-block-select
      v-model="appSetting.tools.autoClear"
      title="Auto clear"
      icon="format"
      icon-change="clear"
      description="Clear searchbar after box hidden."
    >
      <t-select-item :model-value="-1">Disabled</t-select-item>
      <t-select-item :model-value="0">No limit</t-select-item>
      <t-select-item :model-value="15">15 sec</t-select-item>
      <t-select-item :model-value="30">30 sec</t-select-item>
      <t-select-item :model-value="60">1 min</t-select-item>
      <t-select-item :model-value="180">3 min</t-select-item>
      <t-select-item :model-value="300">5 min</t-select-item>
      <t-select-item :model-value="600">10 min</t-select-item>
      <t-select-item :model-value="750">15 min</t-select-item>
    </t-block-select>

    <!-- Auto hide switch -->
    <t-block-switch
      v-model="appSetting.tools.autoHide"
      title="Auto hide"
      icon="search-eye"
      description="Hide searchbar when blur triggered."
    />
  </t-group-block>
</template>