export type TxRadioValue = string | number
export type TxRadioType = 'button' | 'standard'

export interface TxRadioGroupProps {
  modelValue?: TxRadioValue
  disabled?: boolean
  type?: TxRadioType
}

export interface TxRadioProps {
  value: TxRadioValue
  disabled?: boolean
  label?: string
  type?: TxRadioType
}
