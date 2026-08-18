export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error'

export interface BadgeProps {
  variant?: BadgeVariant
  value?: number | string
  color?: string
  dot?: boolean
}
