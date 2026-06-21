<script name="ThemeStyle" lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRadio, TxRadioGroup } from '@talex-touch/tuffex/radio'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { WALLPAPER_IMAGE_EXTENSIONS } from '@talex-touch/utils/common/wallpaper'
import { useTuffTransport } from '@talex-touch/utils/transport'

import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  DEFAULT_WALLPAPER_FILTER,
  WALLPAPER_SOURCES,
  hasConfiguredWallpaperSource,
  normalizeWallpaperBackground,
  type WallpaperSource
} from '~/modules/layout/wallpaper-state'
import { appSetting } from '~/modules/storage/app-storage'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import {
  normalizeWindowPreference,
  themeStyle,
  triggerThemeTransition,
  type ThemeMode,
  type ThemeWindowPreference
} from '~/modules/storage/theme-style'
import { createRendererLogger } from '~/utils/renderer-log'
import { buildTfileUrl } from '~/utils/tfile-url'
import LayoutSection from './LayoutSection.vue'
import SectionItem from './SectionItem.vue'
import { getWallpaperSourceHintKey } from './wallpaper-display-state'

import ThemePreviewIcon from './sub/ThemePreviewIcon.vue'
import WindowSectionVue from './WindowSection.vue'

const { t } = useI18n()
const transport = useTuffTransport()
const themeStyleLog = createRendererLogger('ThemeStyle')
type OpenFileRequest = Record<string, unknown>

const openFileEvent = defineRawEvent<OpenFileRequest, { filePaths?: string[] }>('dialog:open-file')
const copyWallpaperEvent = defineRawEvent<
  { sourcePath: string; type: 'file' | 'folder' },
  { storedPath: string | null; skippedCount: number; error?: string }
