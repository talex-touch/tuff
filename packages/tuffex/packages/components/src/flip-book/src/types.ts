// SPDX-License-Identifier: Apache-2.0
// Modified: typed Vue/TuffEx API derived from Amicro DitherBook.tsx.
// Source commit: 43c29ce9cdd16459e3eab4992381b8d35b38776a.
export interface FlipBookPage {
  id?: string | number
  title?: string
  src?: string
  alt?: string
  content?: string
}
export interface FlipBookSettings {
  padding: number
  imageRadius: number
  creaseOpacity: number
  paperColor: string
  shadowIntensity: number
}
export interface FlipBookLabels {
  previous?: string
  next?: string
  settings?: string
  padding?: string
  imageRadius?: string
  creaseOpacity?: string
  paperColor?: string
  shadowIntensity?: string
  intro?: string
}
export interface FlipBookProps {
  pages: FlipBookPage[]
  modelValue?: number
  mode?: 'book' | 'dither-book' | 'extracted-book'
  compact?: boolean
  settings?: Partial<FlipBookSettings>
  padding?: number
  imageRadius?: number
  creaseOpacity?: number
  paperColor?: string
  shadowIntensity?: number
  loop?: boolean
  controls?: boolean
  settingsPanel?: boolean
  intro?: boolean
  introFlips?: number
  animated?: boolean
  disabled?: boolean
  duration?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ariaLabel?: string
  labels?: FlipBookLabels
}
export interface FlipBookEmits {
  (e: 'update:modelValue', index: number): void
  (e: 'update:settings', settings: FlipBookSettings): void
  (e: 'change', page: FlipBookPage, index: number): void
  (e: 'flip-start', from: number, to: number, direction: 1 | -1): void
  (e: 'flip-end', index: number): void
}
export interface FlipBookSlotProps {
  page: FlipBookPage
  index: number
  side: 'left' | 'right' | 'front' | 'back'
}
