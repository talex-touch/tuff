<!--
  ThemeStyle Component Template

  Displays theme and style settings in the settings page.
  Allows users to customize window styles, color themes, and other visual preferences.
-->
<template>
  <ViewTemplate :name="t('themeStyle.styles')">
    <WindowSectionVue tip="">
      <SectionItem
        v-model="themeStyle.theme.window"
        :tip="t('themeStyle.defaultTip')"
        title="Default"
      />
      <SectionItem v-model="themeStyle.theme.window" :tip="t('themeStyle.micaTip')" title="Mica" />
      <SectionItem
        v-model="themeStyle.theme.window"
        :tip="t('themeStyle.filterTip')"
        title="Filter"
        :disabled="true"
      />
    </WindowSectionVue>

    <LayoutSection />

    <tuff-group-block
      :name="t('themeStyle.personalized')"
      :description="t('themeStyle.personalizedDesc')"
      memory-name="theme-style-personalized"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="personalized" :active="active" />
      </template>
      <tuff-block-select
        v-model="styleValue"
        :title="t('themeStyle.colorStyle')"
        :description="t('themeStyle.colorStyleDesc')"
        @change="handleThemeChange"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="palette" :active="active" />
        </template>
        <t-select-item :model-value="0" name="light">{{ t('themeStyle.lightStyle') }}</t-select-item>
        <t-select-item :model-value="1" name="dark">{{ t('themeStyle.darkStyle') }}</t-select-item>
        <t-select-item :model-value="2" name="auto">{{ t('themeStyle.followSystem') }}</t-select-item>
      </tuff-block-select>

      <tuff-block-select
        v-model="homeBgSource"
        :title="t('themeStyle.homepageWallpaper')"
        :description="t('themeStyle.homepageWallpaperDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="wallpaper" :active="active" />
        </template>
        <t-select-item :model-value="0" name="bing">{{ t('themeStyle.bing') }}</t-select-item>
        <t-select-item :model-value="1" name="folder">{{ t('themeStyle.folder') }}</t-select-item>
      </tuff-block-select>
    </tuff-group-block>

    <tuff-group-block
      :name="t('themeStyle.emphasis')"
      :description="t('themeStyle.emphasisDesc')"
      memory-name="theme-style-emphasis"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="emphasis" :active="active" />
      </template>
      <tuff-block-switch
        v-model="themeStyle.theme.addon.coloring"
        :title="t('themeStyle.coloring')"
        :description="t('themeStyle.coloringDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="coloring" :active="active" />
        </template>
      </tuff-block-switch>

      <tuff-block-switch
        v-model="themeStyle.theme.addon.contrast"
        :title="t('themeStyle.highContrast')"
        :description="t('themeStyle.highContrastDesc')"
        disabled
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="contrast" :active="active" />
        </template>
      </tuff-block-switch>
    </tuff-group-block>

    <tuff-block-switch
      guidance
      :model-value="false"
      :title="t('themeStyle.themeHelp')"
      :description="t('themeStyle.themeHelpDesc')"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="guide" :active="active" />
      </template>
    </tuff-block-switch>
  </ViewTemplate>
</template>

<!--
  ThemeStyle Component Script

  Handles theme and style settings logic including theme changes and environment detection.
-->
<script name="ThemeStyle" lang="ts" setup>
import { onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

// Import UI components
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import WindowSectionVue from './WindowSection.vue'
import SectionItem from './SectionItem.vue'
import LayoutSection from './LayoutSection.vue'
import ThemePreviewIcon from './sub/ThemePreviewIcon.vue'

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
function handleThemeChange(value: string | number, event?: Event): void {
  if (event instanceof MouseEvent) {
    triggerThemeTransition([event.x, event.y], value as any)
  } else {
    triggerThemeTransition([0, 0], value as any)
  }
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
