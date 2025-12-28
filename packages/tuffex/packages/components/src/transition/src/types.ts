export type TransitionPreset = 'fade' | 'slide-fade' | 'rebound' | 'smooth-size'

export interface TxTransitionProps {
  preset?: TransitionPreset

  group?: boolean

  tag?: string

  appear?: boolean

  mode?: 'in-out' | 'out-in'

  duration?: number

  easing?: string
}

export interface TxTransitionSmoothSizeProps {
  appear?: boolean

  mode?: 'in-out' | 'out-in'

  duration?: number

  easing?: string

  width?: boolean

  height?: boolean

  motion?: Exclude<TransitionPreset, 'smooth-size'>
}
