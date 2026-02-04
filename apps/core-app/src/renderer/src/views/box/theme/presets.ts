import type { CoreBoxThemeConfig } from '@talex-touch/utils'

export const coreBoxThemePresets: Record<string, CoreBoxThemeConfig> = {
  default: {
    preset: 'default',
    logo: { position: 'left', size: 24, style: 'default' },
    input: { border: 'bottom', radius: 8, background: 'transparent' },
    results: { itemRadius: 6, itemPadding: 8, divider: false, hoverStyle: 'background' },
    container: { radius: 0, shadow: 'none', border: false }
  },
  rounded: {
    preset: 'rounded',
    logo: { position: 'left', size: 28, style: 'rounded' },
    input: { border: 'full', radius: 12, background: 'subtle' },
    results: { itemRadius: 10, itemPadding: 10, divider: true, hoverStyle: 'background' },
    container: { radius: 12, shadow: 'sm', border: false }
  },
  minimal: {
    preset: 'minimal',
    logo: { position: 'hidden', size: 0, style: 'default' },
    input: { border: 'none', radius: 0, background: 'transparent' },
    results: { itemRadius: 0, itemPadding: 6, divider: false, hoverStyle: 'border' },
    container: { radius: 0, shadow: 'none', border: false }
  },
  logoRight: {
    preset: 'logoRight',
    logo: { position: 'right', size: 24, style: 'default' },
    input: { border: 'bottom', radius: 8, background: 'transparent' },
    results: { itemRadius: 6, itemPadding: 8, divider: false, hoverStyle: 'background' },
    container: { radius: 0, shadow: 'none', border: false }
  }
}

export function getCoreBoxThemePreset(key: string): CoreBoxThemeConfig {
  return coreBoxThemePresets[key] ?? coreBoxThemePresets.default
}
