export const WALLPAPER_SOURCES = ['auto', 'none', 'bing', 'custom', 'folder', 'desktop'] as const

export type WallpaperSource = (typeof WALLPAPER_SOURCES)[number]

export const DEFAULT_WALLPAPER_FILTER = {
  brightness: 100,
  contrast: 100,
  saturate: 100
}

export interface WallpaperBackgroundState {
  source: WallpaperSource
  customPath: string
  folderPath: string
  folderIntervalMinutes: number
  folderRandom: boolean
  blur: number
  opacity: number
  filter: {
    brightness: number
    contrast: number
    saturate: number
  }
  desktopPath: string
  library: {
    enabled: boolean
    fileStoredPath: string
    folderStoredPath: string
  }
  sync: {
    enabled: boolean
  }
}

export function normalizeWallpaperSource(value: unknown): WallpaperSource {
  if (value === undefined || value === null || value === '') {
    return 'auto'
  }
  return WALLPAPER_SOURCES.includes(value as WallpaperSource) ? (value as WallpaperSource) : 'none'
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeWallpaperBackground(value: unknown): WallpaperBackgroundState {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const rawFilter =
    typeof raw.filter === 'object' && raw.filter !== null
      ? (raw.filter as Record<string, unknown>)
      : {}
  const rawLibrary =
    typeof raw.library === 'object' && raw.library !== null
      ? (raw.library as Record<string, unknown>)
      : {}
  const rawSync =
    typeof raw.sync === 'object' && raw.sync !== null ? (raw.sync as Record<string, unknown>) : {}

  return {
    source: normalizeWallpaperSource(raw.source),
    customPath: normalizeString(raw.customPath),
    folderPath: normalizeString(raw.folderPath),
    folderIntervalMinutes: normalizeNumber(raw.folderIntervalMinutes, 30),
    folderRandom: raw.folderRandom !== false,
    blur: normalizeNumber(raw.blur, 0),
    opacity: normalizeNumber(raw.opacity, 100),
    filter: {
      brightness: normalizeNumber(rawFilter.brightness, DEFAULT_WALLPAPER_FILTER.brightness),
      contrast: normalizeNumber(rawFilter.contrast, DEFAULT_WALLPAPER_FILTER.contrast),
      saturate: normalizeNumber(rawFilter.saturate, DEFAULT_WALLPAPER_FILTER.saturate)
    },
    desktopPath: normalizeString(raw.desktopPath),
    library: {
      enabled: Boolean(rawLibrary.enabled),
      fileStoredPath: normalizeString(rawLibrary.fileStoredPath),
      folderStoredPath: normalizeString(rawLibrary.folderStoredPath)
    },
    sync: {
      enabled: Boolean(rawSync.enabled)
    }
  }
}

export function resolveCustomWallpaperPath(background: WallpaperBackgroundState): string {
  return background.library.enabled
    ? background.library.fileStoredPath || background.customPath
    : background.customPath
}

export function resolveFolderWallpaperPath(background: WallpaperBackgroundState): string {
  return background.library.enabled
    ? background.library.folderStoredPath || background.folderPath
    : background.folderPath
}

export function hasConfiguredWallpaperSource(
  background: WallpaperBackgroundState,
  source: WallpaperSource = background.source
): boolean {
  if (source === 'none') return false
  if (source === 'auto' || source === 'bing') return true
  if (source === 'custom') return resolveCustomWallpaperPath(background).length > 0
  if (source === 'folder') return resolveFolderWallpaperPath(background).length > 0
  if (source === 'desktop') return background.desktopPath.length > 0
  return false
}
