import type {
  DeviceMockupCategory,
  DeviceMockupCategoryMeta,
  DeviceMockupFamily,
  DeviceMockupOrientation,
  DeviceMockupPreset,
  DeviceMockupSize,
  ResolvedDeviceMockupDimensions,
} from './types'
import {
  DEFAULT_DEVICE_MOCKUP_PRESET,
  DEVICE_MOCKUP_CATEGORIES,
  RESPONSIVE_DEVICE_MOCKUP_PRESET,
} from './core-presets'

const PRESET_ALIASES: Readonly<Record<string, string>> = /*#__PURE__*/ Object.freeze({
  'galaxy-z-fold': 'galaxy-z-fold-6',
  'huawei-mate-70-pro': 'harmony-mate',
})

const CATEGORY_MAP = new Map<DeviceMockupCategory, DeviceMockupCategoryMeta>(
  DEVICE_MOCKUP_CATEGORIES.map(meta => [meta.id, meta]),
)

const REGISTRY = new Map<string, DeviceMockupPreset>([
  [DEFAULT_DEVICE_MOCKUP_PRESET.id, DEFAULT_DEVICE_MOCKUP_PRESET],
  [RESPONSIVE_DEVICE_MOCKUP_PRESET.id, RESPONSIVE_DEVICE_MOCKUP_PRESET],
])

const SEARCH_INDEX = new Map<string, string>()
const LISTENERS = new Set<() => void>()
const INFLIGHT_FAMILIES = new Map<DeviceMockupFamily, Promise<readonly DeviceMockupPreset[]>>()

function buildSearchHaystack(preset: DeviceMockupPreset): string {
  const categoryKeywords = CATEGORY_MAP.get(preset.category)?.keywords ?? []
  return [
    preset.id,
    preset.name,
    preset.shortName,
    preset.category,
    preset.formFactor,
    preset.shape ?? '',
    preset.os,
    preset.cutout,
    preset.width > 0 ? `${preset.width}x${preset.height}` : '',
    preset.width > 0 ? `${preset.width}×${preset.height}` : '',
    ...categoryKeywords,
    ...preset.keywords,
  ]
    .join(' ')
    .toLowerCase()
}

SEARCH_INDEX.set(DEFAULT_DEVICE_MOCKUP_PRESET.id, buildSearchHaystack(DEFAULT_DEVICE_MOCKUP_PRESET))
SEARCH_INDEX.set(RESPONSIVE_DEVICE_MOCKUP_PRESET.id, buildSearchHaystack(RESPONSIVE_DEVICE_MOCKUP_PRESET))

function notifyListeners(): void {
  for (const listener of LISTENERS)
    listener()
}

export function subscribeDeviceMockupRegistry(listener: () => void): () => void {
  LISTENERS.add(listener)
  return () => {
    LISTENERS.delete(listener)
  }
}

export function defineDeviceMockupPreset(preset: DeviceMockupPreset): DeviceMockupPreset {
  return Object.freeze({
    ...preset,
    safeArea: Object.freeze({ ...preset.safeArea }),
    keywords: Object.freeze([...preset.keywords]),
  })
}

export function registerDeviceMockupPresets(
  presets: DeviceMockupPreset | readonly DeviceMockupPreset[],
): void {
  const list = Array.isArray(presets) ? presets : [presets]
  let changed = false
  for (const preset of list) {
    if (!preset?.id)
      continue
    if (!REGISTRY.has(preset.id))
      changed = true
    REGISTRY.set(preset.id, preset)
    SEARCH_INDEX.set(preset.id, buildSearchHaystack(preset))
  }
  if (changed)
    notifyListeners()
}

export function getRegisteredDeviceMockupPresets(): DeviceMockupPreset[] {
  return Array.from(REGISTRY.values())
}

export function normalizeDeviceMockupPresetId(id: string | null | undefined): string {
  if (!id)
    return ''
  return PRESET_ALIASES[id] ?? id
}