>('wallpaper:copy-to-library')
const getDesktopWallpaperEvent = defineRawEvent<void, { path: string | null; error?: string }>(
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

const windowPreference = computed<ThemeWindowPreference>({
  get: () => normalizeWindowPreference(themeStyle.value.theme.window),
  set: (value) => {
    themeStyle.value.theme.window = normalizeWindowPreference(value)
  }
})
const windowPreferenceLoading = ref(false)
let windowPreferenceLoadingTimer: ReturnType<typeof setTimeout> | null = null

function showWindowPreferenceLoading(): void {
  windowPreferenceLoading.value = true
  if (windowPreferenceLoadingTimer) {
    clearTimeout(windowPreferenceLoadingTimer)
  }
  windowPreferenceLoadingTimer = setTimeout(() => {
    windowPreferenceLoading.value = false
    windowPreferenceLoadingTimer = null
  }, 480)
}

let wallpaperSourceSwitchToken = 0

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

function ensureBackground() {
  const normalized = normalizeWallpaperBackground(appSetting.background)
  if (!appSetting.background) {
    appSetting.background = normalized
    return
  }

  const background = appSetting.background
  background.source = normalized.source
  background.customPath = normalized.customPath
  background.folderPath = normalized.folderPath
  background.folderIntervalMinutes = normalized.folderIntervalMinutes
  background.folderRandom = normalized.folderRandom
  background.blur = normalized.blur
  background.opacity = normalized.opacity
  background.filter = { ...normalized.filter }
  background.desktopPath = normalized.desktopPath
  background.library = { ...normalized.library }
  background.sync = { ...normalized.sync }
}

watchEffect(() => {
  ensureBackground()
})

watch(windowPreference, (next, prev) => {
  if (!prev || next === prev) {
    return
  }
  showWindowPreferenceLoading()
})

onBeforeUnmount(() => {
  if (windowPreferenceLoadingTimer) {
    clearTimeout(windowPreferenceLoadingTimer)
    windowPreferenceLoadingTimer = null
  }
})

const bgSourceValue = computed({
  get: () => {
    const source = normalizeWallpaperBackground(appSetting.background).source
    const index = WALLPAPER_SOURCES.indexOf(source)
    return index >= 0 ? index : 0
  },
  set: (val: number) => {
    ensureBackground()
    const nextSource = WALLPAPER_SOURCES[val] ?? 'none'
    const previousSource = (appSetting.background!.source ?? 'none') as WallpaperSource
    appSetting.background!.source = nextSource
    const currentToken = ++wallpaperSourceSwitchToken
    void ensureWallpaperSourceReady(nextSource, previousSource, currentToken)
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
  get: () => appSetting.background?.filter?.brightness ?? DEFAULT_WALLPAPER_FILTER.brightness,
  set: (val: number) => {
    if (appSetting.background?.filter) appSetting.background.filter.brightness = val
  }
})
const bgContrast = computed({
  get: () => appSetting.background?.filter?.contrast ?? DEFAULT_WALLPAPER_FILTER.contrast,
  set: (val: number) => {
    if (appSetting.background?.filter) appSetting.background.filter.contrast = val
  }
})
const bgSaturate = computed({
  get: () => appSetting.background?.filter?.saturate ?? DEFAULT_WALLPAPER_FILTER.saturate,
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
const currentWallpaperSource = computed(() => WALLPAPER_SOURCES[bgSourceValue.value] ?? 'auto')
const isCustomSource = computed(() => currentWallpaperSource.value === 'custom')
const isFolderSource = computed(() => currentWallpaperSource.value === 'folder')
const isDesktopSource = computed(() => currentWallpaperSource.value === 'desktop')
const wallpaperSourceHint = computed(() => {
  const key = getWallpaperSourceHintKey({
    source: currentWallpaperSource.value,
    desktopPath: desktopBgPath.value,
    folderPath: folderBgPath.value,
    folderRandom: appSetting.background?.folderRandom
  })
  return key ? t(key) : ''
})
const wallpaperLibrarySupported = computed(
  () => currentWallpaperSource.value === 'custom' || currentWallpaperSource.value === 'folder'
)
const wallpaperAdjustable = computed(() => {
  return hasConfiguredWallpaperSource(normalizeWallpaperBackground(appSetting.background))
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
const folderRotationMode = computed({
  get: () => (appSetting.background?.folderRandom === false ? 'sequential' : 'random'),
  set: (val: string | number) => {
    if (appSetting.background) {
      appSetting.background.folderRandom = val !== 'sequential'
    }
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
 * @param v - The new theme value (0=light, 1=dark, 2=auto)
 * @param e - The mouse event triggering the change
 * @returns void
 */
const THEME_MODE_MAP: ThemeMode[] = ['light', 'dark', 'auto'] as ThemeMode[]

function handleThemeChange(value: string | number, event?: Event): void {
  const mode = typeof value === 'number' ? (THEME_MODE_MAP[value] ?? value) : value
  if (event instanceof MouseEvent) {
    triggerThemeTransition([event.x, event.y], mode as ThemeMode)
  } else {
    triggerThemeTransition([0, 0], mode as ThemeMode)
  }
}

/**
 * Open file dialog to select custom background image
 */
async function copyWallpaperToLibrary(
  type: 'file' | 'folder',
  sourcePath: string
): Promise<boolean> {
  if (!libraryEnabled.value || !sourcePath) return false
  try {
    const result = await transport.send(copyWallpaperEvent, { sourcePath, type })
    if (!result?.storedPath) {
      const message =
        result?.error || t('themeStyle.wallpaperCopyFailed', 'Failed to copy wallpaper to library')
      themeStyleLog.error('Failed to copy wallpaper to library:', {
        type,
        sourcePath,
        message
      })
      toast.error(message)
      return false
    }
    if (!appSetting.background?.library) return false
    if (type === 'file') {
      appSetting.background.library.fileStoredPath = result?.storedPath ?? ''
    } else {
      appSetting.background.library.folderStoredPath = result?.storedPath ?? ''
    }
    return true
  } catch (error) {
    themeStyleLog.error('Failed to copy wallpaper to library:', error)
    toast.error(t('themeStyle.wallpaperCopyFailed', 'Failed to copy wallpaper to library'))
    return false
  }
}

async function syncWallpaperLibrary(): Promise<boolean> {
  if (!appSetting.background || !libraryEnabled.value) return true
  let success = true
  if (appSetting.background.source === 'custom' && customBgPath.value) {
    success = (await copyWallpaperToLibrary('file', customBgPath.value)) && success
  }
  if (appSetting.background.source === 'folder' && folderBgPath.value) {
    success = (await copyWallpaperToLibrary('folder', folderBgPath.value)) && success
  }
  return success
}

async function selectBackgroundImageInternal(options?: { setSource?: boolean }): Promise<boolean> {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('themeStyle.selectBackgroundImage', 'Select Background Image'),
      filters: [{ name: 'Images', extensions: [...WALLPAPER_IMAGE_EXTENSIONS] }],
      properties: ['openFile']
    })
    if (result && result.filePaths && result.filePaths.length > 0) {
      ensureBackground()
      appSetting.background!.customPath = result.filePaths[0]
      if (options?.setSource !== false) {
        appSetting.background!.source = 'custom'
      }
      await copyWallpaperToLibrary('file', result.filePaths[0])
      return true
    }
    return false
  } catch (error) {
    themeStyleLog.error('Failed to select background image:', error)
    toast.error(t('themeStyle.selectImageFailed', 'Failed to select background image'))
    return false
  }
}

async function selectBackgroundFolderInternal(options?: { setSource?: boolean }): Promise<boolean> {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('themeStyle.selectBackgroundFolder', 'Select Folder'),
      properties: ['openDirectory']
    })
    if (result && result.filePaths && result.filePaths.length > 0) {
      ensureBackground()
      appSetting.background!.folderPath = result.filePaths[0]
      if (options?.setSource !== false) {
        appSetting.background!.source = 'folder'
      }
      await copyWallpaperToLibrary('folder', result.filePaths[0])
      return true
    }
    return false
  } catch (error) {
    themeStyleLog.error('Failed to select background folder:', error)
    toast.error(t('themeStyle.selectFolderFailed', 'Failed to select background folder'))
    return false
  }
}

async function refreshDesktopWallpaperInternal(options?: {
  setSource?: boolean
  silentError?: boolean
}): Promise<boolean> {
  try {
    const result = await transport.send(getDesktopWallpaperEvent)
    const desktopPath = result?.path ?? ''
    if (!desktopPath) {
      const message =
        result?.error ||
        t('themeStyle.desktopWallpaperUnavailable', 'Desktop wallpaper is unavailable.')
      themeStyleLog.error('Failed to refresh desktop wallpaper:', message)
      if (!options?.silentError) {
        toast.error(message)
      }
      return false
    }
    ensureBackground()
    appSetting.background!.desktopPath = desktopPath
    if (options?.setSource !== false) {
      appSetting.background!.source = 'desktop'
    }
    return true
  } catch (error) {
    themeStyleLog.error('Failed to refresh desktop wallpaper:', error)
    if (!options?.silentError) {
      const message = toErrorMessage(error)
      toast.error(
        t(
          'themeStyle.desktopWallpaperRefreshFailed',
          `Failed to refresh desktop wallpaper: ${message}`
        )
      )
    }
    return false
  }
}

function rollbackWallpaperSource(
  expectedSource: WallpaperSource,
  previousSource: WallpaperSource,
  token: number
): void {
  if (wallpaperSourceSwitchToken !== token) {
    return
  }
  if (appSetting.background?.source === expectedSource) {
    appSetting.background.source = previousSource
  }
}

async function ensureWallpaperSourceReady(
  nextSource: WallpaperSource,
  previousSource: WallpaperSource,
  token: number
): Promise<void> {
  if (nextSource === 'custom' && !customBgPath.value) {
    const selected = await selectBackgroundImageInternal({ setSource: false })
    if (!selected) {
      rollbackWallpaperSource(nextSource, previousSource, token)
    }
    return
  }
  if (nextSource === 'folder' && !folderBgPath.value) {
    const selected = await selectBackgroundFolderInternal({ setSource: false })
    if (!selected) {
      rollbackWallpaperSource(nextSource, previousSource, token)
    }
    return
  }
  if (nextSource === 'desktop' && !desktopBgPath.value) {
    const refreshed = await refreshDesktopWallpaperInternal({ setSource: false })
    if (!refreshed) {
      rollbackWallpaperSource(nextSource, previousSource, token)
    }
  }
  if (libraryEnabled.value && (nextSource === 'custom' || nextSource === 'folder')) {
    await syncWallpaperLibrary()
  }
}

async function selectBackgroundImage(): Promise<void> {
  await selectBackgroundImageInternal()
}

async function selectBackgroundFolder(): Promise<void> {
  await selectBackgroundFolderInternal()
}

async function refreshDesktopWallpaper(): Promise<void> {
  await refreshDesktopWallpaperInternal()
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
    if ((source === 'desktop' || source === 'auto') && !desktopBgPath.value) {
      void refreshDesktopWallpaperInternal({ silentError: true })
    }
  }
)

const bgSaving = computed(() => appSettings.savingState?.value ?? false)
</script>

<template>
  <div class="ThemeStyle-Page">
    <ViewTemplate :title="t('themeStyle.styles')">
      <WindowSectionVue>
        <SectionItem v-model="windowPreference" title="pure" :label="t('themeStyle.windowPure')" />
        <SectionItem
          v-model="windowPreference"
          title="refraction"
          :label="t('themeStyle.windowRefraction')"
        />
        <SectionItem
          v-model="windowPreference"
          title="filter"
          :label="t('themeStyle.windowFilter')"
        />
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
          <TxSelectItem :value="0">
            {{ t('themeStyle.lightStyle') }}
          </TxSelectItem>
          <TxSelectItem :value="1">
            {{ t('themeStyle.darkStyle') }}
          </TxSelectItem>
          <TxSelectItem :value="2">
            {{ t('themeStyle.followSystem') }}
          </TxSelectItem>
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
          <TxSelectItem :value="0">
            {{ t('themeStyle.autoWallpaper') }}
          </TxSelectItem>
          <TxSelectItem :value="1">
            {{ t('themeStyle.noBackground') }}
          </TxSelectItem>
          <TxSelectItem :value="2">
            {{ t('themeStyle.bing') }}
          </TxSelectItem>
          <TxSelectItem :value="3">
            {{ t('themeStyle.customImage') }}
          </TxSelectItem>
          <TxSelectItem :value="4">
            {{ t('themeStyle.folder') }}
          </TxSelectItem>
          <TxSelectItem :value="5">
            {{ t('themeStyle.desktopWallpaper') }}
          </TxSelectItem>
        </TuffBlockSelect>
        <div v-if="wallpaperSourceHint" class="theme-style-wallpaper-status">
          <span class="i-ri-information-line" />
          <span>{{ wallpaperSourceHint }}</span>
        </div>

        <div v-if="isCustomSource" class="theme-style-wallpaper-panel">
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

          <div v-if="customBgPath" class="theme-style-wallpaper-preview">
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

        <div v-if="isFolderSource" class="theme-style-wallpaper-panel">
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
            <div class="theme-style-wallpaper-mode-row">
              <span class="text-xs text-black/60 dark:text-white/60">
                {{ t('themeStyle.rotationMode') }}
              </span>
              <TxRadioGroup v-model="folderRotationMode" glass>
                <TxRadio value="random" :label="t('themeStyle.randomRotation')" />
                <TxRadio value="sequential" :label="t('themeStyle.sequentialRotation')" />
              </TxRadioGroup>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-black/60 dark:text-white/60">{{
                t('themeStyle.rotationInterval')
              }}</span>
              <span class="font-medium text-black/80 dark:text-white/80">
                {{ folderIntervalMinutes }}{{ t('themeStyle.minutes') }}
              </span>
            </div>
            <TxSlider v-model="folderIntervalMinutes" :min="5" :max="240" :step="5" />
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('themeStyle.folderRotationHint') }}
            </p>
          </div>
        </div>

        <div v-if="isDesktopSource" class="theme-style-wallpaper-panel">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1">
              <p class="text-sm font-medium text-black/80 dark:text-white/80">
                {{ t('themeStyle.desktopWallpaper') }}
              </p>
              <p
                v-if="desktopBgPath"
                class="mt-1 truncate text-xs text-black/50 dark:text-white/50"
              >
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

        <div v-if="wallpaperAdjustable" class="theme-style-wallpaper-panel">
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.blur') }}</span>
                <span class="font-medium text-black/80 dark:text-white/80">{{ bgBlur }}px</span>
              </div>
              <TxSlider v-model="bgBlur" :min="0" :max="20" :step="1" />
            </div>
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.opacity') }}</span>
                <span class="font-medium text-black/80 dark:text-white/80">{{ bgOpacity }}%</span>
              </div>
              <TxSlider v-model="bgOpacity" :min="10" :max="100" :step="1" />
            </div>
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-black/60 dark:text-white/60">{{
                  t('themeStyle.brightness')
                }}</span>
                <span class="font-medium text-black/80 dark:text-white/80"
                  >{{ bgBrightness }}%</span
                >
              </div>
              <TxSlider v-model="bgBrightness" :min="50" :max="150" :step="1" />
            </div>
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.contrast') }}</span>
                <span class="font-medium text-black/80 dark:text-white/80">{{ bgContrast }}%</span>
              </div>
              <TxSlider v-model="bgContrast" :min="50" :max="150" :step="1" />
            </div>
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-black/60 dark:text-white/60">{{ t('themeStyle.saturate') }}</span>
                <span class="font-medium text-black/80 dark:text-white/80">{{ bgSaturate }}%</span>
              </div>
              <TxSlider v-model="bgSaturate" :min="50" :max="150" :step="1" />
            </div>
          </div>
        </div>

        <template v-if="wallpaperLibrarySupported">
          <TuffBlockSwitch
            v-model="libraryEnabled"
            :title="t('themeStyle.copyToLibrary')"
            :description="t('themeStyle.copyToLibraryDesc')"
          >
            <template #tags>
              <TxTooltip
                :content="t('themeStyle.copyToLibraryHint')"
                :anchor="{ placement: 'top', showArrow: true }"
              >
                <TxButton
                  variant="bare"
                  native-type="button"
                  class="theme-style-hint-btn"
                  @click.stop
                >
                  <span class="i-carbon-information text-xs" />
                </TxButton>
              </TxTooltip>
            </template>
          </TuffBlockSwitch>
        </template>
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
          :title="t('themeStyle.routeTransition')"
          :description="t('themeStyle.routeTransitionDesc')"
        >
          <template #icon="{ active }">
            <ThemePreviewIcon variant="transition" :active="active" />
          </template>
          <TxSelectItem value="slide">
            {{ t('themeStyle.routeTransitionSlide') }}
          </TxSelectItem>
          <TxSelectItem value="fade">
            {{ t('themeStyle.routeTransitionFade') }}
          </TxSelectItem>
          <TxSelectItem value="zoom">
            {{ t('themeStyle.routeTransitionZoom') }}
          </TxSelectItem>
        </TuffBlockSelect>

        <!-- CoreBox window resize animation switch (Beta) -->
        <TuffBlockSwitch
          v-model="appSetting.animation.coreBoxResize"
          :title="t('themeStyle.coreBoxResize')"
          :description="t('themeStyle.coreBoxResizeDesc')"
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
          :title="t('themeStyle.lowBatteryMode')"
          :description="t('themeStyle.lowBatteryModeDesc')"
        />
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

    <Teleport to="body">
      <div v-if="windowPreferenceLoading" class="ThemeStyle-WindowLoadingMask">
        <div class="ThemeStyle-WindowLoadingPanel">
          <TxSpinner :size="20" />
          <span>{{ t('themeStyle.windowSwitching') }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<!--
  ThemeStyle Component Styles

  CSS styles for different window themes and effects.
-->
<style>
.ThemeStyle-Page {
  height: 100%;
}

/** Refraction theme styles */
.refraction,
.Mica {
  filter: blur(16px) saturate(180%) brightness(1.125);
}

/** Pure theme styles */
.pure,
.Default {
  filter: saturate(180%);
}

/** Filter theme styles */
.filter,
.Filter {
  filter: blur(5px) saturate(180%);
}
</style>

<style lang="scss" scoped>
.theme-style-hint-btn {
  min-width: 20px;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 999px;
  color: var(--tx-text-color-secondary);
}

.theme-style-wallpaper-panel {
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color) 82%, transparent);
}

.theme-style-wallpaper-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
  font-size: 12px;
}

.theme-style-wallpaper-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.theme-style-wallpaper-preview {
  margin-top: 12px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
}

.ThemeStyle-WindowLoadingMask {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
}

.ThemeStyle-WindowLoadingPanel {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  font-size: 13px;
}
</style>
