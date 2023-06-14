<template>
  <ViewTemplate name="Styles">
    <WindowSectionVue tip="Use Mica style may cause performance issues on some devices.">
      <SectionItem v-model="windowPreference" title="Default" :disabled="true">

      </SectionItem>
      <SectionItem v-model="windowPreference" title="Mica" :disabled="os?.version !== 'Windows 10 Pro'">

      </SectionItem>
      <SectionItem v-model="windowPreference" title="Filter" :disabled="true">

      </SectionItem>
    </WindowSectionVue>

    <t-group-switch :name="$t('settings.appearance.theme-style.options.personalized.name')" icon="moon"
      :description="$t('settings.appearance.theme-style.options.personalized.description')">
      <t-block-switch :disabled="options.autoDark" v-model="options.dark" :title="$t('base.enable')"
        :description="$t('settings.appearance.theme-style.options.personalized.dark.description')" icon="moon" />
      <t-block-switch v-model="options.autoDark"
        :title="$t('settings.appearance.theme-style.options.personalized.dark.auto.name')"
        :description="$t('settings.appearance.theme-style.options.personalized.dark.auto.description')" icon="exchange" />
    </t-group-switch>

    <t-group-switch :expand-fill="true" :name="$t('settings.appearance.theme-style.options.emphasis.name')"
      icon="record-circle" :description="$t('settings.appearance.theme-style.options.emphasis.description')">
      <t-block-switch v-model="options.coloring"
        :title="$t('settings.appearance.theme-style.options.emphasis.coloring.name')"
        :description="$t('settings.appearance.theme-style.options.emphasis.coloring.description')"
        icon="contrast-drop-2" />
      <t-block-switch disabled v-model="options.contrast"
        :title="$t('settings.appearance.theme-style.options.emphasis.contrast.name')"
        :description="$t('settings.appearance.theme-style.options.emphasis.contrast.description')" icon="contrast" />
    </t-group-switch>

    <t-block-switch guidance :title="$t('settings.appearance.theme-style.options.help.name')"
      :description="$t('settings.appearance.theme-style.options.help.description')" icon="search-2" />

  </ViewTemplate>
</template>

<script name="ThemeStyle" setup>
import ViewTemplate from '@comp/base/template/ViewTemplate.vue'
import TGroupSwitch from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import WindowSectionVue from './WindowSection.vue'
import SectionItem from './SectionItem.vue'
import { $t } from '@modules/lang'
import { useOS } from '@modules/hooks/os-hooks'

const options = window.$storage.themeStyle
const windowPreference = ref('Mica')
const os = ref()

onMounted(() => {
  os.value = useOS()
})

</script>

<style scoped></style>