export function findDeviceMockupPreset(
  idOrPreset: DeviceMockupPreset | string | null | undefined,
): DeviceMockupPreset | undefined {
  if (!idOrPreset)
    return undefined
  if (typeof idOrPreset === 'object')
    return idOrPreset
  const normalized = normalizeDeviceMockupPresetId(idOrPreset)
  return REGISTRY.get(normalized) ?? REGISTRY.get(idOrPreset)
}

export function getDeviceMockupPreset(
  idOrPreset?: DeviceMockupPreset | string | null,
): DeviceMockupPreset {
  return findDeviceMockupPreset(idOrPreset) ?? DEFAULT_DEVICE_MOCKUP_PRESET
}

export function isResponsiveDeviceMockupPreset(preset: DeviceMockupPreset | null | undefined): boolean {
  return !preset || preset.category === 'responsive' || preset.width <= 0 || preset.height <= 0
}

export function resolveDeviceFamilyForId(id: string | null | undefined): DeviceMockupFamily | null {
  const normalized = normalizeDeviceMockupPresetId(id).toLowerCase()
  if (!normalized || normalized === 'responsive')
    return null
  if (normalized.startsWith('iphone-'))
    return 'ios'
  if (
    normalized.startsWith('apple-watch-')
    || normalized.startsWith('pixel-watch-')
    || normalized.startsWith('galaxy-watch-')
    || normalized.startsWith('huawei-watch-')
  ) {
    return 'watch'
  }
  if (
    normalized.startsWith('ipad-')
    || normalized.startsWith('galaxy-tab-')
    || normalized.startsWith('xiaomi-pad-')
    || normalized.startsWith('surface-pro-')
    || normalized === 'android-tablet'
  ) {
    return 'tablet'
  }
  if (
    normalized.startsWith('macbook-')
    || normalized.startsWith('imac-')
    || normalized.startsWith('studio-display-')
    || normalized.startsWith('pro-display-')
    || normalized.startsWith('thinkpad-')
    || normalized.startsWith('dell-xps-')
    || normalized.startsWith('surface-laptop-')
    || normalized === 'ultrawide-monitor'
    || normalized === 'desktop-hd'
    || normalized === 'laptop'
  ) {
    return 'desktop'
  }
  if (normalized.startsWith('browser-') || normalized.startsWith('window-'))
    return 'browser'
  if (
    normalized.startsWith('pixel-')
    || normalized.startsWith('galaxy-')
    || normalized.startsWith('xiaomi-')
    || normalized.startsWith('oneplus-')
    || normalized.startsWith('nothing-')
    || normalized.startsWith('harmony-')
    || normalized.startsWith('huawei-')
    || normalized.startsWith('oppo-')
    || normalized.startsWith('vivo-')
  ) {
    return 'android'
  }
  return null
}

/**
 * Dynamically loads ONLY the single device family chunk needed for a string preset ID
 * not yet registered in the runtime registry. Zero static imports of family modules.
 */
export async function loadDeviceFamilyForId(id: string): Promise<DeviceMockupPreset | undefined> {
  const existing = findDeviceMockupPreset(id)
  if (existing)
    return existing

  const family = resolveDeviceFamilyForId(id)
  if (!family)
    return undefined

  let pending = INFLIGHT_FAMILIES.get(family)
  if (!pending) {
    pending = (async () => {
      let list: readonly DeviceMockupPreset[] = []
      if (family === 'ios')
        list = (await import('../presets/ios/index')).IOS_DEVICE_PRESETS
      else if (family === 'android')
        list = (await import('../presets/android/index')).ANDROID_DEVICE_PRESETS
      else if (family === 'tablet')
        list = (await import('../presets/tablet/index')).TABLET_DEVICE_PRESETS
      else if (family === 'desktop')
        list = (await import('../presets/desktop/index')).DESKTOP_DEVICE_PRESETS
      else if (family === 'watch')
        list = (await import('../presets/watch/index')).WATCH_DEVICE_PRESETS
      else if (family === 'browser')
        list = (await import('../presets/browser/index')).BROWSER_DEVICE_PRESETS
      registerDeviceMockupPresets(list)
      return list
    })()
    INFLIGHT_FAMILIES.set(family, pending)
  }

  try {
    await pending
  }
  catch {
    INFLIGHT_FAMILIES.delete(family)
    return undefined
  }
  return findDeviceMockupPreset(id)
}

