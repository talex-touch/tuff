<script name="ThemeStyle" lang="ts" setup>
import { TxButton, TxSpinner, TxStatusBadge } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'

import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/channel/storage'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { themeStyle, triggerThemeTransition, type ThemeMode } from '~/modules/storage/app-storage'
import { buildTfileUrl } from '~/utils/tfile-url'
import LayoutSection from './LayoutSection.vue'
import SectionItem from './SectionItem.vue'

import ThemePreviewIcon from './sub/ThemePreviewIcon.vue'
import WindowSectionVue from './WindowSection.vue'

const { t } = useI18n()
const transport = useTuffTransport()
type OpenFileRequest = Record<string, unknown>

const openFileEvent = defineRawEvent<OpenFileRequest, { filePaths?: string[] }>('dialog:open-file')
const copyWallpaperEvent = defineRawEvent<
  { sourcePath: string; type: 'file' | 'folder' },
  { storedPath: string | null; skippedCount: number }
>('wallpaper:copy-to-library')
const getDesktopWallpaperEvent = defineRawEvent<void, { path: string | null }>(
  'wallpaper:get-desktop'
)

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

type WallpaperSource = 'none' | 'bing' | 'custom' | 'folder' | 'desktop'
const WALLPAPER_SOURCES: WallpaperSource[] = ['none', 'bing', 'custom', 'folder', 'desktop']
const defaultFilter = { brightness: 100, contrast: 100, saturate: 100 }

function ensureBackground() {
  if (!appSetting.background) {
    appSetting.background = {
      source: 'none',
      customPath: '',
      folderPath: '',
      folderIntervalMinutes: 30,
      folderRandom: true,
      blur: 0,
      opacity: 100,
      filter: { ...defaultFilter },
      desktopPath: '',
      library: {
        enabled: false,
        folderStoredPath: '',
        fileStoredPath: ''
      },
      sync: {
        enabled: false
      }
    }
    return
  }

  const background = appSetting.background
  background.source = background.source ?? 'none'
  background.customPath = background.customPath ?? ''
  background.folderPath = background.folderPath ?? ''
  background.folderIntervalMinutes =
    typeof background.folderIntervalMinutes === 'number' ? background.folderIntervalMinutes : 30
  background.folderRandom = background.folderRandom !== false
  background.blur = typeof background.blur === 'number' ? background.blur : 0
  background.opacity = typeof background.opacity === 'number' ? background.opacity : 100
  if (!background.filter) {
    background.filter = { ...defaultFilter }
  }
  background.filter.brightness =
    typeof background.filter.brightness === 'number'
      ? background.filter.brightness
      : defaultFilter.brightness
  background.filter.contrast =
    typeof background.filter.contrast === 'number'
      ? background.filter.contrast
      : defaultFilter.contrast
  background.filter.saturate =
    typeof background.filter.saturate === 'number'
      ? background.filter.saturate
      : defaultFilter.saturate
  background.desktopPath = background.desktopPath ?? ''
  if (!background.library) {
    background.library = {
      enabled: false,
      folderStoredPath: '',
      fileStoredPath: ''
    }
  }
  background.library.enabled = Boolean(background.library.enabled)
  background.library.folderStoredPath = background.library.folderStoredPath ?? ''
  background.library.fileStoredPath = background.library.fileStoredPath ?? ''
  if (!background.sync) {
    background.sync = { enabled: false }
  }
  background.sync.enabled = Boolean(background.sync.enabled)
}

watchEffect(() => {
  ensureBackground()
})

const bgSourceValue = computed({
  get: () => {
    const source = (appSetting.background?.source ?? 'none') as WallpaperSource
    const index = WALLPAPER_SOURCES.indexOf(source)
    return index >= 0 ? index : 0
  },
  set: (val: number) => {
    ensureBackground()
    appSetting.background!.source = WALLPAPER_SOURCES[val] ?? 'none'
  }
})

