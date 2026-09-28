// Module-scope glue for `TxMetalFx` — the subset of `MetalFx.tsx`'s module body
// that must exist once per module rather than once per component instance
// (styles injection, the hoisted style objects, the instance → glow map and the
// shared loop's glow callback). React module scope has no Vue equivalent inside
// `<script setup>`, whose body compiles into `setup()`.

import type { CSSProperties } from 'vue'
import { updateGlow, type GlowHandles } from './engine/glow/glow'
import type { MetalFxInstance } from './engine/renderer/core'
import { setGlowCallback } from './engine/renderer/loop'
import { ensureStylesInjected } from './styles'

// Runs at module scope so styles exist before the first component render,
// even in SSR-hydration scenarios where effects haven't fired yet.
ensureStylesInjected()

// Hoisted to avoid allocating new objects on every render.
export const CANVAS_STYLE: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }
export const INNER_STYLE: CSSProperties = { position: 'absolute', inset: 3 }
export const GLOW_HOST_STYLE: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, borderRadius: 'inherit' }
// Rim sits above the metal and the glow, below the content.
export const RIM_HOST_STYLE: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }

// Maps each live instance to its SVG glow handles and a theme ref.
// Keyed by instance (not component) because the same component can be
// remounted with a new instance after shape/glowEnabled changes.
export const glowHandlesMap = new Map<MetalFxInstance, { handles: GlowHandles; themeRef: { current: 'dark' | 'light' } }>()

// Opt-in introspection for the demo's dev tooling: with
// `globalThis.__MFX_DEBUG__ = true` the live instance → glow map is exposed
// as `globalThis.__mfxGlow` on the next mount. Never set in production.
export function exposeGlowDebug(): void {
  const g = globalThis as { __MFX_DEBUG__?: boolean; __mfxGlow?: unknown }
  if (g.__MFX_DEBUG__) g.__mfxGlow = glowHandlesMap
}

// Bridge between the shared animation loop and per-instance glow SVGs.
// The loop module doesn't import glow directly — it invokes this callback
// for one queued instance per frame (round-robin), keeping render work
// proportional to frame budget regardless of instance count.
setGlowCallback((inst, nowMs) => {
  const entry = glowHandlesMap.get(inst)
  if (!entry) return false
  return updateGlow(entry.handles, inst, nowMs, inst.opacityMul * inst.glowGain, entry.themeRef.current)
})
