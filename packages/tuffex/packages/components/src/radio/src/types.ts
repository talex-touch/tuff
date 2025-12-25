export type TxRadioValue = string | number
export type TxRadioType = 'button' | 'standard'

export interface TxRadioGroupProps {
  modelValue?: TxRadioValue
  disabled?: boolean
  type?: TxRadioType
  direction?: 'row' | 'column'
  /** 启用玻璃效果（仅 button 类型有效） */
  glass?: boolean
  /** 启用模糊效果（仅 button 类型有效，比玻璃更轻量） */
  blur?: boolean
  /** 弹簧刚度，值越大速度越快（默认 85） */
  stiffness?: number
  /** 弹簧阻尼，值越小越Q弹（默认 10） */
  damping?: number
  /** 模糊强度（默认 18） */
  blurAmount?: number
  /** 是否启用弹性动画（默认 true） */
  elastic?: boolean
}

export interface TxRadioProps {
  value: TxRadioValue
  disabled?: boolean
  label?: string
  type?: TxRadioType
}
