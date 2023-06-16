<template>
  <ViewTemplate name="Styles">
    <WindowSectionVue tip="Use Mica style may cause performance issues on some devices.">
      <SectionItem v-model="themeStyle.theme.window" title="Default" :disabled="true">

      </SectionItem>
      <SectionItem v-model="themeStyle.theme.window" title="Mica" :disabled="os?.version !== 'Windows 10 Pro'">

      </SectionItem>
      <SectionItem v-model="themeStyle.theme.window" title="Filter" :disabled="true">

      </SectionItem>
    </WindowSectionVue>

    <t-group-block name="Personalized" icon="earth" description="Personalized your app">
      <t-block-select @change="handleThemeChange" v-model="stylePreference" title="Color Style"
        :icon="themeStyle.theme.style.dark ? 'moon' : 'lightbulb'" description="Set color main style">
        <t-select-item name="Light">Light Style</t-select-item>
        <t-select-item name="Dark">Dark Style</t-select-item>
        <t-select-item name="Follow">Follow System</t-select-item>
      </t-block-select>
    </t-group-block>

    <t-group-switch :expand-fill="true" :name="$t('settings.appearance.theme-style.options.emphasis.name')"
      icon="record-circle" :description="$t('settings.appearance.theme-style.options.emphasis.description')">
      <t-block-switch v-model="themeStyle.theme.addon.coloring"
        :title="$t('settings.appearance.theme-style.options.emphasis.coloring.name')"
        :description="$t('settings.appearance.theme-style.options.emphasis.coloring.description')"
        icon="contrast-drop-2" />
      <t-block-switch disabled v-model="themeStyle.theme.addon.contrast"
        :title="$t('settings.appearance.theme-style.options.emphasis.contrast.name')"
        :description="$t('settings.appearance.theme-style.options.emphasis.contrast.description')" icon="contrast" />
    </t-group-switch>

    <t-block-switch guidance :title="$t('settings.appearance.theme-style.options.help.name')"
      :description="$t('settings.appearance.theme-style.options.help.description')" icon="search-2" />

  </ViewTemplate>
</template>

<script name="ThemeStyle" lang="ts" setup>
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSelect from '@comp/base/select/TBlockSelect.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import ViewTemplate from '@comp/base/template/ViewTemplate.vue'
import TGroupSwitch from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import WindowSectionVue from './WindowSection.vue'
import SectionItem from './SectionItem.vue'
import { $t } from '@modules/lang'
import { useOS } from '@modules/hooks/os-hooks'
import { themeStyle } from '@modules/storage/AppStorage'

const os = ref()
const stylePreference = ref(themeStyle.value.theme.style.auto ? 2 : themeStyle.value.theme.style.dark ? 1 : 0)

function handleThemeChange() {
  if (stylePreference.value === 0) {
    themeStyle.value.theme.style.dark = false
  } else if (stylePreference.value === 1) {
    themeStyle.value.theme.style.dark = true
  }

  themeStyle.value.theme.style.auto = stylePreference.value === 2
}

onMounted(() => {
  os.value = useOS()
})

</script>

<style scoped></style>