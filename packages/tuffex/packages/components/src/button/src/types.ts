import type { ButtonSize } from './size'
import type { VibrateType } from '../../../../utils/vibrate'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'
  /** 按钮尺寸；三档对应 26px / 32px / 38px */
  size?: ButtonSize
  block?: boolean
  /** 语义 tone 别名；未设置 variant 时用于推导视觉变体 */
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
  /** 是否朴素按钮 */
  plain?: boolean
  /** 虚线按钮 */
  dashed?: boolean
  /** 是否圆角按钮 */
  round?: boolean
  /** 是否圆形按钮 */
  circle?: boolean
  /** 是否加载中状态 */
  loading?: boolean
  /** 加载样式变体 */
  loadingVariant?: 'spinner' | 'bar'
  /** 按钮进度值（0–100）；传入有效数字时渲染背景进度条与数字读数 */
  progress?: number
  /** 是否显示进度百分比读数 */
  showProgress?: boolean
  /** 自定义进度读数格式化函数 */
  formatProgress?: (percentage: number) => string
  /** 结果反馈状态；与正常态、进度态连贯过渡 */
  status?: '' | 'success' | 'warning' | 'error'
  /** 是否禁用状态 */
  disabled?: boolean
  /** 是否显示边框 */
  border?: boolean
  /** 图标类名 */
  icon?: string
  /** 是否默认聚焦 */
  autofocus?: boolean
  /** 原生 type 属性 */
  nativeType?: 'button' | 'submit' | 'reset'
  /** 是否启用震动反馈 */
  vibrate?: boolean
  /** 震动类型 */
  vibrateType?: VibrateType
}

export interface ButtonEmits {
  /** 点击事件 */
  click: [ev: MouseEvent]
}
