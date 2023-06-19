<template>
  <ViewTemplate name="Styles">
    <WindowSectionVue tip="Use Mica style may cause performance issues on some devices.">
      <SectionItem v-model="themeStyle.theme.window" title="Default">

      </SectionItem>
      <SectionItem v-model="themeStyle.theme.window" title="Mica" :disabled="os?.version !== 'Windows 10 Pro'">

      </SectionItem>
      <SectionItem v-model="themeStyle.theme.window" title="Filter" :disabled="true">

      </SectionItem>
    </WindowSectionVue>

    <t-group-block name="Personalized" icon="earth" description="Personalized your app">
      <t-block-select @change="handleThemeChange" v-model="styleValue" title="Color Style"
        :icon="themeStyle.theme.style.dark ? 'moon' : 'lightbulb'" description="Set color main style">
        <t-select-item name="light">Light Style</t-select-item>
        <t-select-item name="dark">Dark Style</t-select-item>
        <t-select-item name="auto">Follow System</t-select-item>
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
import { useEnv } from '@modules/hooks/env-hooks'
import { themeStyle, triggerThemeTransition } from '@modules/storage/AppStorage'

const os = ref()
const styleValue = ref(0)

watchEffect(() => {
  if (themeStyle.value.theme.style.auto)
    styleValue.value = 2
  else if (themeStyle.value.theme.style.dark)
    styleValue.value = 1
  else styleValue.value = 0
})

function handleThemeChange(v: string, e: MouseEvent) {
  triggerThemeTransition([e.x, e.y], v)
}

onMounted(() => {
  os.value = useEnv().os
})

</script>

<style>
.Mica {
  filter: blur(16px) saturate(180%) brightness(1.25);
}

.Default {
  filter: saturate(180%);
}

.Filter {
  filter: blur(5px) saturate(180%)
}
</style>