<script name="ThemeStyle" lang="ts" setup>
import { TxButton, TxSelectItem, TxSpinner, TxStatusBadge, TxTooltip } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'

import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/channel/storage'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import {
  normalizeWindowPreference,
  themeStyle,
  triggerThemeTransition,
  type ThemeMode,
  type ThemeWindowPreference
} from '~/modules/storage/app-storage'
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

type WallpaperSource = 'none' | 'bing' | 'custom' | 'folder' | 'desktop'
const WALLPAPER_SOURCES: WallpaperSource[] = ['none', 'bing', 'custom', 'folder', 'desktop']
const defaultFilter = { brightness: 100, contrast: 100, saturate: 100 }
let wallpaperSourceSwitchToken = 0

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

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
    const source = (appSetting.background?.source ?? 'none') as WallpaperSource
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
    if (val) {
      void syncWallpaperLibrary()
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
      console.error('[ThemeStyle] Failed to copy wallpaper to library:', {
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
    console.error('[ThemeStyle] Failed to copy wallpaper to library:', error)
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
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
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
    console.error('[ThemeStyle] Failed to select background image:', error)
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
    console.error('[ThemeStyle] Failed to select background folder:', error)
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
      console.error('[ThemeStyle] Failed to refresh desktop wallpaper:', message)
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
    console.error('[ThemeStyle] Failed to refresh desktop wallpaper:', error)
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
    if (source === 'desktop' && !desktopBgPath.value) {
      void refreshDesktopWallpaperInternal({ silentError: true })
    }
  }
)

const bgSaving = computed(() => appSettings.savingState?.value ?? false)
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))
</script>

<template>
  <ViewTemplate :name="t('themeStyle.styles')">
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

      <template v-if="showAdvancedSettings">
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
            {{ t('themeStyle.noBackground') }}
          </TxSelectItem>
          <TxSelectItem :value="1">
            {{ t('themeStyle.bing') }}
          </TxSelectItem>
          <TxSelectItem :value="2">
            {{ t('themeStyle.customImage') }}
          </TxSelectItem>
          <TxSelectItem :value="3">
            {{ t('themeStyle.folder') }}
          </TxSelectItem>
          <TxSelectItem :value="4">
            {{ t('themeStyle.desktopWallpaper') }}
          </TxSelectItem>
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
                <span class="text-black/60 dark:text-white/60">{{
                  t('themeStyle.brightness')
                }}</span>
                <span class="font-medium text-black/80 dark:text-white/80"
                  >{{ bgBrightness }}%</span
                >
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
            <TxTooltip
              v-if="!libraryEnabled"
              :content="t('themeStyle.syncRequiresLibrary')"
              :anchor="{ placement: 'top', showArrow: true }"
            >
              <TxButton
                variant="bare"
                native-type="button"
                class="theme-style-hint-btn theme-style-hint-btn--warning"
                @click.stop
              >
                <span class="i-carbon-warning text-xs" />
              </TxButton>
            </TxTooltip>
          </template>
        </TuffBlockSwitch>
        <TuffBlockSwitch
          v-model="syncEnabled"
          :title="t('themeStyle.syncToCloud')"
          :description="t('themeStyle.syncToCloudDesc')"
          :disabled="!libraryEnabled"
        />
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
</template>

<!--
  ThemeStyle Component Styles

  CSS styles for different window themes and effects.
-->
<style>
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

.theme-style-hint-btn--warning {
  color: var(--tx-color-warning, #f59e0b);
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
