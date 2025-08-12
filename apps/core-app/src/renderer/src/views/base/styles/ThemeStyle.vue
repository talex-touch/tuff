<!--
  ThemeStyle Component Template

  Displays theme and style settings in the settings page.
  Allows users to customize window styles, color themes, and other visual preferences.
-->
<template>
  <!-- Main view template for styles -->
  <ViewTemplate name="Styles">
    <!-- Window style section -->
    <WindowSectionVue tip="">
      <!-- Default window style option -->
      <SectionItem v-model="themeStyle.theme.window" tip="Click to select." title="Default">
      </SectionItem>

      <!-- Mica window style option -->
      <!-- :disabled="os?.version !== 'Windows 10 Pro'" -->
      <SectionItem
        v-model="themeStyle.theme.window"
        tip="Mica style may impact device performance."
        title="Mica"
      >
      </SectionItem>

      <!-- Filter window style option -->
      <SectionItem
        v-model="themeStyle.theme.window"
        tip="This feature only supports Windows11."
        title="Filter"
        :disabled="true"
      >
      </SectionItem>
    </WindowSectionVue>

    <!-- Personalized settings group -->
    <t-group-block name="Personalized" icon="earth" description="Personalized your app">
      <!-- Color style selection -->
      <t-block-select
        v-model="styleValue"
        title="Color Style"
        :icon="themeStyle.theme.style.dark ? 'moon' : 'lightbulb'"
        icon-change="line"
        description="Set color main style"
        @change="handleThemeChange"
      >
        <t-select-item name="light">Light Style</t-select-item>
        <t-select-item name="dark">Dark Style</t-select-item>
        <t-select-item name="auto">Follow System</t-select-item>
      </t-block-select>

      <!-- Homepage wallpaper source selection -->
      <t-block-select
        v-model="homeBgSource"
        title="Homepage Wallpaper"
        icon="image-add"
        icon-change="line"
        description="Choose the source of your homepage background wallpaper. This selection takes effect immediately."
      >
        <t-select-item name="bing">Bing</t-select-item>
        <t-select-item name="folder">Folder</t-select-item>
      </t-block-select>
    </t-group-block>

    <!-- Emphasis settings group -->
    <t-group-switch
      :expand-fill="true"
      name="Emphasis"
      icon="record-circle"
      description="Different emphasis for different people. Avoid using clear colors randomly."
    >
      <!-- Coloring switch -->
      <t-block-switch
        v-model="themeStyle.theme.addon.coloring"
        title="Coloring"
        description="As the main interface to emphasize the coloring"
        icon="contrast-drop-2"
      />

      <!-- High contrast switch -->
      <t-block-switch
        v-model="themeStyle.theme.addon.contrast"
        disabled
        title="High Contrast
        "
        description="
          Suitable for amblyopia and light sensitive contrast pattern
        "
        icon="contrast"
      />
    </t-group-switch>

    <!-- Theme help switch -->
    <t-block-switch
      guidance
      title="Theme Help"
      description="
        Find help in the official Github Discussions
      "
      icon="search-2"
    />
  </ViewTemplate>
</template>

<!--
  ThemeStyle Component Script

  Handles theme and style settings logic including theme changes and environment detection.
-->
<script name="ThemeStyle" lang="ts" setup>
// Import UI components
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSelect from '@comp/base/select/TBlockSelect.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import ViewTemplate from '@comp/base/template/ViewTemplate.vue'
import TGroupSwitch from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import WindowSectionVue from './WindowSection.vue'
import SectionItem from './SectionItem.vue'

// Import utility functions
import { useEnv } from '~/modules/hooks/env-hooks'
import { themeStyle, triggerThemeTransition } from '~/modules/storage/app-storage'

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
  console.log(useEnv())
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
