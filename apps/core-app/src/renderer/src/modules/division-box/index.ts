/**
 * DivisionBox Module - Renderer Process
 *
 * Main entry point for the DivisionBox module in the renderer process.
 * Exports components, composables, store, and types.
 */

export { default as DivisionBoxHeader } from './components/DivisionBoxHeader.vue'
// Components
export { default as DivisionBoxShell } from './components/DivisionBoxShell.vue'
export { default as DockHint } from './components/DockHint.vue'

// Composables
export { useDrag } from './composables/useDrag'
export { useResize } from './composables/useResize'

// Store
export { useDivisionBoxStore } from './store/division-box'

// Types
export * from './types'
