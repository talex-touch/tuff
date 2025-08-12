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

// Define component props
interface Props {
  env: any
}

defineProps<Props>()

// Reactive reference for shortcut key binding
const key = ref(appSetting.keyBind.summon)

// Watch for changes to the shortcut key and update settings
watch(
  () => key.value,
  (val) => {
    // Register the new shortcut key with the API
    const res = window.$shortconApi.regKey(val, () => {
      console.log('Shortcut triggered:', val)
    })

    console.log(res)

    // Update the application settings with the new shortcut
    appSetting.keyBind.summon = val
  }
)
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
    <t-block-slot
      title="Shortcon"
      icon="keyboard"
      description="Define your own shortcut and use it anywhere."
    >
      <flat-key-input v-model="key" />
    </t-block-slot>

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
