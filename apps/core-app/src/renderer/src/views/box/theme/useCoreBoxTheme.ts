import type { CoreBoxThemeConfig } from '@talex-touch/utils'
import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { computed } from 'vue'
import { getCoreBoxThemePreset } from './presets'

export function useCoreBoxTheme() {
  const themeConfig = computed<CoreBoxThemeConfig>(() => {
    const saved = appSettingsData?.coreBoxThemeConfig
    if (saved?.preset === 'custom') return saved
    const key = saved?.preset ?? 'default'
    return getCoreBoxThemePreset(key)
  })

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

  return { themeConfig, themeCSSVars }
}
