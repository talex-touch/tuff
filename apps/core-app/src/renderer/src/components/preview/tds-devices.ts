/**
 * Single-source, zero-dependency device preset catalog and geometry helpers (`tds-devices`).
 *
 * Logical viewport sizes are expressed in CSS pixels (device-independent pixels)
 * matching each device's portrait baseline (or standard landscape for desktop).
 */

export type DeviceCategory = 'responsive' | 'phone' | 'tablet' | 'watch' | 'desktop' | 'paper'

export type DeviceCutout = 'island' | 'notch' | 'punch' | 'pill' | 'none'

export type DeviceOs = 'ios' | 'android' | 'harmony' | 'watchos' | 'desktop'

export type DeviceOrientation = 'portrait' | 'landscape'

export interface DeviceSafeArea {
  top: number
  bottom: number
}

export interface DeviceSize {
  width: number
  height: number
}

export interface DevicePreset {
  readonly id: string
  readonly name: string
  readonly shortName?: string
  readonly category: DeviceCategory
  /** Logical CSS viewport width in px (`0` for responsive full-bleed). */
  readonly width: number
  /** Logical CSS viewport height in px (`0` for responsive full-bleed). */
  readonly height: number
  /** Inner screen corner radius in px. */
  readonly radius: number
  /** Hardware screen top cutout geometry. */
  readonly cutout: DeviceCutout
  /** Portrait safe-area insets in px. */
  readonly safeArea: Readonly<DeviceSafeArea>
  /** Hardware bezel thickness in px when shell chrome is visible. */
  readonly bezel: number
  /** Whether the device can toggle between portrait and landscape. */
  readonly orientable?: boolean
  /** Whether the device is touch-primary. */
  readonly touch?: boolean
  /** Target OS hint for status bar styling and touch affordance. */
  readonly os?: DeviceOs
  /** Bilingual search keywords (EN + CN). */
  readonly keywords?: readonly string[]
}

export interface DeviceCategoryMeta {
  readonly id: DeviceCategory
  readonly icon: string
  readonly keywords: readonly string[]
}

export interface ResolvedDeviceDimensions extends DeviceSize {
  safeArea: DeviceSafeArea
  orientation: DeviceOrientation
}

export interface ViewportRectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ViewportBounds {
  x: number
  y: number
  width: number
  height: number
}

export const RESPONSIVE_PRESET_ID = 'responsive'

export const TDS_DEVICE_CATEGORIES: readonly DeviceCategoryMeta[] = [
  {
    id: 'responsive',
    icon: 'i-ri-aspect-ratio-line',
    keywords: ['responsive', 'auto', 'full', 'fluid', '自适应', '响应式', '全宽', '默认']
  },
  {
    id: 'phone',
    icon: 'i-ri-smartphone-line',
    keywords: ['phone', 'mobile', 'handset', 'smartphone', '手机', '移动端', '移动']
  },
  {
    id: 'tablet',
    icon: 'i-ri-tablet-line',
    keywords: ['tablet', 'pad', '平板', '平板电脑']
  },
  {
    id: 'watch',
    icon: 'i-ri-time-line',
    keywords: ['watch', 'wearable', 'smartwatch', '手表', '腕表', '表盘']
  },
  {
    id: 'desktop',
    icon: 'i-ri-computer-line',
    keywords: ['desktop', 'laptop', 'pc', 'mac', 'monitor', '桌面', '电脑', '笔记本', '宽屏']
  },
  {
    id: 'paper',
    icon: 'i-ri-file-paper-2-line',
    keywords: ['paper', 'print', 'document', 'page', 'sheet', '纸张', '打印', '文档']
  }
]

const CATEGORY_META_MAP: Readonly<Record<DeviceCategory, DeviceCategoryMeta>> = {
  responsive: TDS_DEVICE_CATEGORIES[0]!,
  phone: TDS_DEVICE_CATEGORIES[1]!,
  tablet: TDS_DEVICE_CATEGORIES[2]!,
  watch: TDS_DEVICE_CATEGORIES[3]!,
  desktop: TDS_DEVICE_CATEGORIES[4]!,
  paper: TDS_DEVICE_CATEGORIES[5]!
}

