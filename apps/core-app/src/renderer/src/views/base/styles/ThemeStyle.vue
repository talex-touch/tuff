<script name="ThemeStyle" lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRadio, TxRadioGroup } from '@talex-touch/tuffex/radio'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { WALLPAPER_IMAGE_EXTENSIONS } from '@talex-touch/utils/common/wallpaper'
import { useTuffTransport } from '@talex-touch/utils/transport'

import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
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
import CoreBoxCanvasSection from './CoreBoxCanvasSection.vue'
import SectionItem from './SectionItem.vue'
import { getWallpaperSourceHintKey } from './wallpaper-display-state'

import WindowSectionVue from './WindowSection.vue'

const { t } = useI18n()

/**
 * Mounted inside `SettingsPage` when it backs the appearance category, which already supplies the
 * heading, scroll container and edge fades. Rendering its own `ViewTemplate` there would stack two
 * headings and two scrollers on one body.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const shell = computed(() => (props.embedded ? 'div' : ViewTemplate))
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
/**
 * Every row of the 壁纸 group is conditional on the selected source, so the group itself has to
 * disappear as well — an empty hairline card is worse than no card.
 */
const showWallpaperGroup = computed(
  () =>
    Boolean(wallpaperSourceHint.value) ||
    isCustomSource.value ||
    isFolderSource.value ||
    isDesktopSource.value ||
    wallpaperAdjustable.value
)
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
    <component :is="shell" v-bind="embedded ? {} : { title: t('themeStyle.styles') }">
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

      <CoreBoxCanvasSection />

      <TuffGroupBlock
        :name="t('themeStyle.personalized')"
        :description="t('themeStyle.personalizedDesc')"
      >
        <TuffBlockSelect
          v-model="styleValue"
          :title="t('themeStyle.colorStyle')"
          :description="t('themeStyle.colorStyleDesc')"
          @change="handleThemeChange"
        >
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
          <!-- Kept as the only row icon on the page: it is the save indicator, not decoration. -->
          <template #icon>
            <TxSpinner v-if="bgSaving" :size="14" />
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

        <template v-if="wallpaperAdjustable">
          <TuffBlockSlot :title="t('themeStyle.blur')" :description="t('themeStyle.blurDesc')">
            <div class="ThemeStyle-Slider">
              <div class="ThemeStyle-SliderTrack">
                <TxSlider
                  v-model="bgBlur"
                  :min="0"
                  :max="20"
                  :step="1"
                  :aria-label="t('themeStyle.blur')"
                />
              </div>
              <span class="ThemeStyle-SliderValue">{{ bgBlur }}px</span>
            </div>
          </TuffBlockSlot>

          <TuffBlockSlot
            :title="t('themeStyle.opacity')"
            :description="t('themeStyle.opacityDesc')"
          >
            <div class="ThemeStyle-Slider">
              <div class="ThemeStyle-SliderTrack">
                <TxSlider
                  v-model="bgOpacity"
                  :min="10"
                  :max="100"
                  :step="1"
                  :aria-label="t('themeStyle.opacity')"
                />
              </div>
              <span class="ThemeStyle-SliderValue">{{ bgOpacity }}%</span>
            </div>
          </TuffBlockSlot>
        </template>
      </TuffGroupBlock>

      <!--
        Wallpaper detail rows. The artboard only draws the four 个性化 rows above, so everything
        that depends on the chosen source lives here in the same row language instead of in the
        nested bordered panels this page used to grow.
      -->
      <TuffGroupBlock
        v-if="showWallpaperGroup"
        :name="t('themeStyle.wallpaperGroup')"
        :description="t('themeStyle.wallpaperGroupDesc')"
      >
        <div v-if="wallpaperSourceHint" class="ThemeStyle-HintRow">
          <span class="i-ri-information-line" />
          <span>{{ wallpaperSourceHint }}</span>
        </div>

        <template v-if="isCustomSource">
          <TuffBlockSlot
            class="ThemeStyle-PathRow"
            :title="t('themeStyle.customBackgroundImage', 'Custom Background Image')"
            :description="customBgPath || t('themeStyle.noImageSelected', 'No image selected')"
          >
            <TxButton variant="bare" class="ThemeStyle-Action" @click="selectBackgroundImage">
              {{ t('themeStyle.selectImage', 'Select') }}
            </TxButton>
            <TxButton
              v-if="customBgPath"
              variant="bare"
              class="ThemeStyle-Action ThemeStyle-Action--danger"
              @click="clearBackgroundImage"
            >
              {{ t('themeStyle.clearImage', 'Clear') }}
            </TxButton>
          </TuffBlockSlot>

          <div v-if="customBgPath" class="ThemeStyle-PreviewRow">
            <img
              class="ThemeStyle-Preview"
              :src="customBgPreviewUrl"
              :style="{
                filter: `blur(${bgBlur}px) brightness(${bgBrightness}%) contrast(${bgContrast}%) saturate(${bgSaturate}%)`,
                opacity: bgOpacity / 100
              }"
            />
          </div>
        </template>

        <template v-if="isFolderSource">
          <TuffBlockSlot
            class="ThemeStyle-PathRow"
            :title="t('themeStyle.folder')"
            :description="folderBgPath || t('themeStyle.noImageSelected')"
          >
            <TxButton variant="bare" class="ThemeStyle-Action" @click="selectBackgroundFolder">
              {{ t('themeStyle.selectFolder') }}
            </TxButton>
            <TxButton
              v-if="folderBgPath"
              variant="bare"
              class="ThemeStyle-Action ThemeStyle-Action--danger"
              @click="clearBackgroundFolder"
            >
              {{ t('themeStyle.clearFolder') }}
            </TxButton>
          </TuffBlockSlot>

          <template v-if="folderBgPath">
            <TuffBlockSlot
              :title="t('themeStyle.rotationMode')"
              :description="t('themeStyle.folderRotationHint')"
            >
              <TxRadioGroup v-model="folderRotationMode" glass>
                <TxRadio value="random" :label="t('themeStyle.randomRotation')" />
                <TxRadio value="sequential" :label="t('themeStyle.sequentialRotation')" />
              </TxRadioGroup>
            </TuffBlockSlot>

            <TuffBlockSlot :title="t('themeStyle.rotationInterval')">
              <div class="ThemeStyle-Slider">
                <div class="ThemeStyle-SliderTrack">
                  <TxSlider
                    v-model="folderIntervalMinutes"
                    :min="5"
                    :max="240"
                    :step="5"
                    :aria-label="t('themeStyle.rotationInterval')"
                  />
                </div>
                <span class="ThemeStyle-SliderValue">
                  {{ folderIntervalMinutes }}{{ t('themeStyle.minutes') }}
                </span>
              </div>
            </TuffBlockSlot>
          </template>
        </template>

        <TuffBlockSlot
          v-if="isDesktopSource"
          class="ThemeStyle-PathRow"
          :title="t('themeStyle.desktopWallpaper')"
          :description="desktopBgPath || t('themeStyle.noImageSelected')"
        >
          <TxButton variant="bare" class="ThemeStyle-Action" @click="refreshDesktopWallpaper">
            {{ t('themeStyle.refreshDesktopWallpaper') }}
          </TxButton>
        </TuffBlockSlot>

        <template v-if="wallpaperAdjustable">
          <TuffBlockSlot :title="t('themeStyle.brightness')">
            <div class="ThemeStyle-Slider">
              <div class="ThemeStyle-SliderTrack">
                <TxSlider
                  v-model="bgBrightness"
                  :min="50"
                  :max="150"
                  :step="1"
                  :aria-label="t('themeStyle.brightness')"
                />
              </div>
              <span class="ThemeStyle-SliderValue">{{ bgBrightness }}%</span>
            </div>
          </TuffBlockSlot>

          <TuffBlockSlot :title="t('themeStyle.contrast')">
            <div class="ThemeStyle-Slider">
              <div class="ThemeStyle-SliderTrack">
                <TxSlider
                  v-model="bgContrast"
                  :min="50"
                  :max="150"
                  :step="1"
                  :aria-label="t('themeStyle.contrast')"
                />
              </div>
              <span class="ThemeStyle-SliderValue">{{ bgContrast }}%</span>
            </div>
          </TuffBlockSlot>

          <TuffBlockSlot :title="t('themeStyle.saturate')">
            <div class="ThemeStyle-Slider">
              <div class="ThemeStyle-SliderTrack">
                <TxSlider
                  v-model="bgSaturate"
                  :min="50"
                  :max="150"
                  :step="1"
                  :aria-label="t('themeStyle.saturate')"
                />
              </div>
              <span class="ThemeStyle-SliderValue">{{ bgSaturate }}%</span>
            </div>
          </TuffBlockSlot>
        </template>

        <TuffBlockSwitch
          v-if="wallpaperLibrarySupported"
          v-model="libraryEnabled"
          :title="t('themeStyle.copyToLibrary')"
          :description="t('themeStyle.copyToLibraryDesc')"
        >
          <template #tags>
            <TxTooltip
              :content="t('themeStyle.copyToLibraryHint')"
              :anchor="{ placement: 'top', showArrow: true }"
            >
              <TxButton variant="bare" native-type="button" class="ThemeStyle-HintBtn" @click.stop>
                <span class="i-carbon-information text-xs" />
              </TxButton>
            </TxTooltip>
          </template>
        </TuffBlockSwitch>
      </TuffGroupBlock>

      <TuffGroupBlock :name="t('themeStyle.emphasis')" :description="t('themeStyle.emphasisDesc')">
        <TuffBlockSwitch
          v-model="themeStyle.theme.addon.coloring"
          :title="t('themeStyle.coloring')"
          :description="t('themeStyle.coloringDesc')"
        />

        <TuffBlockSwitch
          v-model="themeStyle.theme.addon.contrast"
          :title="t('themeStyle.highContrast')"
          :description="t('themeStyle.highContrastDesc')"
        />

        <!--
          Used to float below the last group with no card of its own. It joins the theme add-on
          group rather than the animation one: both are about the theme, and the artboard pins
          个性化 to exactly four rows.
        -->
        <TuffBlockSwitch
          guidance
          :model-value="false"
          :title="t('themeStyle.themeHelp')"
          :description="t('themeStyle.themeHelpDesc')"
        />
      </TuffGroupBlock>

      <!-- Animation settings group block -->
      <TuffGroupBlock
        :name="t('themeStyle.animationGroupTitle')"
        :description="t('themeStyle.animationGroupDesc')"
      >
        <!-- List item stagger animation switch -->
        <TuffBlockSwitch
          v-model="appSetting.animation.listItemStagger"
          :title="t('themeStyle.listItemStagger')"
          :description="t('themeStyle.listItemStaggerDesc')"
        />

        <!-- Result transition animation switch -->
        <TuffBlockSwitch
          v-model="appSetting.animation.resultTransition"
          :title="t('themeStyle.resultTransition')"
          :description="t('themeStyle.resultTransitionDesc')"
        />

        <TuffBlockSelect
          v-model="routeTransitionStyle"
          :title="t('themeStyle.routeTransition')"
          :description="t('themeStyle.routeTransitionDesc')"
        >
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
        />

        <TuffBlockSwitch
          v-model="appSetting.animation.autoDisableOnLowBattery"
          :title="t('themeStyle.lowBatteryMode')"
          :description="t('themeStyle.lowBatteryModeDesc')"
        />
      </TuffGroupBlock>
    </component>

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
.ThemeStyle-HintBtn {
  min-width: 20px;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: var(--shell-radius-full);
  color: var(--shell-text-muted);
}

