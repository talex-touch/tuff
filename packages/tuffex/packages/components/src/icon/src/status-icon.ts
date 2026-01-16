import type { TxIconSource } from './types'

export type TxStatusIconTone = 'none' | 'loading' | 'warning' | 'success' | 'error' | 'info'

export interface TxStatusIconProps {
  icon?: TxIconSource | null
  name?: string
  alt?: string
  size?: number
  empty?: string
  colorful?: boolean
  tone?: TxStatusIconTone
  indicatorSize?: number
  indicatorOffset?: number
}