export const TDS_DEVICE_PRESETS: readonly DevicePreset[] = [
  {
    id: RESPONSIVE_PRESET_ID,
    name: 'Responsive',
    shortName: 'Responsive',
    category: 'responsive',
    width: 0,
    height: 0,
    radius: 0,
    cutout: 'none',
    safeArea: { top: 0, bottom: 0 },
    bezel: 0,
    orientable: false,
    touch: false,
    keywords: ['responsive', 'full', 'auto', '自适应', '响应式', '全宽']
  },
  // ── Phones ──
  {
    id: 'iphone-17-pro',
    name: 'iPhone 17 Pro',
    shortName: 'iPhone 17 Pro',
    category: 'phone',
    width: 402,
    height: 874,
    radius: 62,
    cutout: 'island',
    safeArea: { top: 62, bottom: 34 },
    bezel: 10,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'iphone', 'ios', 'dynamic island', '灵动岛', '苹果', '手机']
  },
  {
    id: 'iphone-17',
    name: 'iPhone 17',
    shortName: 'iPhone 17',
    category: 'phone',
    width: 393,
    height: 852,
    radius: 62,
    cutout: 'island',
    safeArea: { top: 59, bottom: 34 },
    bezel: 10,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'iphone', 'ios', 'dynamic island', '灵动岛', '苹果', '手机']
  },
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    shortName: 'iPhone 14',
    category: 'phone',
    width: 390,
    height: 844,
    radius: 47,
    cutout: 'notch',
    safeArea: { top: 47, bottom: 34 },
    bezel: 10,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'iphone', 'ios', 'notch', '刘海', '苹果', '手机']
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    shortName: 'iPhone SE',
    category: 'phone',
    width: 375,
    height: 667,
    radius: 0,
    cutout: 'none',
    safeArea: { top: 20, bottom: 0 },
    bezel: 12,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'iphone', 'ios', 'compact', 'small', 'flat', '小屏', '苹果', '手机']
  },
  {
    id: 'pixel-9',
    name: 'Pixel 9',
    shortName: 'Pixel 9',
    category: 'phone',
    width: 412,
    height: 915,
    radius: 42,
    cutout: 'punch',
    safeArea: { top: 42, bottom: 24 },
    bezel: 10,
    orientable: true,
    touch: true,
    os: 'android',
    keywords: ['google', 'pixel', 'android', 'punch', '谷歌', '安卓', '手机']
  },
  {
    id: 'galaxy-s25',
    name: 'Galaxy S25',
    shortName: 'Galaxy S25',
    category: 'phone',
    width: 360,
    height: 780,
    radius: 38,
    cutout: 'punch',
    safeArea: { top: 36, bottom: 24 },
    bezel: 9,
    orientable: true,
    touch: true,
    os: 'android',
    keywords: ['samsung', 'galaxy', 'android', 'punch', '三星', '安卓', '手机']
  },
  {
    id: 'harmony-mate',
    name: 'HarmonyOS Mate',
    shortName: 'Mate',
    category: 'phone',
    width: 396,
    height: 868,
    radius: 44,
    cutout: 'pill',
    safeArea: { top: 44, bottom: 28 },
    bezel: 10,
    orientable: true,
    touch: true,
    os: 'harmony',
    keywords: ['huawei', 'harmony', 'harmonyos', 'mate', 'pill', '华为', '鸿蒙', '手机']
  },
  // ── Tablets ──
  {
    id: 'ipad-pro-11',
    name: 'iPad Pro 11"',
    shortName: 'iPad Pro 11"',
    category: 'tablet',
    width: 834,
    height: 1210,
    radius: 18,
    cutout: 'none',
    safeArea: { top: 24, bottom: 20 },
    bezel: 14,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'ipad', 'ipados', 'ios', 'tablet', '苹果', '平板']
  },
  {
    id: 'ipad-mini',
    name: 'iPad mini',
    shortName: 'iPad mini',
    category: 'tablet',
    width: 744,
    height: 1133,
    radius: 18,
    cutout: 'none',
    safeArea: { top: 24, bottom: 20 },
    bezel: 14,
    orientable: true,
    touch: true,
    os: 'ios',
    keywords: ['apple', 'ipad', 'mini', 'ipados', 'ios', 'tablet', '苹果', '平板']
  },
  {
    id: 'android-tablet',
    name: 'Android Tablet',
    shortName: 'Android Tab',
    category: 'tablet',
    width: 800,
    height: 1280,
    radius: 16,
    cutout: 'none',
    safeArea: { top: 24, bottom: 20 },
    bezel: 14,
    orientable: true,
    touch: true,
    os: 'android',
    keywords: ['android', 'tablet', 'pad', '安卓', '平板']
  },
  // ── Watch ──
  {
    id: 'apple-watch-46',
    name: 'Apple Watch 46mm',
    shortName: 'Watch 46mm',
    category: 'watch',
    width: 208,
    height: 248,
    radius: 42,
    cutout: 'none',
    safeArea: { top: 20, bottom: 16 },
    bezel: 10,
    orientable: false,
    touch: true,
    os: 'watchos',
    keywords: ['apple', 'watch', 'watchos', '46mm', '手表', '苹果手表', '腕表']
  },
  // ── Desktop ──
  {
    id: 'desktop-hd',
    name: 'Desktop HD',
    shortName: 'Desktop HD',
    category: 'desktop',
    width: 1440,
    height: 900,
    radius: 8,
    cutout: 'none',
    safeArea: { top: 0, bottom: 0 },
    bezel: 8,
    orientable: false,
    touch: false,
    os: 'desktop',
    keywords: ['desktop', 'hd', '1440', 'monitor', 'pc', 'mac', '桌面', '电脑', '宽屏']
  },
  {
    id: 'laptop',
    name: 'Laptop',
    shortName: 'Laptop',
    category: 'desktop',
    width: 1280,
    height: 800,
    radius: 8,
    cutout: 'none',
    safeArea: { top: 0, bottom: 0 },
    bezel: 8,
    orientable: false,
    touch: false,
    os: 'desktop',
    keywords: ['laptop', 'macbook', '1280', 'notebook', 'desktop', '笔记本', '电脑', '桌面']
  },
  // ── Paper ──
  {
    id: 'a4',
    name: 'A4',
    shortName: 'A4',
    category: 'paper',
    width: 794,
    height: 1123,
    radius: 2,
    cutout: 'none',
    safeArea: { top: 0, bottom: 0 },
    bezel: 0,
    orientable: true,
    touch: false,
    os: 'desktop',
    keywords: ['a4', 'paper', 'print', 'pdf', 'document', '纸张', '打印', '文档']
  }
]

