export type TxRadioValue = string | number
export type TxRadioType = 'button' | 'standard'

export interface TxRadioGroupProps {
  modelValue?: TxRadioValue
  disabled?: boolean
  type?: TxRadioType
  /** 启用玻璃效果（仅 button 类型有效） */
  glass?: boolean
  /** 弹簧刚度，值越大速度越快（默认 200） */
  stiffness?: number
  /** 弹簧阻尼，值越小越Q弹（默认 10） */
  damping?: number
}

export interface TxRadioProps {
  value: TxRadioValue
  disabled?: boolean
  label?: string
  type?: TxRadioType
}
