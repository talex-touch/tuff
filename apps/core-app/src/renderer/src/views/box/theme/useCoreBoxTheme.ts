import type { CoreBoxCanvasConfig, CoreBoxCanvasItem, CoreBoxThemeConfig } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils'
import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { computed } from 'vue'
import { getCoreBoxThemePreset } from './presets'

function normalizeCoreBoxCanvasConfig(value: unknown): CoreBoxCanvasConfig {
  const fallback = appSettingOriginData.coreBoxCanvasConfig
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const parsed = value as Partial<CoreBoxCanvasConfig>
  if (!Array.isArray(parsed.items)) {
    return fallback
  }

  const columns = Math.max(4, Math.min(24, Number(parsed.columns) || fallback.columns))
  const rowHeight = Math.max(12, Math.min(96, Number(parsed.rowHeight) || fallback.rowHeight))
  const gap = Math.max(0, Math.min(24, Number(parsed.gap) || fallback.gap))

  const items = parsed.items.map((item) => {
    const current = item as CoreBoxCanvasItem
    const width = Math.max(1, Number(current.w) || 1)
    const height = Math.max(1, Number(current.h) || 1)

    return {
      ...current,
      x: Math.max(0, Math.min(columns - width, Number(current.x) || 0)),
      y: Math.max(0, Number(current.y) || 0),
      w: width,
      h: height
    }
  })

  return {
    enabled: parsed.enabled === true,
    preset: parsed.preset || fallback.preset,
    columns,
    rowHeight,
    gap,
    items,
    colorVars: parsed.colorVars,
    customCSS: parsed.customCSS
  }
}

export function useCoreBoxTheme() {
  const themeConfig = computed<CoreBoxThemeConfig>(() => {
    const saved = appSettingsData?.coreBoxThemeConfig
    if (saved?.preset === 'custom') return saved
    const key = saved?.preset ?? 'default'
    return getCoreBoxThemePreset(key)
  })

  const canvasConfig = computed<CoreBoxCanvasConfig>(() => {
    return normalizeCoreBoxCanvasConfig(
      appSettingsData?.coreBoxCanvasConfig ?? appSettingOriginData.coreBoxCanvasConfig
    )
  })

  const canvasEnabled = computed(() => canvasConfig.value.enabled === true)

  const themeCSSVars = computed(() => {
    const t = themeConfig.value
    const shadowMap = {
      none: 'none',
      sm: '0 1px 3px rgba(0,0,0,0.08)',
      md: '0 4px 12px rgba(0,0,0,0.1)',
      lg: '0 8px 24px rgba(0,0,0,0.12)'
    } as const

    return {
      '--corebox-logo-size': `${t.logo.size}px`,
      '--corebox-logo-position': t.logo.position,
      '--corebox-input-radius': `${t.input.radius}px`,
      '--corebox-input-border': t.input.border,
      '--corebox-input-bg': t.input.background,
      '--corebox-result-radius': `${t.results.itemRadius}px`,
      '--corebox-result-padding': `${t.results.itemPadding}px`,
      '--corebox-result-divider': t.results.divider
        ? '1px solid var(--el-border-color-lighter)'
        : 'none',
      '--corebox-result-hover': t.results.hoverStyle,
      '--corebox-container-radius': `${t.container.radius}px`,
      '--corebox-container-shadow': shadowMap[t.container.shadow],
      '--corebox-container-border': t.container.border
        ? '1px solid var(--el-border-color-lighter)'
        : 'none'
    } as Record<string, string>
  })

  return {
    themeConfig,
    canvasConfig,
    canvasEnabled,
    themeCSSVars
  }
}
