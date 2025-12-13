import type { VibrateType } from '../../../../utils/vibrate'

export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
  /** 按钮尺寸 */
  size?: 'large' | 'small' | 'mini'
  /** 是否朴素按钮 */
  plain?: boolean
  /** 是否圆角按钮 */
  round?: boolean
  /** 是否圆形按钮 */
  circle?: boolean
  /** 是否加载中状态 */
  loading?: boolean
  /** 是否禁用状态 */
  disabled?: boolean
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
  click: [event: MouseEvent]
}
