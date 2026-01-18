import type { TxButtonProps } from '../../button'
import type { TxIconSource } from '../../icon'

export type EmptyStateVariant =
  | 'empty'
  | 'blank-slate'
  | 'no-data'
  | 'no-selection'
  | 'search-empty'
  | 'loading'
  | 'offline'
  | 'permission'
  | 'error'
  | 'custom'

export type EmptyStateLayout = 'vertical' | 'horizontal'

export type EmptyStateAlign = 'start' | 'center' | 'end'

export type EmptyStateSize = 'small' | 'medium' | 'large'

export type EmptyStateSurface = 'plain' | 'card'

export interface EmptyStateAction {
  label: string
  type?: TxButtonProps['type']
  variant?: TxButtonProps['variant']
  size?: TxButtonProps['size']
  disabled?: boolean
  icon?: string
}

export interface EmptyStateProps {
  variant?: EmptyStateVariant
  title?: string
  description?: string
  icon?: TxIconSource | string | null
  iconSize?: number
  layout?: EmptyStateLayout
  align?: EmptyStateAlign
  size?: EmptyStateSize
  surface?: EmptyStateSurface
  primaryAction?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  actionSize?: TxButtonProps['size']
  loading?: boolean
}

export interface EmptyStateEmits {
  (e: 'primary'): void
  (e: 'secondary'): void
}
