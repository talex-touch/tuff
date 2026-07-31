import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type BlankSlateProps = Omit<EmptyStateProps, 'variant'>
export type BlankSlateEmits = EmptyStateEmits
