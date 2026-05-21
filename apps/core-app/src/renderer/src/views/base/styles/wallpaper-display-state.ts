import type { WallpaperSource } from '~/modules/layout/wallpaper-state'

export function getWallpaperSourceHintKey(options: {
  source: WallpaperSource
  desktopPath?: string
  folderPath?: string
  folderRandom?: boolean
}): string {
  const desktopPath = options.desktopPath?.trim() ?? ''
  const folderPath = options.folderPath?.trim() ?? ''

  if (options.source === 'auto') {
    return desktopPath
      ? 'themeStyle.autoWallpaperDesktopReady'
      : 'themeStyle.autoWallpaperBingFallback'
  }

  if (options.source === 'desktop') {
    return desktopPath ? 'themeStyle.desktopWallpaperReady' : 'themeStyle.desktopWallpaperPending'
  }

  if (options.source === 'folder' && folderPath) {
    return options.folderRandom === false
      ? 'themeStyle.folderSequentialMode'
      : 'themeStyle.folderRandomMode'
  }

  return ''
}
