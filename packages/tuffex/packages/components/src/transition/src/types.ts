/** `blur` fades the content through a short blur instead of moving it. */
export type TransitionPreset = 'fade' | 'slide-fade' | 'rebound' | 'blur' | 'smooth-size'

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

/** `forward` brings the next page in from the inline end; `back` from the inline start. */
export type TransitionPushDirection = 'forward' | 'back'

export interface TxTransitionPushProps {
  direction?: TransitionPushDirection

  /** Milliseconds. `0` swaps the page at once. */
  duration?: number

  easing?: string

  /** Tween the container from the old page's height to the new one's while they switch. */
  height?: boolean

  appear?: boolean
}
