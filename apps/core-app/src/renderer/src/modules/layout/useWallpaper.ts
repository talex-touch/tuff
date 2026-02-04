import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { themeStyle } from '~/modules/storage/theme-style'

type WallpaperSource = 'none' | 'bing' | 'custom' | 'folder' | 'desktop'

const listImagesEvent = defineRawEvent<
  { folderPath: string; recursive?: boolean },
  { images: string[] }
>('wallpaper:list-images')
const getDesktopEvent = defineRawEvent<void, { path: string | null }>('wallpaper:get-desktop')

const FOLDER_ROTATION_TASK = 'wallpaper.folder.rotate'
const DEFAULT_FILTER = { brightness: 100, contrast: 100, saturate: 100 }

function resolveWallpaperUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http') || pathOrUrl.startsWith('data:')) return pathOrUrl
  if (pathOrUrl.startsWith('tfile://')) return pathOrUrl
  return `tfile://${pathOrUrl}`
}

export function useWallpaper() {
  const transport = useTuffTransport()
  const pollingService = PollingService.getInstance()

  const activeImagePath = ref('')
  const folderImages = ref<string[]>([])
  const folderIndex = ref(0)
  const desktopPath = ref('')
  const bingUrl = ref('')
  const lastBingFetch = ref<number | null>(null)

  const background = computed(() => {
    const raw = appSetting.background ?? {}
    return {
      source: (raw.source ?? 'none') as WallpaperSource,
      customPath: raw.customPath ?? '',
      folderPath: raw.folderPath ?? '',
      folderIntervalMinutes:
        typeof raw.folderIntervalMinutes === 'number' ? raw.folderIntervalMinutes : 30,
      folderRandom: raw.folderRandom !== false,
      blur: typeof raw.blur === 'number' ? raw.blur : 0,
      opacity: typeof raw.opacity === 'number' ? raw.opacity : 100,
      filter: {
        brightness: raw.filter?.brightness ?? DEFAULT_FILTER.brightness,
        contrast: raw.filter?.contrast ?? DEFAULT_FILTER.contrast,
        saturate: raw.filter?.saturate ?? DEFAULT_FILTER.saturate
      },
      desktopPath: raw.desktopPath ?? '',
      library: {
        enabled: raw.library?.enabled ?? false,
        fileStoredPath: raw.library?.fileStoredPath ?? '',
        folderStoredPath: raw.library?.folderStoredPath ?? ''
      }
    }
  })

  const wallpaperActive = computed(() => {
    if (background.value.source === 'none') return false
    if (background.value.source === 'custom') {
      return Boolean(
        background.value.library.enabled
          ? background.value.library.fileStoredPath || background.value.customPath
          : background.value.customPath
      )
    }
    if (background.value.source === 'folder') {
      return Boolean(
        background.value.library.enabled
          ? background.value.library.folderStoredPath || background.value.folderPath
          : background.value.folderPath
      )
    }
    if (background.value.source === 'desktop') {
      return Boolean(desktopPath.value || background.value.desktopPath)
    }
    return true
  })

  const wallpaperStyle = computed(() => {
    if (!wallpaperActive.value) return {}
    const url = resolveWallpaperUrl(activeImagePath.value)
    if (!url) return {}
    const isDefault = themeStyle.value.theme.window === 'Default'
    const blur = Math.max(0, background.value.blur + (isDefault ? 0 : 2))
    const opacity = Math.max(
      0,
      Math.min(1, (background.value.opacity / 100) * (isDefault ? 1 : 0.85))
    )
    const filter = `blur(${blur}px) brightness(${background.value.filter.brightness}%) contrast(${background.value.filter.contrast}%) saturate(${background.value.filter.saturate}%)`
    return {
      backgroundImage: `url("${url}")`,
      opacity,
      filter
    }
  })

  async function ensureBingWallpaper(): Promise<void> {
    const now = Date.now()
    if (bingUrl.value && lastBingFetch.value && now - lastBingFetch.value < 12 * 60 * 60 * 1000) {
      return
    }
    try {
      const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1')
      const data = await response.json()
      const url = data?.images?.[0]?.url
      if (typeof url === 'string') {
        bingUrl.value = `https://www.bing.com${url}`
        lastBingFetch.value = now
      }
    } catch {
      // ignore network errors
    }
  }

  async function refreshDesktopWallpaper(): Promise<void> {
    try {
      const result = await transport.send(getDesktopEvent)
      const path = result?.path ?? ''
      desktopPath.value = path
      if (appSetting.background) {
        appSetting.background.desktopPath = path
      }
    } catch {
      // ignore
    }
  }

  async function loadFolderImages(path: string): Promise<void> {
    if (!path) {
      folderImages.value = []
      return
    }
    try {
      const result = await transport.send(listImagesEvent, { folderPath: path, recursive: true })
      folderImages.value = result?.images ?? []
    } catch {
      folderImages.value = []
    }
  }

  function stopFolderRotation(): void {
    if (pollingService.isRegistered(FOLDER_ROTATION_TASK)) {
      pollingService.unregister(FOLDER_ROTATION_TASK)
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
    folderIndex.value = (folderIndex.value + 1) % folderImages.value.length
    activeImagePath.value = folderImages.value[folderIndex.value]
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
      activeImagePath.value = ''

      if (background.value.source === 'none') {
        return
      }

      if (background.value.source === 'bing') {
        await ensureBingWallpaper()
        activeImagePath.value = bingUrl.value
        return
      }

      if (background.value.source === 'desktop') {
        if (!desktopPath.value && background.value.desktopPath) {
          desktopPath.value = background.value.desktopPath
        }
        if (!desktopPath.value) {
          await refreshDesktopWallpaper()
        }
        activeImagePath.value = desktopPath.value || background.value.desktopPath
        return
      }

      if (background.value.source === 'custom') {
        activeImagePath.value = background.value.library.enabled
          ? background.value.library.fileStoredPath || background.value.customPath
          : background.value.customPath
        return
      }

      if (background.value.source === 'folder') {
        const folderPath = background.value.library.enabled
          ? background.value.library.folderStoredPath || background.value.folderPath
          : background.value.folderPath
        await loadFolderImages(folderPath)
        startFolderRotation()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopFolderRotation()
  })

  return {
    wallpaperActive,
    wallpaperStyle,
    activeImagePath
  }
}
