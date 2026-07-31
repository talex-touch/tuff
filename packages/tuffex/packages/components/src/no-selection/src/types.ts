import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type NoSelectionProps = Omit<EmptyStateProps, 'variant'>
export type NoSelectionEmits = EmptyStateEmits
