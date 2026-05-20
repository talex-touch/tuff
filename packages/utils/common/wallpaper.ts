export const WALLPAPER_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
] as const

export type WallpaperImageExtension = (typeof WALLPAPER_IMAGE_EXTENSIONS)[number]

const WALLPAPER_IMAGE_EXTENSION_SET = new Set<string>(WALLPAPER_IMAGE_EXTENSIONS)

export function normalizeWallpaperImageExtension(value: string): string {
  return value.trim().replace(/^\.+/, '').toLowerCase()
}

export function isSupportedWallpaperImageExtension(
  value: string
): value is WallpaperImageExtension {
  return WALLPAPER_IMAGE_EXTENSION_SET.has(normalizeWallpaperImageExtension(value))
}

export function isSupportedWallpaperImagePath(filePath: string): boolean {
  const cleanPath = filePath.split(/[?#]/, 1)[0] ?? ''
  const fileName = cleanPath.split(/[\\/]/).pop() ?? cleanPath
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return false
  }

  return isSupportedWallpaperImageExtension(fileName.slice(dotIndex + 1))
}