/**
 * Artboard `E0C1Zz` · 窗口模糊 / 窗口透明度: a fixed-width track with the current value pinned
 * to its right, so a column of slider rows reads as one aligned stack.
 */
.ThemeStyle-Slider {
  display: flex;
  align-items: center;
  gap: var(--shell-space-3);
}

.ThemeStyle-SliderTrack {
  width: 160px;
}

.ThemeStyle-SliderValue {
  /* 46 is the artboard's column; a `30 min` reading is allowed to widen it rather than clip. */
  min-width: 46px;
  white-space: nowrap;
  text-align: right;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  font-variant-numeric: tabular-nums;
}

/** Rows whose description is a filesystem path: one line, clipped, never a three-line wrap. */
.ThemeStyle-PathRow :deep(p) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ThemeStyle-HintRow {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  padding: 12px 16px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.ThemeStyle-PreviewRow {
  padding: 12px 16px;
}

.ThemeStyle-Preview {
  display: block;
  width: 100%;
  height: 96px;
  object-fit: cover;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
}

/** Same hairline-outlined button as the artboard's `Btn 编辑` / `Btn 选择目录`. */
.ThemeStyle-Action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
}

.ThemeStyle-Action--danger {
  border-color: var(--shell-danger-border);
  color: var(--shell-danger);
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
