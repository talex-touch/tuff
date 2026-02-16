export type BaseSurfaceMode = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'

export interface BaseSurfaceProps {
  /** 背景模式 */
  mode?: BaseSurfaceMode
  /** 自定义圆角，不传则 inherit 父元素 */
  radius?: string | number
  /** 纯色/遮罩的背景色，默认使用 CSS 变量 */
  color?: string
  /** mask 模式下的透明度 (0-1) */
  opacity?: number
  /** blur 模式下的模糊强度 (px) */
  blur?: number
  /** glass/refraction 模式下的饱和度 */
  saturation?: number
  /** glass/refraction 模式下的亮度 */
  brightness?: number
  /** glass 模式下的背景透明度 */
  backgroundOpacity?: number
  /** glass 模式下的边框宽度系数 */
  borderWidth?: number
  /** refraction 模式下的位移强度 */
  displace?: number
  /** refraction 模式下的扭曲缩放 */
  distortionScale?: number
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
  mixBlendMode?: string
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
  /** 标签名，默认 'div' */
  tag?: string
}