export const RESPONSIVE_DEVICE_PRESET: DevicePreset = TDS_DEVICE_PRESETS[0]!

const PRESET_BY_ID = new Map<string, DevicePreset>(
  TDS_DEVICE_PRESETS.map((preset) => [preset.id, preset])
)

export function findDevicePresetById(id: string | null | undefined): DevicePreset | undefined {
  if (!id) return undefined
  return PRESET_BY_ID.get(id)
}

export function getDevicePresetById(id: string | null | undefined): DevicePreset {
  return findDevicePresetById(id) ?? RESPONSIVE_DEVICE_PRESET
}

export function getDeviceCategoryIcon(category: DeviceCategory): string {
  return CATEGORY_META_MAP[category]?.icon ?? 'i-ri-aspect-ratio-line'
}

export function isResponsivePreset(preset: DevicePreset | null | undefined): boolean {
  return !preset || preset.category === 'responsive' || preset.width <= 0 || preset.height <= 0
}

/**
 * Resolves logical viewport width, height, and safe-area insets for a given orientation.
 * Non-orientable presets ignore `'landscape'` and remain in their native dimensions.
 */
export function resolveDeviceDimensions(
  preset: DevicePreset,
  orientation: DeviceOrientation = 'portrait'
): ResolvedDeviceDimensions {
  if (isResponsivePreset(preset)) {
    return {
      width: 0,
      height: 0,
      safeArea: { top: 0, bottom: 0 },
      orientation: 'portrait'
    }
  }

  const shouldFlip = orientation === 'landscape' && Boolean(preset.orientable)
  if (!shouldFlip) {
    return {
      width: preset.width,
      height: preset.height,
      safeArea: {
        top: preset.safeArea.top,
        bottom: preset.safeArea.bottom
      },
      orientation: 'portrait'
    }
  }

  return {
    width: preset.height,
    height: preset.width,
    safeArea: {
      top: preset.safeArea.top > 0 ? Math.min(preset.safeArea.top, 24) : 0,
      bottom: preset.safeArea.bottom > 0 ? Math.min(preset.safeArea.bottom, 21) : 0
    },
    orientation: 'landscape'
  }
}

