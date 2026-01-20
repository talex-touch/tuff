<script name="ThemeStyle" lang="ts" setup>
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import { TxButton, TxStatusBadge } from '@talex-touch/tuffex'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { appSetting } from '~/modules/channel/storage'
import { themeStyle, triggerThemeTransition } from '~/modules/storage/app-storage'
import LayoutSection from './LayoutSection.vue'
import SectionItem from './SectionItem.vue'

import ThemePreviewIcon from './sub/ThemePreviewIcon.vue'
import WindowSectionVue from './WindowSection.vue'

const { t } = useI18n()
const transport = useTuffTransport()
const openFileEvent = defineRawEvent<any, { filePaths?: string[] }>('dialog:open-file')

const styleValue = ref(0)
type RouteTransitionStyle = 'slide' | 'fade' | 'zoom'

const routeTransitionStyle = computed({
  get: () => themeStyle.value.theme.transition?.route ?? 'slide',
  set: (val: RouteTransitionStyle) => {
    if (!themeStyle.value.theme.transition) {
      themeStyle.value.theme.transition = { route: 'slide' as RouteTransitionStyle }
    }
    themeStyle.value.theme.transition.route = val
  }
})

// Background source mapping: 0=bing, 1=custom, 2=none
const bgSourceValue = computed({
  get: () => {
    const source = appSetting.background?.source ?? 'bing'
    if (source === 'bing') return 0
    if (source === 'custom') return 1
    return 2
  },
  set: (val: number) => {
    if (!appSetting.background) {
      appSetting.background = { source: 'bing', customPath: '', blur: 0, opacity: 100 }
    }
    appSetting.background.source = val === 0 ? 'bing' : val === 1 ? 'custom' : 'none'
  }
})

const customBgPath = computed(() => appSetting.background?.customPath ?? '')
const bgBlur = computed({
  get: () => appSetting.background?.blur ?? 0,
  set: (val: number) => {
    if (appSetting.background) appSetting.background.blur = val
  }
})
const bgOpacity = computed({
  get: () => appSetting.background?.opacity ?? 100,
  set: (val: number) => {
    if (appSetting.background) appSetting.background.opacity = val
  }
})

const lowBatteryThreshold = computed({
  get: () => {
    const v = appSetting.animation?.lowBatteryThreshold
    return typeof v === 'number' ? v : 20
  },
  set: (val: number) => {
    if (!appSetting.animation) {
      appSetting.animation = {
        listItemStagger: false,
        resultTransition: false,
        coreBoxResize: false,
        autoDisableOnLowBattery: true,
        lowBatteryThreshold: 20
      }
    }
    appSetting.animation.lowBatteryThreshold = val
  }
})

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

/**
 * Open file dialog to select custom background image
 */
async function selectBackgroundImage() {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('themeStyle.selectBackgroundImage', 'Select Background Image'),
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (result && result.filePaths && result.filePaths.length > 0) {
      if (!appSetting.background) {
        appSetting.background = { source: 'custom', customPath: '', blur: 0, opacity: 100 }
      }
      appSetting.background.customPath = result.filePaths[0]
      appSetting.background.source = 'custom'
    }
  } catch (error) {
    console.error('Failed to select background image:', error)
  }
}

/**
 * Clear custom background image
 */
