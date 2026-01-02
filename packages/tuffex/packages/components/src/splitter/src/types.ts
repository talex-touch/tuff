export type SplitterDirection = 'horizontal' | 'vertical'

export interface SplitterProps {
  modelValue?: number
  direction?: SplitterDirection
  min?: number
  max?: number
  disabled?: boolean
  barSize?: number
  snap?: number
}

export interface SplitterEmits {
  (e: 'update:modelValue', v: number): void
  (e: 'change', v: number): void
  (e: 'drag-start'): void
  (e: 'drag-end'): void
}
