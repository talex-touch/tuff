import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type SearchEmptyProps = Omit<EmptyStateProps, 'variant'>
export type SearchEmptyEmits = EmptyStateEmits
