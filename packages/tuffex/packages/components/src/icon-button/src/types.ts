export interface TxIconButtonProps {
  icon?: string
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  shape?: 'square' | 'circle' | 'pill'
  pressed?: boolean
  disabled?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
}
