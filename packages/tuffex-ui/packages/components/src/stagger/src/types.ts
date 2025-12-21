export type StaggerEasing = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'

export interface StaggerProps {
  tag?: string
  appear?: boolean
  name?: string
  duration?: number
  delayStep?: number
  delayBase?: number
  easing?: StaggerEasing
}
