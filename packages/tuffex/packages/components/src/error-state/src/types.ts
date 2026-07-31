import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type ErrorStateProps = Omit<EmptyStateProps, 'variant'>
export type ErrorStateEmits = EmptyStateEmits