function buildSearchHaystack(preset: DevicePreset): string {
  const categoryKeywords = CATEGORY_META_MAP[preset.category]?.keywords ?? []
  const parts = [
    preset.id,
    preset.name,
    preset.shortName ?? '',
    preset.category,
    preset.os ?? '',
    preset.cutout,
    preset.width > 0 ? `${preset.width}x${preset.height}` : '',
    preset.width > 0 ? `${preset.width}×${preset.height}` : '',
    ...categoryKeywords,
    ...(preset.keywords ?? [])
  ]
  return parts.join(' ').toLowerCase()
}

const PRESET_SEARCH_INDEX = new Map<string, string>(
  TDS_DEVICE_PRESETS.map((preset) => [preset.id, buildSearchHaystack(preset)])
)

/**
 * Searches device presets by optional bilingual (CN + EN) query and optional category filter.
 */
export function searchDevicePresets(query = '', category?: DeviceCategory | 'all'): DevicePreset[] {
  const normalizedQuery = query.trim().toLowerCase()
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : []

  return TDS_DEVICE_PRESETS.filter((preset) => {
    if (category && category !== 'all' && preset.category !== category) {
      return false
    }
    if (tokens.length === 0) return true
    const haystack = PRESET_SEARCH_INDEX.get(preset.id) ?? ''
    return tokens.every((token) => haystack.includes(token))
  })
}

/**
 * Computes a fit scale in `(0, 1]` so `deviceSize` fits cleanly inside `containerSize`
 * with symmetric `padding` on each side without ever upscaling past 1:1 or clipping.
 */
export function computeStageFitScale(
  deviceSize: DeviceSize,
  containerSize: DeviceSize,
  padding = 24
): number {
  if (
    !Number.isFinite(deviceSize.width) ||
    !Number.isFinite(deviceSize.height) ||
    !Number.isFinite(containerSize.width) ||
    !Number.isFinite(containerSize.height) ||
    deviceSize.width <= 0 ||
    deviceSize.height <= 0 ||
    containerSize.width <= 0 ||
    containerSize.height <= 0
  ) {
    return 1
  }

  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0)
  const availableWidth = Math.max(1, containerSize.width - safePadding * 2)
  const availableHeight = Math.max(1, containerSize.height - safePadding * 2)
  const rawScale = Math.min(
    availableWidth / deviceSize.width,
    availableHeight / deviceSize.height,
    1
  )

  // Floor at 4 decimal places so rounding never causes a 1px overflow clip.
  const floored = Math.floor(rawScale * 10000) / 10000
  return Math.max(0.05, Math.min(1, floored))
}

/**
 * Clamps and centers a target device viewport within the measured stage and window bounds.
 * Used for native overlays (e.g. Electron WebContentsView) that cannot be CSS-scaled.
 */
export function clampViewportBounds(
  viewportRect: ViewportRectLike,
  stageRect: ViewportRectLike | null,
  targetSize: DeviceSize | null,
  windowSize: DeviceSize
): ViewportBounds {
  const minLeft =
    stageRect && stageRect.width > 0
      ? Math.max(viewportRect.left, stageRect.left)
      : viewportRect.left
  const minTop =
    stageRect && stageRect.height > 0 ? Math.max(viewportRect.top, stageRect.top) : viewportRect.top
  const maxRight =
    stageRect && stageRect.width > 0
      ? Math.min(viewportRect.right, stageRect.right, windowSize.width)
      : Math.min(viewportRect.right, windowSize.width)
  const maxBottom =
    stageRect && stageRect.height > 0
      ? Math.min(viewportRect.bottom, stageRect.bottom, windowSize.height)
      : Math.min(viewportRect.bottom, windowSize.height)

  const baseX = Math.max(0, Math.ceil(minLeft))
  const baseY = Math.max(0, Math.ceil(minTop))
  const availWidth = Math.max(0, Math.floor(maxRight) - baseX)
  const availHeight = Math.max(0, Math.floor(maxBottom) - baseY)

  if (!targetSize || targetSize.width <= 0 || targetSize.height <= 0) {
    return { x: baseX, y: baseY, width: availWidth, height: availHeight }
  }

  const width = Math.min(availWidth, Math.round(targetSize.width))
  const height = Math.min(availHeight, Math.round(targetSize.height))
  const x = baseX + Math.floor((availWidth - width) / 2)
  const y = baseY + Math.floor((availHeight - height) / 2)

  return { x, y, width, height }
}