const customBgPath = computed(() => appSetting.background?.customPath ?? '')
const folderBgPath = computed(() => appSetting.background?.folderPath ?? '')
const desktopBgPath = computed(() => appSetting.background?.desktopPath ?? '')
const customBgPreviewUrl = computed(() => buildTfileUrl(customBgPath.value))
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
const bgBrightness = computed({
  get: () => appSetting.background?.filter?.brightness ?? defaultFilter.brightness,
  set: (val: number) => {
    if (appSetting.background?.filter) appSetting.background.filter.brightness = val
  }
})
const bgContrast = computed({
  get: () => appSetting.background?.filter?.contrast ?? defaultFilter.contrast,
  set: (val: number) => {
    if (appSetting.background?.filter) appSetting.background.filter.contrast = val
  }
})
const bgSaturate = computed({
  get: () => appSetting.background?.filter?.saturate ?? defaultFilter.saturate,
  set: (val: number) => {
    if (appSetting.background?.filter) appSetting.background.filter.saturate = val
  }
})
const folderIntervalMinutes = computed({
  get: () => appSetting.background?.folderIntervalMinutes ?? 30,
  set: (val: number) => {
    if (appSetting.background) appSetting.background.folderIntervalMinutes = val
  }
})
const isCustomSource = computed(() => bgSourceValue.value === 2)
const isFolderSource = computed(() => bgSourceValue.value === 3)
const isDesktopSource = computed(() => bgSourceValue.value === 4)
const wallpaperAdjustable = computed(() => {
  const source = appSetting.background?.source ?? 'none'
  if (source === 'none') return false
  if (source === 'custom') return customBgPath.value.length > 0
  if (source === 'folder') return folderBgPath.value.length > 0
  if (source === 'desktop') return desktopBgPath.value.length > 0
  return true
})
const libraryEnabled = computed({
  get: () => appSetting.background?.library?.enabled ?? false,
  set: (val: boolean) => {
    ensureBackground()
    appSetting.background!.library!.enabled = val
    if (!val && appSetting.background?.sync) {
      appSetting.background.sync.enabled = false
    }
    if (val) {
      void syncWallpaperLibrary()
    }
  }
})
const syncEnabled = computed({
  get: () => appSetting.background?.sync?.enabled ?? false,
  set: (val: boolean) => {
    ensureBackground()
    if (!libraryEnabled.value) return
    appSetting.background!.sync!.enabled = val
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
    triggerThemeTransition([event.x, event.y], value as ThemeMode)
  } else {
    triggerThemeTransition([0, 0], value as ThemeMode)
  }
}

/**
 * Open file dialog to select custom background image
 */
async function copyWallpaperToLibrary(type: 'file' | 'folder', sourcePath: string) {
  if (!libraryEnabled.value || !sourcePath) return
  try {
    const result = await transport.send(copyWallpaperEvent, { sourcePath, type })
    if (!appSetting.background?.library) return
    if (type === 'file') {
      appSetting.background.library.fileStoredPath = result?.storedPath ?? ''
    } else {
      appSetting.background.library.folderStoredPath = result?.storedPath ?? ''
    }
  } catch (error) {
    console.error('Failed to copy wallpaper to library:', error)
  }
}

async function syncWallpaperLibrary() {
  if (!appSetting.background) return
  if (appSetting.background.source === 'custom' && customBgPath.value) {
    await copyWallpaperToLibrary('file', customBgPath.value)
  }
  if (appSetting.background.source === 'folder' && folderBgPath.value) {
    await copyWallpaperToLibrary('folder', folderBgPath.value)
  }
}

async function selectBackgroundImage() {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('themeStyle.selectBackgroundImage', 'Select Background Image'),
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (result && result.filePaths && result.filePaths.length > 0) {
      ensureBackground()
      appSetting.background!.customPath = result.filePaths[0]
      appSetting.background!.source = 'custom'
      await copyWallpaperToLibrary('file', result.filePaths[0])
    }
  } catch (error) {
    console.error('Failed to select background image:', error)
  }
}

async function selectBackgroundFolder() {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('themeStyle.selectBackgroundFolder', 'Select Folder'),
      properties: ['openDirectory']
    })
    if (result && result.filePaths && result.filePaths.length > 0) {
      ensureBackground()
      appSetting.background!.folderPath = result.filePaths[0]
      appSetting.background!.source = 'folder'
      await copyWallpaperToLibrary('folder', result.filePaths[0])
    }
  } catch (error) {
    console.error('Failed to select background folder:', error)
  }
}

async function refreshDesktopWallpaper() {
  try {
    const result = await transport.send(getDesktopWallpaperEvent)
    ensureBackground()
    appSetting.background!.desktopPath = result?.path ?? ''
    appSetting.background!.source = 'desktop'
  } catch (error) {
    console.error('Failed to refresh desktop wallpaper:', error)
  }
}

/**
 * Clear custom background image
 */
function clearBackgroundImage() {
  if (appSetting.background) {
    appSetting.background.customPath = ''
    if (appSetting.background.library) {
      appSetting.background.library.fileStoredPath = ''
    }
    appSetting.background.source = 'none'
  }
}

function clearBackgroundFolder() {
  if (appSetting.background) {
    appSetting.background.folderPath = ''
    if (appSetting.background.library) {
      appSetting.background.library.folderStoredPath = ''
    }
    appSetting.background.source = 'none'
  }
}

watch(
  () => appSetting.background?.source,
  (source) => {
    if (source === 'desktop' && !desktopBgPath.value) {
      void refreshDesktopWallpaper()
    }
  }
)

