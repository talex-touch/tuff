import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { useNetworkSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { toast } from 'vue-sonner'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  hasConfiguredWallpaperSource,
  normalizeWallpaperBackground,
  resolveCustomWallpaperPath,
  resolveFolderWallpaperPath
} from './wallpaper-state'
import { appSetting } from '~/modules/storage/app-storage'
import { normalizeWindowPreference, themeStyle } from '~/modules/storage/theme-style'
import { createRendererLogger } from '~/utils/renderer-log'
import { buildTfileUrl } from '~/utils/tfile-url'

const wallpaperLog = createRendererLogger('Wallpaper')

const listImagesEvent = defineRawEvent<
  { folderPath: string; recursive?: boolean },
  { images: string[] }
>('wallpaper:list-images')
const getDesktopEvent = defineRawEvent<void, { path: string | null; error?: string }>(
  'wallpaper:get-desktop'
)

const FOLDER_ROTATION_TASK = 'wallpaper.folder.rotate'
const DESKTOP_WALLPAPER_REFRESH_TASK = 'wallpaper.desktop.refresh'

function resolveWallpaperUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http') || pathOrUrl.startsWith('data:')) return pathOrUrl
  return buildTfileUrl(pathOrUrl)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

export function useWallpaper() {
  const transport = useTuffTransport()
  const networkSdk = useNetworkSdk()
  const pollingService = PollingService.getInstance()
  const { t } = useI18n()

  const activeImagePath = ref('')
  const folderImages = ref<string[]>([])
  const folderIndex = ref(-1)
  const desktopPath = ref('')
  const bingUrl = ref('')
  const lastBingFetch = ref<number | null>(null)
  const lastDesktopErrorToast = ref('')
  const lastFolderEmptyToast = ref('')

  const background = computed(() => {
    return normalizeWallpaperBackground(appSetting.background)
  })

  const wallpaperActive = computed(() => {
    if (background.value.source === 'auto' || background.value.source === 'bing') {
      return Boolean(activeImagePath.value)
    }
    if (background.value.source === 'desktop') {
      return Boolean(activeImagePath.value || desktopPath.value || background.value.desktopPath)
    }
    return hasConfiguredWallpaperSource(background.value)
  })

  const wallpaperStyle = computed(() => {
    if (!wallpaperActive.value) return {}
    const url = resolveWallpaperUrl(activeImagePath.value)
    if (!url) return {}
    const isPure = normalizeWindowPreference(themeStyle.value.theme.window) === 'pure'
    const blur = Math.max(0, background.value.blur + (isPure ? 0 : 2))
    const opacity = Math.max(0, Math.min(1, (background.value.opacity / 100) * (isPure ? 1 : 0.85)))
    const filter = `blur(${blur}px) brightness(${background.value.filter.brightness}%) contrast(${background.value.filter.contrast}%) saturate(${background.value.filter.saturate}%)`
    return {
      backgroundImage: `url("${url}")`,
      opacity,
      filter
    }
  })

  async function ensureBingWallpaper(): Promise<boolean> {
    const now = Date.now()
    if (bingUrl.value && lastBingFetch.value && now - lastBingFetch.value < 12 * 60 * 60 * 1000) {
      return true
    }
    try {
      const response = await networkSdk.request<{ images?: Array<{ url?: string }> }>({
        method: 'GET',
        url: 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1'
      })
      const data = response.data
      const url = data?.images?.[0]?.url
      if (typeof url === 'string') {
        bingUrl.value = `https://www.bing.com${url}`
        lastBingFetch.value = now
        return true
      }
    } catch {
      wallpaperLog.warn('Failed to fetch Bing wallpaper.')
    }
    return false
  }

  async function refreshDesktopWallpaper(options?: { silentError?: boolean }): Promise<boolean> {
    try {
      const result = await transport.send(getDesktopEvent)
      if (result?.error) {
        wallpaperLog.warn('Failed to refresh desktop wallpaper:', result.error)
        if (!options?.silentError && lastDesktopErrorToast.value !== result.error) {
          toast.error(result.error)
          lastDesktopErrorToast.value = result.error
        }
      }
      const path = result?.path ?? ''
      desktopPath.value = path
      if (appSetting.background) {
        appSetting.background.desktopPath = path
      }
      if (path) {
        lastDesktopErrorToast.value = ''
      }
      return Boolean(path)
    } catch (error) {
      const message = toErrorMessage(error)
      wallpaperLog.warn('Failed to refresh desktop wallpaper:', message)
      if (!options?.silentError && lastDesktopErrorToast.value !== message) {
        toast.error(message)
        lastDesktopErrorToast.value = message
      }
      return false
    }
  }

  async function loadFolderImages(path: string): Promise<void> {
    if (!path) {
      folderImages.value = []
      return
    }
    try {
      const result = await transport.send(listImagesEvent, { folderPath: path, recursive: true })
      folderImages.value = (result?.images ?? []).sort((left, right) => left.localeCompare(right))
      folderIndex.value = -1
    } catch (error) {
      folderImages.value = []
      folderIndex.value = -1
      wallpaperLog.warn('Failed to load folder wallpapers:', toErrorMessage(error))
    }
  }

  function stopFolderRotation(): void {
    if (pollingService.isRegistered(FOLDER_ROTATION_TASK)) {
      pollingService.unregister(FOLDER_ROTATION_TASK)
    }
  }

  function stopDesktopWallpaperRefresh(): void {
    if (pollingService.isRegistered(DESKTOP_WALLPAPER_REFRESH_TASK)) {
      pollingService.unregister(DESKTOP_WALLPAPER_REFRESH_TASK)
    }
  }

  function pickNextFolderImage(): void {
    if (folderImages.value.length === 0) {
      activeImagePath.value = ''
      return
    }
    if (background.value.folderRandom) {
      const index = Math.floor(Math.random() * folderImages.value.length)
      activeImagePath.value = folderImages.value[index]
      return
    }
    const nextIndex =
      folderIndex.value < 0 ? 0 : (folderIndex.value + 1) % folderImages.value.length
    folderIndex.value = nextIndex
    activeImagePath.value = folderImages.value[nextIndex]
  }

  function startFolderRotation(): void {
    stopFolderRotation()
    const interval = Math.max(5, background.value.folderIntervalMinutes)
    pollingService.register(FOLDER_ROTATION_TASK, () => pickNextFolderImage(), {
      interval,
      unit: 'minutes',
      runImmediately: true
    })
    pollingService.start()
  }

  function startDesktopWallpaperRefresh(): void {
    stopDesktopWallpaperRefresh()
    pollingService.register(
      DESKTOP_WALLPAPER_REFRESH_TASK,
      async () => {
        await refreshDesktopWallpaper({ silentError: true })
      },
      {
        interval: 5,
        unit: 'minutes',
        initialDelayMs: 5 * 60 * 1000,
        lane: 'maintenance',
        backpressure: 'coalesce',
        timeoutMs: 5000
      }
    )
    pollingService.start()
  }

  async function applyBingWallpaper(): Promise<void> {
    await ensureBingWallpaper()
    activeImagePath.value = bingUrl.value
  }

  async function applyDesktopWallpaper(options?: {
    silentError?: boolean
    forceRefresh?: boolean
  }): Promise<boolean> {
    if (!desktopPath.value && background.value.desktopPath) {
      desktopPath.value = background.value.desktopPath
    }
    if (options?.forceRefresh || !desktopPath.value) {
      await refreshDesktopWallpaper({ silentError: options?.silentError })
    }
    activeImagePath.value = desktopPath.value || background.value.desktopPath
    return Boolean(activeImagePath.value)
  }

  async function applyAutoWallpaper(): Promise<void> {
    const hasDesktop = await applyDesktopWallpaper({ silentError: true, forceRefresh: true })
    if (hasDesktop) {
      return
    }
    await applyBingWallpaper()
  }

  watch(
    () => [
      background.value.source,
      background.value.customPath,
      background.value.folderPath,
      background.value.folderIntervalMinutes,
      background.value.folderRandom,
      background.value.library.enabled,
      background.value.library.fileStoredPath,
      background.value.library.folderStoredPath,
      background.value.desktopPath
    ],
    async () => {
      stopFolderRotation()
      stopDesktopWallpaperRefresh()
      activeImagePath.value = ''
      folderIndex.value = -1

      if (background.value.source === 'none') {
        return
      }

      if (background.value.source === 'auto') {
        startDesktopWallpaperRefresh()
        await applyAutoWallpaper()
        return
      }

      if (background.value.source === 'bing') {
        await applyBingWallpaper()
        return
      }

      if (background.value.source === 'desktop') {
        startDesktopWallpaperRefresh()
        await applyDesktopWallpaper({ forceRefresh: true })
        return
      }

      if (background.value.source === 'custom') {
        activeImagePath.value = resolveCustomWallpaperPath(background.value)
        return
      }

      if (background.value.source === 'folder') {
        const folderPath = resolveFolderWallpaperPath(background.value)
        await loadFolderImages(folderPath)
        if (folderImages.value.length === 0) {
          wallpaperLog.warn('No images found for folder wallpaper source.', {
            folderPath
          })
          const toastKey = folderPath.trim()
          if (toastKey && lastFolderEmptyToast.value !== toastKey) {
            toast.warning(
              t('themeStyle.folderNoImages', 'No images found in the selected wallpaper folder.')
            )
            lastFolderEmptyToast.value = toastKey
          }
          return
        }
        lastFolderEmptyToast.value = ''
        startFolderRotation()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopFolderRotation()
    stopDesktopWallpaperRefresh()
  })

  return {
    wallpaperActive,
    wallpaperStyle,
    activeImagePath
  }
}
