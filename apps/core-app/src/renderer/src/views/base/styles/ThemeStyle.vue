<!--
  ThemeStyle Component Template

  Displays theme and style settings in the settings page.
  Allows users to customize window styles, color themes, and other visual preferences.
-->
<template>
  <!-- Main view template for styles -->
  <ViewTemplate :name="t('themeStyle.styles')">
    <!-- Window style section -->
    <WindowSectionVue tip="">
      <!-- Default window style option -->
      <SectionItem
        v-model="themeStyle.theme.window"
        :tip="t('themeStyle.defaultTip')"
        title="Default"
      >
      </SectionItem>

      <!-- Mica window style option -->
      <!-- :disabled="os?.version !== 'Windows 10 Pro'" -->
      <SectionItem v-model="themeStyle.theme.window" :tip="t('themeStyle.micaTip')" title="Mica">
      </SectionItem>

      <!-- Filter window style option -->
      <SectionItem
        v-model="themeStyle.theme.window"
        :tip="t('themeStyle.filterTip')"
        title="Filter"
        :disabled="true"
      >
      </SectionItem>
    </WindowSectionVue>

    <!-- Layout selection section -->
    <LayoutSection />

    <!-- Personalized settings group -->
    <t-group-block
      :name="t('themeStyle.personalized')"
      icon="earth"
      :description="t('themeStyle.personalizedDesc')"
    >
      <!-- Color style selection -->
      <t-block-select
        v-model="styleValue"
        :title="t('themeStyle.colorStyle')"
        :icon="themeStyle.theme.style.dark ? 'moon' : 'lightbulb'"
        icon-change="line"
        :description="t('themeStyle.colorStyleDesc')"
        @change="handleThemeChange"
      >
        <t-select-item name="light">{{ t('themeStyle.lightStyle') }}</t-select-item>
        <t-select-item name="dark">{{ t('themeStyle.darkStyle') }}</t-select-item>
        <t-select-item name="auto">{{ t('themeStyle.followSystem') }}</t-select-item>
      </t-block-select>

      <!-- Homepage wallpaper source selection -->
      <t-block-select
        v-model="homeBgSource"
        :title="t('themeStyle.homepageWallpaper')"
        icon="image-add"
        icon-change="line"
        :description="t('themeStyle.homepageWallpaperDesc')"
      >
        <t-select-item name="bing">{{ t('themeStyle.bing') }}</t-select-item>
        <t-select-item name="folder">{{ t('themeStyle.folder') }}</t-select-item>
      </t-block-select>
    </t-group-block>

    <!-- Emphasis settings group -->
    <t-group-switch
      :expand-fill="true"
      :name="t('themeStyle.emphasis')"
      icon="record-circle"
      :description="t('themeStyle.emphasisDesc')"
    >
      <!-- Coloring switch -->
      <t-block-switch
        v-model="themeStyle.theme.addon.coloring"
        :title="t('themeStyle.coloring')"
        :description="t('themeStyle.coloringDesc')"
        icon="contrast-drop-2"
      />

      <!-- High contrast switch -->
      <t-block-switch
        v-model="themeStyle.theme.addon.contrast"
        disabled
        :title="t('themeStyle.highContrast')"
        :description="t('themeStyle.highContrastDesc')"
        icon="contrast"
      />
    </t-group-switch>

    <!-- Theme help switch -->
    <t-block-switch
      guidance
      :title="t('themeStyle.themeHelp')"
      :description="t('themeStyle.themeHelpDesc')"
      icon="search-2"
    />
  </ViewTemplate>
</template>

<!--
  ThemeStyle Component Script

  Handles theme and style settings logic including theme changes and environment detection.
-->
<script name="ThemeStyle" lang="ts" setup>
import { useI18n } from 'vue-i18n'

// Import UI components
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSelect from '@comp/base/select/TBlockSelect.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import ViewTemplate from '@comp/base/template/ViewTemplate.vue'
import TGroupSwitch from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import WindowSectionVue from './WindowSection.vue'
import SectionItem from './SectionItem.vue'
import LayoutSection from './LayoutSection.vue'

// Import utility functions
import { useEnv } from '~/modules/hooks/env-hooks'
import { themeStyle, triggerThemeTransition } from '~/modules/storage/app-storage'

const { t } = useI18n()

// Reactive references
const os = ref()
const styleValue = ref(0)
const homeBgSource = ref(0)

// Watch for theme style changes and update the style value accordingly
watchEffect(() => {
  if (themeStyle.value.theme.style.auto) styleValue.value = 2
  else if (themeStyle.value.theme.style.dark) styleValue.value = 1
  else styleValue.value = 0
})

/**
 * Handle theme change event
 * Triggers a theme transition with animation
 * @param v - The new theme value
 * @param e - The mouse event triggering the change
 * @returns void
 */
function handleThemeChange(v: string, e: MouseEvent): void {
  triggerThemeTransition([e.x, e.y], v as any)
}

// Lifecycle hook to initialize component
onMounted(async () => {
  os.value = useEnv().os
})
</script>

<!--
  ThemeStyle Component Styles

  CSS styles for different window themes and effects.
-->
<style>
/** Mica theme styles */
.Mica {
  filter: blur(16px) saturate(180%) brightness(1.125);
}

/** Default theme styles */
.Default {
  filter: saturate(180%);
}

/** Filter theme styles */
.Filter {
  filter: blur(5px) saturate(180%);
}
</style>
