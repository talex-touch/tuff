export type DeviceMockupCategory
  = | 'phone'
    | 'tablet'
    | 'desktop'
    | 'watch'
    | 'browser'
    | 'responsive'

export type DeviceMockupFamily = 'ios' | 'android' | 'tablet' | 'desktop' | 'watch' | 'browser'

export type DeviceMockupIosPresetId
  = | 'iphone-17-pro-max'
    | 'iphone-17-pro'
    | 'iphone-17-air'
    | 'iphone-17'
    | 'iphone-16-pro-max'
    | 'iphone-16-pro'
    | 'iphone-16-plus'
    | 'iphone-16'
    | 'iphone-15-pro-max'
    | 'iphone-15-pro'
    | 'iphone-15'
    | 'iphone-14-pro'
    | 'iphone-14'
    | 'iphone-13-mini'
    | 'iphone-se'

export type DeviceMockupAndroidPresetId
  = | 'pixel-10-pro'
    | 'pixel-9-pro-xl'
    | 'pixel-9-pro'
    | 'pixel-9'
    | 'pixel-9a'
    | 'pixel-9-pro-fold'
    | 'galaxy-s25-ultra'
    | 'galaxy-s25-plus'
    | 'galaxy-s25'
    | 'galaxy-s24-ultra'
    | 'galaxy-z-fold-6'
    | 'galaxy-z-fold'
    | 'galaxy-z-flip-6'
    | 'xiaomi-15-ultra'
    | 'xiaomi-15-pro'
    | 'oneplus-13'
    | 'nothing-phone-3'
    | 'harmony-mate'
    | 'huawei-pura-70-ultra'
    | 'huawei-mate-xt'
    | 'oppo-find-x8-pro'
    | 'vivo-x200-pro'

export type DeviceMockupTabletPresetId
  = | 'ipad-pro-13'
    | 'ipad-pro-11'
    | 'ipad-air-13'
    | 'ipad-air-11'
    | 'ipad-mini'
    | 'galaxy-tab-s10-ultra'
    | 'galaxy-tab-s10-plus'
    | 'xiaomi-pad-7-pro'
    | 'surface-pro-11'
    | 'android-tablet'

export type DeviceMockupDesktopPresetId
  = | 'macbook-pro-16'
    | 'macbook-pro-14'
    | 'macbook-air-15'
    | 'macbook-air-13'
    | 'imac-24'
    | 'studio-display-27'
    | 'pro-display-xdr-32'
    | 'thinkpad-x1-carbon'
    | 'dell-xps-14'
    | 'surface-laptop-7'
    | 'ultrawide-monitor'
    | 'desktop-hd'
    | 'laptop'

export type DeviceMockupWatchPresetId
  = | 'apple-watch-ultra-2'
    | 'apple-watch-46'
    | 'apple-watch-42'
    | 'pixel-watch-3'
    | 'galaxy-watch-ultra'
    | 'huawei-watch-gt-5'

export type DeviceMockupBrowserPresetId
  = | 'browser-safari'
    | 'browser-safari-compact'
    | 'browser-chrome'
    | 'browser-arc'
    | 'browser-firefox'
    | 'browser-edge'
    | 'browser-minimal'
    | 'window-macos'
    | 'window-windows'

export type DeviceMockupPresetId
  = | DeviceMockupIosPresetId
    | DeviceMockupAndroidPresetId
    | DeviceMockupTabletPresetId
    | DeviceMockupDesktopPresetId
    | DeviceMockupWatchPresetId
    | DeviceMockupBrowserPresetId
    | 'responsive'

export type DeviceMockupCutout
  = | 'island'
    | 'notch'
    | 'punch'
    | 'pill'
    | 'lid-notch'
    | 'none'

export type DeviceMockupOs
  = | 'ios'
    | 'android'
    | 'harmony'
    | 'watchos'
    | 'macos'
    | 'desktop'
    | 'web'

export type DeviceMockupFormFactor
  = | 'phone'
    | 'tablet'
    | 'laptop'
    | 'imac'
    | 'monitor'
    | 'watch'
    | 'browser-safari'
    | 'browser-safari-compact'
    | 'browser-chrome'
    | 'browser-arc'
    | 'browser-firefox'
    | 'browser-edge'
    | 'browser-minimal'
    | 'window-macos'
    | 'window-windows'
    | 'responsive'

export type DeviceMockupShape = 'rounded' | 'circle'

export type DeviceMockupOrientation = 'portrait' | 'landscape'

export type DeviceMockupFrameStyle
  = | 'default'
    | 'glass-light'
    | 'glass-dark'
    | 'liquid-glass'
    | 'inset'
    | 'outline'
    | 'border'
    | 'frameless'

