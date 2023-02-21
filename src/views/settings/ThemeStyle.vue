<template>
  <t-group-switch :expand-fill="true" :name="$t('settings.appearance.theme-style.options.name')" icon="t-shirt" :description="$t('settings.appearance.theme-style.options.description')">
<!--    <t-block-switch v-model="options.dark" title="暗黑模式" description="为应用整体映射暗色风格" icon="moon">-->
      <t-group-switch :name="$t('settings.appearance.theme-style.options.personalized.name')" icon="moon" :description="$t('settings.appearance.theme-style.options.personalized.description')">
        <t-block-switch :disabled="options.autoDark" v-model="options.dark" :title="$t('base.enable')" :description="$t('settings.appearance.theme-style.options.personalized.dark.description')" icon="moon" />
        <t-block-switch v-model="options.autoDark" :title="$t('settings.appearance.theme-style.options.personalized.dark.auto.name')" :description="$t('settings.appearance.theme-style.options.personalized.dark.auto.description')" icon="exchange" />
      </t-group-switch>
<!--    </t-block-switch>-->
    <t-block-switch v-model="options.blur" :title="$t('settings.appearance.theme-style.options.personalized.transparent-engine.name')" :description="$t('settings.appearance.theme-style.options.personalized.transparent-engine.description')" icon="drop"></t-block-switch>
  </t-group-switch>

  <t-group-switch :expand-fill="true" :name="$t('settings.appearance.theme-style.options.emphasis.name')" icon="record-circle" :description="$t('settings.appearance.theme-style.options.emphasis.description')">
    <t-block-switch v-model="options.coloring" :title="$t('settings.appearance.theme-style.options.emphasis.coloring.name')" :description="$t('settings.appearance.theme-style.options.emphasis.coloring.description')" icon="contrast-drop-2" />
    <t-block-switch disabled v-model="options.contrast" :title="$t('settings.appearance.theme-style.options.emphasis.contrast.name')" :description="$t('settings.appearance.theme-style.options.emphasis.contrast.description')" icon="contrast" />
  </t-group-switch>

  <t-block-switch guidance :title="$t('settings.appearance.theme-style.options.help.name')" :description="$t('settings.appearance.theme-style.options.help.description')" icon="search-2" />
</template>

<script>
export default {
  name: "ThemeStyle"
}
</script>

<script setup>
import TGroupSwitch from '@comp/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/switch/TBlockSwitch.vue'
import { $t } from '@modules/lang'

const options = window.$storage.themeStyle

</script>

<style scoped>

</style>