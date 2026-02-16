import type { GlassSurfaceProps } from '../../glass-surface'

export type BaseSurfaceMode = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
export type BaseSurfacePreset = 'default' | 'card'
export type BaseSurfaceRefractionRenderer = 'svg' | 'css'
export type BaseSurfaceRefractionProfile = 'soft' | 'filmic' | 'cinematic'
export type BaseSurfaceRefractionTone = 'mist' | 'balanced' | 'vivid'

export interface BaseSurfaceProps {
  /** 背景模式 */
  mode?: BaseSurfaceMode
  /** 自定义圆角，不传则 inherit 父元素 */
  radius?: string | number
  /** 纯色/遮罩的背景色，默认使用 CSS 变量 */
  color?: string
  /** mask 模式下的透明度 (0-1) */
  opacity?: number
  /** 运动降级到 mask 时的透明度覆盖（0-1） */
  fallbackMaskOpacity?: number
  /** blur（即 filter 层）模式下的模糊强度 (px) */
  blur?: number
  /** filter 层饱和度（用于 blur/refraction 模式） */
  filterSaturation?: number
  /** filter 层对比度（用于 blur/refraction 模式） */
  filterContrast?: number
  /** filter 层亮度（用于 blur/refraction 模式） */
  filterBrightness?: number
  /** glass/refraction 模式下的饱和度 */
  saturation?: number
  /** glass/refraction 模式下的亮度（推荐 0-100；<=3 会按倍率自动转为百分比） */
  brightness?: number
  /** glass 模式下的背景透明度 */
  backgroundOpacity?: number
  /** glass 模式下的边框宽度系数 */
  borderWidth?: number
  /** refraction 模式下的位移强度 */
  displace?: number
  /** refraction 模式下的扭曲缩放 */
  distortionScale?: number
  /** refraction 强度（0-100），用于统一控制色散/扭曲/高光层力度 */
  refractionStrength?: number
  /** refraction 质感预设（soft/filmic/cinematic） */
  refractionProfile?: BaseSurfaceRefractionProfile
  /** refraction 色调预设（mist/balanced/vivid） */
  refractionTone?: BaseSurfaceRefractionTone
  /** refraction 偏移角度（度），用于控制色散主方向 */
  refractionAngle?: number
  /** refraction 高光锚点 X（0-1），用于光源跟随 */
  refractionLightX?: number
  /** refraction 高光锚点 Y（0-1），用于光源跟随 */
  refractionLightY?: number
  /** refraction 高光 halo 透明度（0-1），不传时使用内置 filmic 模型计算 */
  refractionHaloOpacity?: number
  /** refraction 模式下的 R 通道偏移 */
  redOffset?: number
  /** refraction 模式下的 G 通道偏移 */
  greenOffset?: number
  /** refraction 模式下的 B 通道偏移 */
  blueOffset?: number
  /** refraction 模式下的 X 通道选择 */
  xChannel?: 'R' | 'G' | 'B'
  /** refraction 模式下的 Y 通道选择 */
  yChannel?: 'R' | 'G' | 'B'
  /** refraction 模式下的混合模式 */
  mixBlendMode?: GlassSurfaceProps['mixBlendMode']
  /** 是否正在运动（手动控制降级） */
  moving?: boolean
  /** 运动降级的目标模式，默认 'mask' */
  fallbackMode?: 'pure' | 'mask'
  /** 运动结束后恢复到目标模式的延迟 (ms)，默认 150 */
  settleDelay?: number
  /** 是否启用自动 transform 检测降级，默认 false */
  autoDetect?: boolean
  /** 过渡时长 (ms)，默认 260 */
  transitionDuration?: number
  /** 是否使用 fake-background 伪元素模式渲染 */
  fake?: boolean
  /** fake 模式下的 z-index，默认 0 */
  fakeIndex?: number
  /** 视觉预设，default 保持通用，card 用于卡片风格 */
  preset?: BaseSurfacePreset
  /** refraction 模式渲染器：svg 或 css */
  refractionRenderer?: BaseSurfaceRefractionRenderer
  /** 非 mask 模式下的可选 mask 层透明度（用于 1+3、2+3、1+2+3） */
  overlayOpacity?: number
  /** 标签名，默认 'div' */
  tag?: string
}