export type DeviceMockupFinish = 'obsidian' | 'silver' | 'titanium' | 'graphite'

export type DeviceMockupFit = 'contain' | 'width' | 'none'

export type DeviceMockupPerspective
  = | 'flat'
    | 'tilt-left'
    | 'tilt-right'
    | 'isometric'
    | 'floating'
    | 'angled-low'

export type DeviceMockupShadow
  = | boolean
    | 'none'
    | 'soft'
    | 'crisp'
    | 'grounded'
    | 'elevated'
    | 'dramatic'
    | 'ambient'

export type DeviceMockupShadowVariant = Exclude<DeviceMockupShadow, boolean>

export type DeviceMockupFraming
  = | 'center'
    | 'bleed-bottom'
    | 'bleed-top'
    | 'bleed-left'
    | 'bleed-right'
    | 'float'

export type DeviceMockupTheme = 'auto' | 'light' | 'dark'

export type DeviceMockupBackdrop
  = | 'none'
    | 'solid'
    | 'gradient'
    | 'mesh'
    | 'studio'
    | 'obsidian'
    | 'slate'
    | 'transparent'

export type DeviceMockupGradientPreset
  = | 'aurora'
    | 'sunset'
    | 'ocean'
    | 'graphite'
    | 'emerald'
    | 'lavender'
    | 'peach'
    | 'midnight'
    | 'sand'
    | 'cobalt'
    | 'rose'
    | 'silver-mist'

export type DeviceMockupSceneId
  = | 'appstore-hero'
    | 'apple-studio'
    | 'liquid-obsidian'
    | 'editorial-minimal'
    | 'macbook-bleed'
    | 'isometric-showcase'
    | 'warm-sunset'
    | 'transparent-cutout'

export interface DeviceMockupScene {
  readonly id: DeviceMockupSceneId | (string & {})
  readonly label: string
  readonly description?: string
  readonly backdrop?: DeviceMockupBackdrop
  readonly gradientPreset?: DeviceMockupGradientPreset
  readonly backdropValue?: string
  readonly backdropNoise?: boolean
  readonly frameStyle?: DeviceMockupFrameStyle
  readonly finish?: DeviceMockupFinish
  readonly shadow?: DeviceMockupShadowVariant
  readonly perspective?: DeviceMockupPerspective
  readonly framing?: DeviceMockupFraming
  readonly screenGlare?: boolean
}

export type DeviceMockupStageRatio = 'auto' | '16:9' | '4:3' | '1:1' | '9:16'

export type DeviceMockupObjectFit = 'cover' | 'contain' | 'fill'

export type DeviceMockupExportFormat = 'png' | 'webp' | 'svg'

export type DeviceMockupExportScale = 1 | 2 | 3

export interface DeviceMockupSafeArea {
  top: number
  bottom: number
}

export interface DeviceMockupSize {
  width: number
  height: number
}

export interface DeviceMockupPreset {
  readonly id: DeviceMockupPresetId | (string & {})
  readonly name: string
  readonly shortName: string
  readonly category: DeviceMockupCategory
  readonly formFactor: DeviceMockupFormFactor
  /** Optional bezel geometry shape (`'circle'` for round smartwatches). */
  readonly shape?: DeviceMockupShape
  /** Logical viewport width in CSS px (`0` for fluid responsive mode). */
  readonly width: number
  /** Logical viewport height in CSS px (`0` for fluid responsive mode). */
  readonly height: number
  /** Inner screen corner radius in px. */
  readonly radius: number
  /** Hardware bezel thickness in px when shell chrome is visible. */
  readonly bezel: number
  /** Hardware screen top cutout geometry. */
  readonly cutout: DeviceMockupCutout
  /** Portrait safe-area insets in px. */
  readonly safeArea: Readonly<DeviceMockupSafeArea>
  /** Whether orientation can toggle between portrait and landscape. */
  readonly orientable: boolean
  /** Whether device is touch-primary. */
  readonly touch: boolean
  /** Target OS hint. */
  readonly os: DeviceMockupOs
  /** Bilingual search keywords (EN + CN). */
  readonly keywords: readonly string[]
}

export interface DeviceMockupCategoryMeta {
  readonly id: DeviceMockupCategory
  readonly label: string
  readonly keywords: readonly string[]
}

export type DeviceMockupMeshBloom = readonly [
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opacity: number,
]

export interface DeviceMockupGradientMeta {
  readonly id: DeviceMockupGradientPreset
  readonly label: string
  readonly angle: number
  readonly stops: readonly [string, string, ...string[]]
  readonly css: string
  readonly blooms?: readonly DeviceMockupMeshBloom[]
  readonly dark: boolean
}

