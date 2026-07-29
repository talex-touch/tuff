import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type LoadingStateProps = Omit<EmptyStateProps, 'variant'>
export type LoadingStateEmits = EmptyStateEmits
