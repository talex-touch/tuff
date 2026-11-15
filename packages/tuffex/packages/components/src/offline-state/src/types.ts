import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type OfflineStateProps = Omit<EmptyStateProps, 'variant'>
export type OfflineStateEmits = EmptyStateEmits