export interface ResolvedDeviceMockupDimensions extends DeviceMockupSize {
  safeArea: DeviceMockupSafeArea
  orientation: DeviceMockupOrientation
}

export interface DeviceMockupLabels {
  /** Accessible label for the root figure. Defaults to preset name or title. */
  figure: string
  /** Accessible label for the simulated screen viewport. */
  screen: string
  /** Accessible label for the simulated browser toolbar. */
  browserBar: string
  /** Accessible caption fallback. */
  caption: string
}

export const DEVICE_MOCKUP_DEFAULT_LABELS: Readonly<DeviceMockupLabels> = /*#__PURE__*/ Object.freeze({
  figure: 'Device mockup',
  screen: 'Device screen preview',
  browserBar: 'Browser toolbar',
  caption: 'Device preview',
})

export interface DeviceMockupMetrics {
  presetId: string
  presetName: string
  category: DeviceMockupCategory
  orientation: DeviceMockupOrientation
  screenWidth: number
  screenHeight: number
  outerWidth: number
  outerHeight: number
  bezelWidth: number
  innerRadius: number
  outerRadius: number
  scale: number
  containerWidth: number
  containerHeight: number
}

export interface DeviceMockupSlotProps {
  preset: DeviceMockupPreset
  width: number
  height: number
  orientation: DeviceMockupOrientation
  scale: number
}

export interface DeviceMockupProps {
  device?: DeviceMockupPreset | DeviceMockupPresetId | (string & {})
  scene?: DeviceMockupSceneId | DeviceMockupScene
  orientation?: DeviceMockupOrientation
  frameStyle?: DeviceMockupFrameStyle
  finish?: DeviceMockupFinish
  bezelColor?: string
  bezelWidth?: number
  radius?: number
  width?: number
  height?: number
  fit?: DeviceMockupFit
  scale?: number
  maxWidth?: number | string
  maxHeight?: number | string
  perspective?: DeviceMockupPerspective
  interactiveTilt?: boolean
  tiltMaxAngle?: number
  shadow?: DeviceMockupShadow
  framing?: DeviceMockupFraming
  screenGlare?: boolean
  backdropNoise?: boolean
  animated?: boolean
  showShell?: boolean
  showCutout?: boolean
  showStatusBar?: boolean
  statusBarTheme?: DeviceMockupTheme
  statusBarTime?: string
  showHomeIndicator?: boolean
  showHardwareButtons?: boolean
  browserUrl?: string
  browserTitle?: string
  browserTheme?: DeviceMockupTheme
  backdrop?: DeviceMockupBackdrop
  gradientPreset?: DeviceMockupGradientPreset
  backdropValue?: string
  stageRatio?: DeviceMockupStageRatio
  stagePadding?: number
  src?: string
  alt?: string
  objectFit?: DeviceMockupObjectFit
  title?: string
  watermark?: string
  labels?: Partial<DeviceMockupLabels>
}

export interface DeviceMockupEmits {
  (event: 'metrics-change', metrics: DeviceMockupMetrics): void
}

export interface DeviceMockupExportOptions {
  format?: DeviceMockupExportFormat
  scale?: DeviceMockupExportScale
  quality?: number
  imageSrc?: string
  fallbackTitle?: string
  fallbackSubtitle?: string
  stagePadding?: number
  backdrop?: DeviceMockupBackdrop
  gradientPreset?: DeviceMockupGradientPreset
  backdropValue?: string
  backdropNoise?: boolean
  framing?: DeviceMockupFraming
  screenGlare?: boolean
  stageRatio?: DeviceMockupStageRatio
  title?: string
  watermark?: string
  timeoutMs?: number
}

export interface DeviceMockupExportConfig extends DeviceMockupExportOptions {
  device?: DeviceMockupPreset | DeviceMockupPresetId | (string & {})
  scene?: DeviceMockupSceneId | DeviceMockupScene
  orientation?: DeviceMockupOrientation
  frameStyle?: DeviceMockupFrameStyle
  finish?: DeviceMockupFinish
  bezelColor?: string
  bezelWidth?: number
  radius?: number
  width?: number
  height?: number
  shadow?: DeviceMockupShadow
  showShell?: boolean
  showCutout?: boolean
  showStatusBar?: boolean
  statusBarTheme?: DeviceMockupTheme
  statusBarTime?: string
  showHomeIndicator?: boolean
  showHardwareButtons?: boolean
  browserUrl?: string
  browserTitle?: string
  browserTheme?: DeviceMockupTheme
  src?: string
  objectFit?: DeviceMockupObjectFit
}
