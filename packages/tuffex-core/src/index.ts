// Core reactivity primitives (@vue/reactivity + signal helpers)
export * from './reactivity'

// Pure DOM, motion, and accessibility utilities
export * from './utils/env'
export * from './utils/drawn-scale'
export * from './utils/shown-box'
export * from './utils/focus-trap'
export * from './utils/roving-focus'
export * from './utils/hover-intent'
export * from './utils/escape-key'
export * from './utils/body-scroll-lock'
export * from './utils/z-index-manager'
export * from './utils/gesture'
export * from './utils/frame-loop'
export * from './utils/vibrate'
export * from './utils/clipboard'
export * from './utils/selection'

// Animation primitives
export * from './utils/animation/easing'
export * from './utils/animation/spring'
export * from './utils/animation/jelly'
export * from './utils/animation/theme-transition'
export * from './utils/animation/flip'
export * from './utils/animation/auto-resize'

// Headless controllers
export * from './controllers/floating'
export * from './controllers/stream-pacer'
export * from './controllers/ripple'

// Headless state machines
export * from './machines/tabs'
export * from './machines/collapse'
export * from './machines/dialog'
export * from './machines/select'
export * from './machines/slider'
export * from './machines/switch'
export * from './machines/checkbox'

// Single Source of Truth Compatibility Matrix
export * from './compat-registry'
