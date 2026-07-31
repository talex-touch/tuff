import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type NoDataProps = Omit<EmptyStateProps, 'variant'>
export type NoDataEmits = EmptyStateEmits
