// Ported from Amicro, commit 43c29ce9cdd16459e3eab4992381b8d35b38776a.
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { MotionLoaderLabels } from './types'

export type LoaderValue = string | number
export type LoaderValues = LoaderValue | LoaderValue[]

export interface LoaderTiming {
  duration?: number
  delay?: number
  ease?: string
  times?: number[]
  type?: 'spring'
  bounce?: number
}

export interface LoaderMotion {
  values: Record<string, LoaderValues>
  initial?: Record<string, LoaderValue>
  timing: LoaderTiming
  propertyTiming?: Record<string, LoaderTiming>
}

export interface LoaderText {
  label: keyof MotionLoaderLabels
}

export interface LoaderNode {
  tag: string
  style?: CSSProperties
  attrs?: Record<string, string | number>
  children?: (LoaderNode | LoaderText | string)[]
  motion?: LoaderMotion
  /** Repeat the first child once per localized character. */
  characters?: keyof MotionLoaderLabels
  characterDelay?: number
  characterSuffix?: string
  /** Native geometry scale for the large 292px physics scene. */
  zoom?: number
}
