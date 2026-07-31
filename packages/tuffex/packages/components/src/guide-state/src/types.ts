import type { EmptyStateEmits, EmptyStateProps } from '../../empty-state'

export type GuideStateProps = Omit<EmptyStateProps, 'variant'>
export type GuideStateEmits = EmptyStateEmits