/**
 * Resolves logical screen dimensions and safe-area insets for a preset and orientation.
 */
export function resolveDeviceMockupDimensions(
  preset: DeviceMockupPreset,
  orientation: DeviceMockupOrientation = 'portrait',
  override?: { width?: number, height?: number },
): ResolvedDeviceMockupDimensions {
  const customWidth = typeof override?.width === 'number' && Number.isFinite(override.width) && override.width > 0
    ? Math.round(override.width)
    : 0
  const customHeight = typeof override?.height === 'number' && Number.isFinite(override.height) && override.height > 0
    ? Math.round(override.height)
    : 0

  if (isResponsiveDeviceMockupPreset(preset)) {
    return {
      width: customWidth,
      height: customHeight,
      safeArea: { top: 0, bottom: 0 },
      orientation: customWidth > 0 && customHeight > 0 && customWidth > customHeight ? 'landscape' : 'portrait',
    }
  }

  const baseWidth = customWidth || preset.width
  const baseHeight = customHeight || preset.height
  const shouldFlip = orientation === 'landscape' && preset.orientable

  if (!shouldFlip) {
    return {
      width: baseWidth,
      height: baseHeight,
      safeArea: {
        top: preset.safeArea.top,
        bottom: preset.safeArea.bottom,
      },
      orientation: 'portrait',
    }
  }

  return {
    width: baseHeight,
    height: baseWidth,
    safeArea: {
      top: preset.safeArea.top > 0 ? Math.min(preset.safeArea.top, 24) : 0,
      bottom: preset.safeArea.bottom > 0 ? Math.min(preset.safeArea.bottom, 21) : 0,
    },
    orientation: 'landscape',
  }
}

/**
 * Searches presets (registered presets by default, or an explicitly supplied catalog array)
 * by bilingual (EN + CN) query and optional category.
 */
export function searchDeviceMockupPresets(
  query = '',
  category?: DeviceMockupCategory | 'all',
  catalog?: readonly DeviceMockupPreset[],
): DeviceMockupPreset[] {
  const normalized = query.trim().toLowerCase()
  const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : []
  const pool = catalog ?? Array.from(REGISTRY.values())

  return pool.filter((preset) => {
    if (category && category !== 'all' && preset.category !== category)
      return false
    if (tokens.length === 0)
      return true
    const haystack = SEARCH_INDEX.get(preset.id) ?? buildSearchHaystack(preset)
    return tokens.every(token => haystack.includes(token))
  })
}

/**
 * Computes a fit scale in `(0, 1]` so `deviceSize` fits cleanly inside `containerSize`
 * with symmetric `padding` on each side without upscaling past 1:1 or clipping.
 */
export function computeDeviceMockupFitScale(
  deviceSize: DeviceMockupSize,
  containerSize: DeviceMockupSize,
  padding = 32,
): number {
  if (
    !Number.isFinite(deviceSize.width)
    || !Number.isFinite(deviceSize.height)
    || !Number.isFinite(containerSize.width)
    || !Number.isFinite(containerSize.height)
    || deviceSize.width <= 0
    || deviceSize.height <= 0
    || containerSize.width <= 0
    || containerSize.height <= 0
  ) {
    return 1
  }

  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0)
  const availableWidth = Math.max(1, containerSize.width - safePadding * 2)
  const availableHeight = Math.max(1, containerSize.height - safePadding * 2)
  const rawScale = Math.min(
    availableWidth / deviceSize.width,
    availableHeight / deviceSize.height,
    1,
  )

  const floored = Math.floor(rawScale * 10000) / 10000
  return Math.max(0.05, Math.min(1, floored))
}
