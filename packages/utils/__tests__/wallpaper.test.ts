import { describe, expect, it } from 'vitest'
import {
  WALLPAPER_IMAGE_EXTENSIONS,
  isSupportedWallpaperImageExtension,
  isSupportedWallpaperImagePath,
  normalizeWallpaperImageExtension,
} from '../common'

describe('wallpaper helpers', () => {
  it('normalizes wallpaper image extensions', () => {
    expect(normalizeWallpaperImageExtension(' .JPG ')).toBe('jpg')
    expect(normalizeWallpaperImageExtension('..avif')).toBe('avif')
  })

  it('accepts every configured wallpaper image extension', () => {
    for (const extension of WALLPAPER_IMAGE_EXTENSIONS) {
      expect(isSupportedWallpaperImageExtension(extension)).toBe(true)
      expect(isSupportedWallpaperImagePath(`/wallpapers/sample.${extension}`)).toBe(true)
      expect(isSupportedWallpaperImagePath(`/wallpapers/sample.${extension.toUpperCase()}`)).toBe(
        true
      )
    }
  })

  it('rejects unsupported wallpaper image paths', () => {
    expect(isSupportedWallpaperImagePath('/wallpapers/sample.txt')).toBe(false)
    expect(isSupportedWallpaperImagePath('/wallpapers/sample')).toBe(false)
    expect(isSupportedWallpaperImagePath('/wallpapers/sample.')).toBe(false)
  })

  it('ignores query and hash suffixes when checking paths', () => {
    expect(isSupportedWallpaperImagePath('/wallpapers/sample.avif?size=large')).toBe(true)
    expect(isSupportedWallpaperImagePath('/wallpapers/sample.bmp#preview')).toBe(true)
  })
})
