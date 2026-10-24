import type { FunctionalComponent } from 'vue'
import { h } from 'vue'

export interface BrokenImageIconProps {
  /** Its width and height (px). */
  size: number
  strokeWidth: number
}

/** Drawn in place of a picture that failed to load: a frame with a hill and a sun, in `currentColor`. */
export const BrokenImageIcon: FunctionalComponent<BrokenImageIconProps> = props => h('svg', {
  'viewBox': '0 0 24 24',
  'width': props.size,
  'height': props.size,
  'fill': 'none',
  'stroke': 'currentColor',
  'stroke-width': props.strokeWidth,
  'aria-hidden': 'true',
}, [
  h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
  h('path', { d: 'm3 15 5-5 4 4 3-3 6 6' }),
  h('circle', { cx: 9, cy: 9, r: 1.4 }),
])

BrokenImageIcon.props = ['size', 'strokeWidth']
