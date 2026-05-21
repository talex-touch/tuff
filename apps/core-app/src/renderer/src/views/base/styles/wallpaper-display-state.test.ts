import { describe, expect, it } from 'vitest'
import { getWallpaperSourceHintKey } from './wallpaper-display-state'

describe('wallpaper display state', () => {
  it('explains auto wallpaper desktop-first behavior', () => {
    expect(getWallpaperSourceHintKey({ source: 'auto' })).toBe(
      'themeStyle.autoWallpaperBingFallback'
    )
    expect(getWallpaperSourceHintKey({ source: 'auto', desktopPath: '/desktop.jpg' })).toBe(
      'themeStyle.autoWallpaperDesktopReady'
    )
  })

  it('reports desktop wallpaper readiness', () => {
    expect(getWallpaperSourceHintKey({ source: 'desktop' })).toBe(
      'themeStyle.desktopWallpaperPending'
    )
    expect(getWallpaperSourceHintKey({ source: 'desktop', desktopPath: '/desktop.jpg' })).toBe(
      'themeStyle.desktopWallpaperReady'
    )
  })

  it('reports selected folder rotation mode only after a folder is configured', () => {
    expect(getWallpaperSourceHintKey({ source: 'folder', folderRandom: true })).toBe('')
    expect(
      getWallpaperSourceHintKey({
        source: 'folder',
        folderPath: '/wallpapers',
        folderRandom: true
      })
    ).toBe('themeStyle.folderRandomMode')
    expect(
      getWallpaperSourceHintKey({
        source: 'folder',
        folderPath: '/wallpapers',
        folderRandom: false
      })
    ).toBe('themeStyle.folderSequentialMode')
  })
})
