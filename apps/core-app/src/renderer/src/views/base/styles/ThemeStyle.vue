<script name="ThemeStyle" lang="ts" setup>
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import TSelectItem from '~/components/base/select/TSelectItem.vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

import { appSetting } from '~/modules/channel/storage'
import { themeStyle, triggerThemeTransition } from '~/modules/storage/app-storage'
import LayoutSection from './LayoutSection.vue'
import SectionItem from './SectionItem.vue'

import ThemePreviewIcon from './sub/ThemePreviewIcon.vue'
import WindowSectionVue from './WindowSection.vue'

const { t } = useI18n()

const styleValue = ref(0)
const homeBgSource = ref(0)

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
</script>

<template>
  <ViewTemplate :name="t('themeStyle.styles')">
    <WindowSectionVue>
      <SectionItem v-model="themeStyle.theme.window" title="Default" />
      <SectionItem v-model="themeStyle.theme.window" title="Mica" />
      <SectionItem v-model="themeStyle.theme.window" title="Filter" :disabled="true" />
    </WindowSectionVue>

    <LayoutSection />

    <TuffGroupBlock
      :name="t('themeStyle.personalized')"
      :description="t('themeStyle.personalizedDesc')"
      memory-name="theme-style-personalized"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="personalized" :active="active" />
      </template>
      <TuffBlockSelect
        v-model="styleValue"
        :title="t('themeStyle.colorStyle')"
        :description="t('themeStyle.colorStyleDesc')"
        @change="handleThemeChange"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="palette" :active="active" />
        </template>
        <TSelectItem :model-value="0" name="light">
          {{ t('themeStyle.lightStyle') }}
        </TSelectItem>
        <TSelectItem :model-value="1" name="dark">
          {{ t('themeStyle.darkStyle') }}
        </TSelectItem>
        <TSelectItem :model-value="2" name="auto">
          {{ t('themeStyle.followSystem') }}
        </TSelectItem>
      </TuffBlockSelect>

      <TuffBlockSelect
        v-model="homeBgSource"
        :title="t('themeStyle.homepageWallpaper')"
        :description="t('themeStyle.homepageWallpaperDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="wallpaper" :active="active" />
        </template>
        <TSelectItem :model-value="0" name="bing">
          {{ t('themeStyle.bing') }}
        </TSelectItem>
        <TSelectItem :model-value="1" name="folder">
          {{ t('themeStyle.folder') }}
        </TSelectItem>
      </TuffBlockSelect>
    </TuffGroupBlock>

    <TuffGroupBlock
      :name="t('themeStyle.emphasis')"
      :description="t('themeStyle.emphasisDesc')"
      memory-name="theme-style-emphasis"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="emphasis" :active="active" />
      </template>
      <TuffBlockSwitch
        v-model="themeStyle.theme.addon.coloring"
        :title="t('themeStyle.coloring')"
        :description="t('themeStyle.coloringDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="coloring" :active="active" />
        </template>
      </TuffBlockSwitch>

      <TuffBlockSwitch
        v-model="themeStyle.theme.addon.contrast"
        :title="t('themeStyle.highContrast')"
        :description="t('themeStyle.highContrastDesc')"
        disabled
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="contrast" :active="active" />
        </template>
      </TuffBlockSwitch>
    </TuffGroupBlock>

    <!-- Animation settings group block -->
    <TuffGroupBlock
      :name="t('themeStyle.animationGroupTitle')"
      :description="t('themeStyle.animationGroupDesc')"
      memory-name="theme-style-animation"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="animation" :active="active" />
      </template>
      <!-- List item stagger animation switch -->
      <TuffBlockSwitch
        v-model="appSetting.animation.listItemStagger"
        :title="t('themeStyle.listItemStagger')"
        :description="t('themeStyle.listItemStaggerDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="stagger" :active="active" />
        </template>
      </TuffBlockSwitch>

      <!-- Result transition animation switch -->
      <TuffBlockSwitch
        v-model="appSetting.animation.resultTransition"
        :title="t('themeStyle.resultTransition')"
        :description="t('themeStyle.resultTransitionDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="transition" :active="active" />
        </template>
      </TuffBlockSwitch>
    </TuffGroupBlock>

    <TuffBlockSwitch
      guidance
      :model-value="false"
      :title="t('themeStyle.themeHelp')"
      :description="t('themeStyle.themeHelpDesc')"
    >
      <template #icon="{ active }">
        <ThemePreviewIcon variant="guide" :active="active" />
      </template>
    </TuffBlockSwitch>
  </ViewTemplate>
</template>

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
