// Ported from torph/src/lib/utils/reduced-motion.ts (https://github.com/lochie/torph).
// MIT License © lochie. Kept intentionally close to upstream so its fixes stay
// diffable; deviations are limited to tuffex lint style and a guard for
// environments where `matchMedia` exists but predates `addEventListener`.

export interface ReducedMotionState {
  readonly prefersReducedMotion: boolean
  destroy: () => void
}

export function createReducedMotionListener(): ReducedMotionState {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return { prefersReducedMotion: false, destroy: () => {} }

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const state = { prefersReducedMotion: mediaQuery.matches, destroy }

  function onChange(event: MediaQueryListEvent) {
    state.prefersReducedMotion = event.matches
  }

  function destroy() {
    mediaQuery.removeEventListener?.('change', onChange)
  }

  mediaQuery.addEventListener?.('change', onChange)
  return state
}