const bgSaving = computed(() => appSettings.savingState?.value ?? false)
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
          <TxSpinner v-if="bgSaving" :size="14" />
          <ThemePreviewIcon v-else variant="wallpaper" :active="active" />
        </template>
        <TSelectItem :model-value="0" name="none">
          {{ t('themeStyle.noBackground') }}
        </TSelectItem>
        <TSelectItem :model-value="1" name="bing">
          {{ t('themeStyle.bing') }}
        </TSelectItem>
        <TSelectItem :model-value="2" name="custom">
          {{ t('themeStyle.customImage') }}
        </TSelectItem>
        <TSelectItem :model-value="3" name="folder">
          {{ t('themeStyle.folder') }}
        </TSelectItem>
        <TSelectItem :model-value="4" name="desktop">
          {{ t('themeStyle.desktopWallpaper') }}
        </TSelectItem>
      </TuffBlockSelect>

      <!-- Custom background image upload -->
      <div v-if="isCustomSource" class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
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
            :src="customBgPreviewUrl"
            class="h-24 w-full object-cover"
            :style="{
              filter: `blur(${bgBlur}px) brightness(${bgBrightness}%) contrast(${bgContrast}%) saturate(${bgSaturate}%)`,
              opacity: bgOpacity / 100
            }"
          />
        </div>
      </div>

      <!-- Folder background image -->
      <div v-if="isFolderSource" class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <p class="text-sm font-medium text-black/80 dark:text-white/80">
              {{ t('themeStyle.folder') }}
            </p>
            <p v-if="folderBgPath" class="mt-1 truncate text-xs text-black/50 dark:text-white/50">
              {{ folderBgPath }}
            </p>
            <p v-else class="mt-1 text-xs text-black/40 dark:text-white/40">
              {{ t('themeStyle.noImageSelected') }}
            </p>
          </div>
          <div class="flex gap-2">
            <TxButton
              variant="bare"
              class="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
              @click="selectBackgroundFolder"
            >
              {{ t('themeStyle.selectFolder') }}
            </TxButton>
            <TxButton
              v-if="folderBgPath"
              variant="bare"
              class="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/20"
              @click="clearBackgroundFolder"
            >
              {{ t('themeStyle.clearFolder') }}
            </TxButton>
          </div>
        </div>

        <div v-if="folderBgPath" class="mt-4 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-black/60 dark:text-white/60">{{
              t('themeStyle.rotationInterval')
            }}</span>
            <span class="font-medium text-black/80 dark:text-white/80">
              {{ folderIntervalMinutes }}{{ t('themeStyle.minutes') }}
            </span>
          </div>
          <input
            v-model.number="folderIntervalMinutes"
            type="range"
            min="5"
            max="240"
            class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
          />
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('themeStyle.folderRandomHint') }}
          </p>
        </div>
      </div>

      <!-- Desktop wallpaper -->
      <div v-if="isDesktopSource" class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <p class="text-sm font-medium text-black/80 dark:text-white/80">
              {{ t('themeStyle.desktopWallpaper') }}
            </p>
            <p v-if="desktopBgPath" class="mt-1 truncate text-xs text-black/50 dark:text-white/50">
              {{ desktopBgPath }}
            </p>
            <p v-else class="mt-1 text-xs text-black/40 dark:text-white/40">
              {{ t('themeStyle.noImageSelected') }}
            </p>
          </div>
          <div class="flex gap-2">
            <TxButton
              variant="bare"
              class="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
              @click="refreshDesktopWallpaper"
            >
              {{ t('themeStyle.refreshDesktopWallpaper') }}
            </TxButton>
          </div>
        </div>
      </div>

      <!-- Wallpaper adjustments -->
      <div v-if="wallpaperAdjustable" class="mt-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
        <div class="space-y-3">
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.blur') }}</span>
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
              <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.opacity') }}</span>
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
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.brightness') }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">{{ bgBrightness }}%</span>
            </div>
            <input
              v-model.number="bgBrightness"
              type="range"
              min="50"
              max="150"
              class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
            />
          </div>
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.contrast') }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">{{ bgContrast }}%</span>
            </div>
            <input
              v-model.number="bgContrast"
              type="range"
              min="50"
              max="150"
              class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
            />
          </div>
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.saturate') }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">{{ bgSaturate }}%</span>
            </div>
            <input
              v-model.number="bgSaturate"
              type="range"
              min="50"
              max="150"
              class="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 dark:bg-white/10"
            />
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-3">
        <TuffBlockSwitch
          v-model="libraryEnabled"
          :title="t('themeStyle.copyToLibrary')"
          :description="t('themeStyle.copyToLibraryDesc')"
        />
        <TuffBlockSwitch
          v-model="syncEnabled"
          :title="t('themeStyle.syncToCloud')"
          :description="t('themeStyle.syncToCloudDesc')"
          :disabled="!libraryEnabled"
        />
        <p v-if="!libraryEnabled" class="text-xs text-black/40 dark:text-white/40">
          {{ t('themeStyle.syncRequiresLibrary') }}
        </p>
        <p class="text-xs text-black/40 dark:text-white/40">
          {{ t('themeStyle.copyToLibraryHint') }}
        </p>
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
