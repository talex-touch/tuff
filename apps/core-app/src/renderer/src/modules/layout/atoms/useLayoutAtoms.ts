import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { computed } from 'vue'
import { getLayoutAtomPreset, isLayoutPresetKey } from './presets'
import type { LayoutAtomConfig } from '@talex-touch/utils'

/**
 * Returns the effective layout atom config for the current layout.
 * Uses preset when layout name is a preset key, otherwise uses saved layoutAtomConfig.
 */
export function useLayoutAtoms() {
  const currentLayoutName = computed(() => appSettingsData?.layout ?? 'simple')

  const atomConfig = computed<LayoutAtomConfig | undefined>(() => {
    const name = currentLayoutName.value
    const saved = appSettingsData?.layoutAtomConfig
    if (isLayoutPresetKey(name)) {
      return getLayoutAtomPreset(name)
    }
    if (saved?.preset === 'custom') {
      return saved
    }
    return saved ?? getLayoutAtomPreset('simple')
  })

  return { atomConfig, currentLayoutName }
}