function clearBackgroundImage() {
  if (appSetting.background) {
    appSetting.background.customPath = ''
    appSetting.background.source = 'bing'
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
        v-model="bgSourceValue"
        :title="t('themeStyle.homepageWallpaper')"
        :description="t('themeStyle.homepageWallpaperDesc')"
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="wallpaper" :active="active" />
        </template>
        <TSelectItem :model-value="0" name="bing">
          {{ t('themeStyle.bing') }}
        </TSelectItem>
        <TSelectItem :model-value="1" name="custom">
          {{ t('themeStyle.customImage', 'Custom Image') }}
        </TSelectItem>
        <TSelectItem :model-value="2" name="none">
          {{ t('themeStyle.noBackground', 'None') }}
        </TSelectItem>
      </TuffBlockSelect>

      <!-- Custom background image upload -->
      <div v-if="bgSourceValue === 1" class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <p class="text-sm font-medium text-black/80 dark:text-white/80">
              {{ t('themeStyle.customBackgroundImage', 'Custom Background Image') }}
            </p>
            <p v-if="customBgPath" class="mt-1 truncate text-xs text-black/50 dark:text-white/50">
              {{ customBgPath }}
            </p>
            <p v-else class="mt-1 text-xs text-black/40 dark:text-white/40">
              {{ t('themeStyle.noImageSelected', 'No image selected') }}
            </p>
          </div>
          <div class="flex gap-2">
            <TxButton
              variant="bare"
              class="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
              @click="selectBackgroundImage"
            >
              {{ t('themeStyle.selectImage', 'Select') }}
            </TxButton>
            <TxButton
              v-if="customBgPath"
              variant="bare"
              class="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/20"
              @click="clearBackgroundImage"
            >
              {{ t('themeStyle.clearImage', 'Clear') }}
            </TxButton>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="customBgPath" class="mt-3 overflow-hidden rounded-lg">
          <img
            :src="`tfile://${customBgPath}`"
            class="h-24 w-full object-cover"
            :style="{ filter: `blur(${bgBlur}px)`, opacity: bgOpacity / 100 }"
          />
        </div>

        <!-- Blur and Opacity sliders -->
        <div v-if="customBgPath" class="mt-4 space-y-3">
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{
                t('themeStyle.blur', 'Blur')
              }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">{{ bgBlur }}px</span>
            </div>
            <input
              v-model.number="bgBlur"
              type="range"
              min="0"
              max="20"
              class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
            />
          </div>
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{
                t('themeStyle.opacity', 'Opacity')
              }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">{{ bgOpacity }}%</span>
            </div>
            <input
              v-model.number="bgOpacity"
              type="range"
              min="10"
              max="100"
              class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
            />
          </div>
        </div>
      </div>
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
        <template #suffix>
          <TxStatusBadge text="Beta" status="warning" size="sm" />
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
        <template #suffix>
          <TxStatusBadge text="Beta" status="warning" size="sm" />
        </template>
      </TuffBlockSwitch>

      <TuffBlockSelect
        v-model="routeTransitionStyle"
        :title="t('themeStyle.routeTransition', '页面切换动效')"
        :description="
          t('themeStyle.routeTransitionDesc', '控制应用页面路由切换动画（可能影响性能）。')
        "
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="transition" :active="active" />
        </template>
        <TSelectItem model-value="slide" name="slide">
          {{ t('themeStyle.routeTransitionSlide', '滑动') }}
        </TSelectItem>
        <TSelectItem model-value="fade" name="fade">
          {{ t('themeStyle.routeTransitionFade', '淡入淡出') }}
        </TSelectItem>
        <TSelectItem model-value="zoom" name="zoom">
          {{ t('themeStyle.routeTransitionZoom', '缩放') }}
        </TSelectItem>
      </TuffBlockSelect>

      <!-- CoreBox window resize animation switch (Beta) -->
      <TuffBlockSwitch
        v-model="appSetting.animation.coreBoxResize"
        :title="t('themeStyle.coreBoxResize', 'CoreBox Window Animation')"
        :description="
          t(
            'themeStyle.coreBoxResizeDesc',
            'Smooth expand/collapse animation for the search window'
          )
        "
      >
        <template #icon="{ active }">
          <ThemePreviewIcon variant="transition" :active="active" />
        </template>
        <template #suffix>
          <TxStatusBadge text="Beta" status="warning" size="sm" />
        </template>
      </TuffBlockSwitch>

      <TuffBlockSwitch
        v-model="appSetting.animation.autoDisableOnLowBattery"
        title="Low Battery Mode"
        description="Automatically disable animations when battery is low"
      />

      <div
        v-if="appSetting.animation.autoDisableOnLowBattery !== false"
        class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-black/60 dark:text-white/60">Low battery threshold</span>
          <span class="font-medium text-black/80 dark:text-white/80"
            >{{ lowBatteryThreshold }}%</span
          >
        </div>
        <input
          v-model.number="lowBatteryThreshold"
          type="range"
          min="5"
          max="50"
          step="1"
          class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
        />
      </div>
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
