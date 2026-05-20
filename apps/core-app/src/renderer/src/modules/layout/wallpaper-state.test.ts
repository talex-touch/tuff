import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WALLPAPER_FILTER,
  hasConfiguredWallpaperSource,
  normalizeWallpaperBackground,
  normalizeWallpaperSource,
  resolveCustomWallpaperPath,
  resolveFolderWallpaperPath
} from './wallpaper-state'

describe('wallpaper state', () => {
  it('normalizes absent wallpaper source to auto', () => {
    expect(normalizeWallpaperSource(undefined)).toBe('auto')
    expect(normalizeWallpaperSource(null)).toBe('auto')
    expect(normalizeWallpaperSource('')).toBe('auto')
  })

  it('normalizes unsupported wallpaper source to none', () => {
    expect(normalizeWallpaperSource('remote')).toBe('none')
  })

  it('fills partial background state with production defaults', () => {
    const normalized = normalizeWallpaperBackground({
      source: 'folder',
      folderPath: '/wallpapers',
      filter: {
        brightness: 88
      }
    })

    expect(normalized).toMatchObject({
      source: 'folder',
      customPath: '',
      folderPath: '/wallpapers',
      folderIntervalMinutes: 30,
      folderRandom: true,
      blur: 0,
      opacity: 100,
      filter: {
        brightness: 88,
        contrast: DEFAULT_WALLPAPER_FILTER.contrast,
        saturate: DEFAULT_WALLPAPER_FILTER.saturate
      },
      desktopPath: '',
      library: {
        enabled: false,
        fileStoredPath: '',
        folderStoredPath: ''
      },
      sync: {
        enabled: false
      }
    })
  })

  it('keeps explicit folder random false', () => {
    expect(normalizeWallpaperBackground({ folderRandom: false }).folderRandom).toBe(false)
  })

  it('prefers stored library paths when enabled', () => {
    const background = normalizeWallpaperBackground({
      source: 'custom',
      customPath: '/source/a.png',
      folderPath: '/source/folder',
      library: {
        enabled: true,
        fileStoredPath: '/library/a.png',
        folderStoredPath: '/library/folder'
      }
    })

    expect(resolveCustomWallpaperPath(background)).toBe('/library/a.png')
    expect(resolveFolderWallpaperPath(background)).toBe('/library/folder')
  })

  it('falls back to selected paths when library is empty', () => {
    const background = normalizeWallpaperBackground({
      source: 'custom',
      customPath: '/source/a.png',
      folderPath: '/source/folder',
      library: {
        enabled: true
      }
    })

    expect(resolveCustomWallpaperPath(background)).toBe('/source/a.png')
    expect(resolveFolderWallpaperPath(background)).toBe('/source/folder')
  })

  it('reports whether a wallpaper source is usable', () => {
    const background = normalizeWallpaperBackground({
      source: 'custom',
      customPath: '/source/a.png',
      folderPath: '/source/folder',
      desktopPath: '/desktop/a.png'
    })

    expect(hasConfiguredWallpaperSource(background, 'auto')).toBe(true)
    expect(hasConfiguredWallpaperSource(background, 'bing')).toBe(true)
    expect(hasConfiguredWallpaperSource(background, 'none')).toBe(false)
    expect(hasConfiguredWallpaperSource(background, 'custom')).toBe(true)
    expect(hasConfiguredWallpaperSource(background, 'folder')).toBe(true)
    expect(hasConfiguredWallpaperSource(background, 'desktop')).toBe(true)
  })

  it('requires paths for local wallpaper sources', () => {
    const background = normalizeWallpaperBackground({
      source: 'custom'
    })

    expect(hasConfiguredWallpaperSource(background, 'custom')).toBe(false)
    expect(hasConfiguredWallpaperSource(background, 'folder')).toBe(false)
    expect(hasConfiguredWallpaperSource(background, 'desktop')).toBe(false)
  })
})
