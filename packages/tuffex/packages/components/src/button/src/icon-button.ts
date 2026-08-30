export interface TxIconButtonProps {
  icon?: string
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  shape?: 'square' | 'circle' | 'pill'
  pressed?: boolean
  /** Semantic visual tone; neutral when omitted. */
  status?: 'success' | 'warning' | 'danger' | 'info'
  disabled?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
}
