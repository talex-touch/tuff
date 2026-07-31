import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type PermissionStateProps = Omit<EmptyStateProps, 'variant'>
export type PermissionStateEmits = EmptyStateEmits
