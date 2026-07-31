export type TxRadioValue = string | number
export type TxRadioType = 'button' | 'standard' | 'card'
export type TxRadioIndicatorVariant = 'solid' | 'outline' | 'glass' | 'blur'

export interface TxRadioGroupProps {
  modelValue?: TxRadioValue
  disabled?: boolean
  type?: TxRadioType
  direction?: 'row' | 'column'
  indicatorVariant?: TxRadioIndicatorVariant
  /** 启用玻璃效果（仅 button 类型有效） */
  glass?: boolean
  /** 启用模糊效果（仅 button 类型有效，比玻璃更轻量） */
  blur?: boolean
  /** 指示器动画到位后再触发 v-model 更新（仅 button 类型有效） */
  updateOnSettled?: boolean
  /** 弹簧刚度，值越大速度越快（默认 110） */
  stiffness?: number
  /** 弹簧阻尼，值越小越Q弹（默认 12） */
  damping?: number
  /** 模糊强度（默认 1） */
  blurAmount?: number
  /** 是否启用弹性动画（默认 true） */
  elastic?: boolean
}

export interface TxRadioProps {
  value: TxRadioValue
  disabled?: boolean
  label?: string
  type?: TxRadioType
  /** 独立使用（未包裹在 TxRadioGroup 内）时的选中状态，支持 v-model；在 group 内该值被忽略 */
  modelValue?: boolean
}
