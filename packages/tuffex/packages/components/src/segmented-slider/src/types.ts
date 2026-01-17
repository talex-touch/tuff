export interface SegmentedSliderSegment {
  value: number | string
  label?: string
}

export interface SegmentedSliderProps {
  modelValue?: number | string
  segments?: SegmentedSliderSegment[]
  disabled?: boolean
  showLabels?: boolean
  vertical?: boolean
}

export interface SegmentedSliderEmits {
  'update:modelValue': [value: number | string]
  'change': [value: number | string]
}
