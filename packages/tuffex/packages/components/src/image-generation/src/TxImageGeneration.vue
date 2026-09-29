<script setup lang="ts">
import type { Ref } from 'vue'
import type {
  ImageGenerationCycleEvent,
  ImageGenerationHandle,
  ImageGenerationPreset,
  ImageGenerationProps,
  ImageGenerationTheme,
} from './types'
import type { Cycle, Instance, SampledPalette } from './engine'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import {
  createCycle,
  createInstance,
  createReveal,
  destroyInstance,
  renderInstanceOnce,
  samplePaletteFromCanvas,
  setInstanceCardBg,
  setInstanceColors,
  setInstancePaused,
  setInstancePixelScale,
  setInstancePreset,
  setInstanceSpeed,
  setInstanceStrength,
  setInstanceVisible,
  setSharedFragmentShader,
  updateInstanceSize,
} from './engine'
import { PRESETS } from './presets'
import { ensureStylesInjected } from './styles'

// Vue port of the `<ImageGeneration>` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// `src/engine/**`, `src/presets/**` and `src/styles.ts` are upstream verbatim
// (see their own sign-off headers); this SFC only mirrors the wrapper behavior:
// theme resolution, the mount-only instance/reveal/cycle lifecycle, prop→engine
// syncing, the theme/resize/mutation/intersection observers and the imperative
// handle.

ensureStylesInjected()

/**
 * Resolve `'auto'` to a concrete `'dark' | 'light'` value, checking sources in
 * priority order so the library plays nicely with the most common app-side
 * theme conventions (not just the OS-level media query):
 *
 *   1. `<html data-theme="dark|light">`          — shadcn / many SSR apps
 *   2. `<html class="dark">` / `class="light">`  — Tailwind v3 darkMode: class
 *   3. `<html style="color-scheme: dark">`       — CSS-only theme toggles
 *   4. `matchMedia('(prefers-color-scheme: dark)')` — OS / browser preference
 *   5. Default `'dark'`                          — SSR-safe fallback
 *
 * Live updates: subscribed to both the matchMedia change event AND a
 * MutationObserver on `<html>` for `class` / `style` / `data-theme` changes,
 * so toggling a theme-class via JS reflects in the shader without remount.
 */
function detectTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined')
    return 'dark'
  const html = document.documentElement

  const dataTheme = html.getAttribute('data-theme')
  if (dataTheme === 'dark' || dataTheme === 'light')
    return dataTheme

  if (html.classList.contains('dark'))
    return 'dark'
  if (html.classList.contains('light'))
    return 'light'

  const colorScheme = html.style.colorScheme || getComputedStyle(html).colorScheme
  if (colorScheme === 'dark')
    return 'dark'
  if (colorScheme === 'light')
    return 'light'

  if (typeof window !== 'undefined' && window.matchMedia)
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  return 'dark'
}

function useResolvedTheme(theme: Ref<ImageGenerationTheme>): Ref<'dark' | 'light'> {
  const resolved = ref<'dark' | 'light'>(theme.value !== 'auto' ? theme.value : detectTheme())

  watchEffect((onCleanup) => {
    const mode = theme.value
    if (mode !== 'auto') {
      resolved.value = mode
      return
    }
    if (typeof window === 'undefined')
      return

    const update = (): void => {
      resolved.value = detectTheme()
    }
    update()

    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
    mql?.addEventListener('change', update)

    let mo: MutationObserver | null = null
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(update)
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      })
    }

    onCleanup(() => {
      mql?.removeEventListener('change', update)
      mo?.disconnect()
    })
  })

  return resolved
}

function normaliseImages(input: string | string[] | undefined): string[] {
  if (!input)
    return []
  if (typeof input === 'string')
    return [input]
  return input.slice()
}

/** The regenerate churn always runs on one of these pixel-mosaic presets. */
const PIXEL_CHURN_PRESETS = ['pixels-mechanic', 'pixels-organic'] as const

type PixelChurnPreset = (typeof PIXEL_CHURN_PRESETS)[number]

function isPixelChurnPreset(name: ImageGenerationPreset): name is PixelChurnPreset {
  return (PIXEL_CHURN_PRESETS as readonly string[]).includes(name)
}

defineOptions({
  name: 'TxImageGeneration',
})

const props = withDefaults(defineProps<ImageGenerationProps>(), {
  preset: 'pixels-organic',
  theme: 'auto',
  strength: 1,
  speed: 1,
  pixelScale: 1,
  autoReveal: false,
  revealDelayRange: () => [2, 4] as [number, number],
  revealHoldMs: 2000,
  revealFadeOutMs: 300,
  paused: false,
})

const emit = defineEmits<{
  /** Phase event of the auto-reveal cycle (upstream's `onCycle` prop). */
  cycle: [event: ImageGenerationCycleEvent]
}>()

const rootRef = ref<HTMLDivElement | null>(null)
const shaderCanvasRef = ref<HTMLCanvasElement | null>(null)
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)
const contentRef = ref<HTMLDivElement | null>(null)
let instance: Instance | null = null
let cycle: Cycle | null = null
let teardown: (() => void) | null = null

// Transient image-derived recolor for the regenerate churn. While set, it
// overrides the palette + card surface (shader uniforms AND the wrapper's
// CSS background) so the effect wears the outgoing image's colors; cleared
// automatically when the next image reaches `visible`.
const regenTint = ref<SampledPalette | null>(null)

// Transient preset override for the regenerate churn. The churn must always
// run on a pixel-mosaic preset (`pixels-mechanic` / `pixels-organic`): when
// the active preset is not one of those (e.g. `sweep-gradient`), a random
// pixel preset is swapped onto the instance for the churn's duration and
// the authored preset is restored once the next image is fully visible.
const regenPresetName = ref<ImageGenerationPreset | null>(null)

const resolvedTheme = useResolvedTheme(computed(() => props.theme))
const presetMode = computed(() => PRESETS[props.preset].modes[resolvedTheme.value])
// Effective background colour (override > preset). Drives both the wrapper's
// CSS background and the shader's `u_cardBg` uniform so contrast logic in
// the shader stays in sync with the actual host card surface.
const cardBg = computed(() => props.cardBg ?? presetMode.value.cardBg)

// Normalised image pool, read by the mount-only lifecycle effect (the cycle
// itself is created there so manual `triggerReveal()` works regardless of the
// `autoReveal` flag).
const imagesArr = computed(() => normaliseImages(props.images))

// Resolve `revealInitialDelay` into a stable ms value at mount time.
// Range tuples randomise ONCE here so re-renders never reseed the value.
const initialDelayMs = ((): number | undefined => {
  const delay = props.revealInitialDelay
  if (delay == null)
    return undefined
  if (typeof delay === 'number')
    return Math.max(0, delay) * 1000
  const [min, max] = delay
  const lo = Math.max(0, Math.min(min, max))
  const hi = Math.max(0, Math.max(min, max))
  return (lo + Math.random() * (hi - lo)) * 1000
})()

function triggerRegenerate(opts?: {
  durationMs?: number
  tintFromImage?: boolean
  autoReveal?: boolean
}): void {
  const activeCycle = cycle
  if (!activeCycle || props.paused)
    return
  const phase = activeCycle.getPhase()
  if (phase !== 'reveal' && phase !== 'visible')
    return
  // The churn always runs on a pixel-mosaic preset: keep the active
  // preset when it's already one, otherwise (e.g. sweep-gradient)
  // temporarily switch the instance to a random pixel preset. The
  // authored preset is restored when the next image reaches `visible`.
  const activePreset = props.preset
  const churnName = isPixelChurnPreset(activePreset)
    ? null
    : PIXEL_CHURN_PRESETS[Math.floor(Math.random() * PIXEL_CHURN_PRESETS.length)]!
  // Recolor the effect from the visible image (overlay canvas) so the
  // churn showing through the dropped cells reads as pixelation born
  // from that image rather than the preset's stock palette. The sample
  // maps onto the CHURN preset's palette slots (the preset actually
  // rendering during the churn), not the outgoing preset's.
  if (opts?.tintFromImage ?? true) {
    const overlay = overlayCanvasRef.value
    if (overlay) {
      const churnColors = churnName
        ? PRESETS[churnName].modes[resolvedTheme.value].colors
        : presetMode.value.colors
      const sampled = samplePaletteFromCanvas(overlay, churnColors)
      if (sampled)
        regenTint.value = sampled
    }
  }
  if (churnName)
    regenPresetName.value = churnName
  const autoReveal = opts?.autoReveal ?? true
  activeCycle.triggerBoil(
    autoReveal ? { autoRevealAfterMs: opts?.durationMs ?? 4000 } : undefined,
  )
}

defineExpose<ImageGenerationHandle>({
  get element() {
    return rootRef.value
  },
  triggerReveal(opts) {
    cycle?.triggerOnce(opts)
  },
  triggerHide() {
    cycle?.triggerHide()
  },
  triggerRegenerate,
  isImageActive() {
    const phase = cycle?.getPhase() ?? 'idle'
    return phase === 'reveal' || phase === 'visible' || phase === 'hide'
  },
})

onMounted(() => {
  ensureStylesInjected()

  const root = rootRef.value
  const shader = shaderCanvasRef.value
  const overlay = overlayCanvasRef.value
  if (!root || !shader || !overlay)
    return

  // Dynamic measure: size from the root's bounding box and corner radius
  // from the wrapped child's computed style (falls back to the root if the
  // child has none). The shader can only render a single uniform corner
  // radius, so we sample `borderTopLeftRadius` and apply it on all four
  // corners — matches how the canvases inherit border-radius from the root.
  const measure = (): { w: number, h: number, r: number } => {
    const rect = root.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    let r = 0
    if (typeof props.borderRadius === 'number') {
      r = props.borderRadius
    }
    else {
      const childEl = contentRef.value?.firstElementChild as HTMLElement | null
      if (childEl) {
        const parsed = Number.parseFloat(getComputedStyle(childEl).borderTopLeftRadius)
        if (Number.isFinite(parsed) && parsed > 0)
          r = parsed
      }
      if (r === 0) {
        const parsed = Number.parseFloat(getComputedStyle(root).borderTopLeftRadius)
        if (Number.isFinite(parsed) && parsed > 0)
          r = parsed
      }
    }
    return { w, h, r }
  }

  const initial = measure()
  const inst = createInstance({
    canvas: shader,
    cssWidth: initial.w,
    cssHeight: initial.h,
    preset: presetMode.value,
    strength: props.strength,
    speed: props.speed,
    cardBg: props.cardBg ?? null,
    pixelScale: props.pixelScale,
  })
  instance = inst
  inst.canvas.style.opacity = String(Math.max(0, Math.min(1, props.strength)))

  const reveal = createReveal({
    canvas: overlay,
    cssWidth: initial.w,
    cssHeight: initial.h,
    shaderCanvas: shader,
  })
  inst.reveal = reveal

  const cyc = createCycle({
    reveal,
    images: imagesArr.value,
    delayRange: props.revealDelayRange,
    holdMs: props.revealHoldMs,
    fadeOutMs: props.revealFadeOutMs,
    initialDelayMs,
    onPhase: (e) => {
      // A fully-visible image ends any regenerate churn — restore the
      // preset palette / consumer-provided colors and the authored preset.
      if (e.phase === 'visible') {
        regenTint.value = null
        regenPresetName.value = null
      }
      emit('cycle', e)
    },
    excludeSrcs: () => props.excludeSrcs?.() ?? null,
  })
  cycle = cyc
  setInstancePaused(inst, props.paused)
  cyc.setPaused(props.paused)
  // The cycle is created up-front (independent of `autoReveal`) so that the
  // imperative `triggerReveal()` works for manual user-driven reveals too.
  if (props.autoReveal)
    cyc.start()
  if (props.fragmentShader)
    setSharedFragmentShader(props.fragmentShader)

  root.style.setProperty('--image-gen-radius', `${initial.r}px`)
  root.style.borderRadius = `${initial.r}px`

  // Sync the wrapper's dimensions + corner radius to the host card.
  //
  // The radius must follow the wrapped child dynamically so the effect
  // always matches whatever the consumer's card looks like — even if they
  // toggle a class, adjust an inline style, or swap the child entirely.
  //
  // Three observers handle the three change vectors:
  //   1. ResizeObserver on root  -> wrapper resized (window resize, parent
  //      flex/grid change, container query, etc.)
  //   2. ResizeObserver on child -> child intrinsic size changed (text
  //      reflow, image load), which can also imply a CSS recalc that
  //      affects radius.
  //   3. MutationObserver on child -> class / style / data-* attribute
  //      changes that may swap border-radius without touching size (theme
  //      toggle, hover/active class flip from parent, etc.).
  //
  // All three coalesce through a single rAF so the canvas isn't resized
  // more than once per frame.
  let resizeRaf = 0
  let lastW = -1
  let lastH = -1
  let lastR = -1
  const applyMeasure = (): void => {
    resizeRaf = 0
    const i = instance
    if (!i)
      return
    const next = measure()
    // Skip GL resize if dimensions didn't actually change; still re-apply
    // border-radius because that's the cheap part and may have moved.
    if (next.w !== lastW || next.h !== lastH) {
      updateInstanceSize(i, next.w, next.h)
      lastW = next.w
      lastH = next.h
    }
    if (next.r !== lastR) {
      root.style.setProperty('--image-gen-radius', `${next.r}px`)
      root.style.borderRadius = `${next.r}px`
      lastR = next.r
    }
  }
  const scheduleMeasure = (): void => {
    if (resizeRaf !== 0)
      return
    resizeRaf = requestAnimationFrame(applyMeasure)
  }

  const ro = new ResizeObserver(scheduleMeasure)
  ro.observe(root)
  const childEl = contentRef.value?.firstElementChild as HTMLElement | null
  if (childEl)
    ro.observe(childEl)

  // Watch for CSS-affecting attribute changes on the child so radius
  // updates that don't trigger a resize (e.g. swapping a `rounded-lg`
  // class with `rounded-xl`) are still reflected immediately.
  let mo: MutationObserver | null = null
  if (childEl && typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(scheduleMeasure)
    mo.observe(childEl, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }
  // Initialise cached dimensions from the first measure so the guard
  // above doesn't spuriously re-apply identical values on the next tick.
  lastW = initial.w
  lastH = initial.h
  lastR = initial.r

  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entries) => {
        const i = instance
        if (!i)
          return
        for (const e of entries)
          setInstanceVisible(i, e.isIntersecting)
      },
      { rootMargin: '64px' },
    )
    io.observe(root)
  }

  teardown = () => {
    ro.disconnect()
    mo?.disconnect()
    io?.disconnect()
    if (resizeRaf !== 0)
      cancelAnimationFrame(resizeRaf)
    cycle?.dispose()
    cycle = null
    reveal.dispose()
    if (instance)
      destroyInstance(instance)
    instance = null
    if (props.fragmentShader)
      setSharedFragmentShader(null)
  }
})

onBeforeUnmount(() => {
  teardown?.()
  teardown = null
})

// Sync preset/theme to the instance + force a one-shot repaint so paused
// instances reflect the prop change live (rAF tick is gated on `!paused`).
// An active regenerate churn preset override takes precedence over the prop.
watch([presetMode, regenPresetName, resolvedTheme], () => {
  const i = instance
  if (!i)
    return
  const effectiveMode = regenPresetName.value
    ? PRESETS[regenPresetName.value].modes[resolvedTheme.value]
    : presetMode.value
  setInstancePreset(i, effectiveMode)
  renderInstanceOnce(i)
})

// Sync cardBg override to the instance (shader uniform + reveal helper),
// then repaint once so the change shows immediately even while paused.
// An active regenerate tint takes precedence over the prop.
watch([() => props.cardBg, regenTint], () => {
  const i = instance
  if (!i)
    return
  setInstanceCardBg(i, regenTint.value?.cardBg ?? props.cardBg ?? null)
  renderInstanceOnce(i)
})

// Sync the palette override (per-slot colors, e.g. sampled from an image).
// An active regenerate tint takes precedence over the prop.
watch([() => props.colors, regenTint], () => {
  const i = instance
  if (!i)
    return
  setInstanceColors(i, regenTint.value?.colors ?? props.colors ?? null)
  renderInstanceOnce(i)
})

// Sync strength via the visible canvas opacity (no shader recompile).
// The `opacity` style change is purely DOM and applies even while paused;
// no GL repaint needed.
watch(() => props.strength, (strength) => {
  const i = instance
  if (!i)
    return
  setInstanceStrength(i, strength)
  if (i.canvas)
    i.canvas.style.opacity = String(Math.max(0, Math.min(1, strength)))
})

// Sync speed — scales the instance's animation clock, no repaint needed.
watch(() => props.speed, (speed) => {
  const i = instance
  if (!i)
    return
  setInstanceSpeed(i, speed)
})

// Sync pixelScale (recomputes the mosaic grid density) and repaint once so
// the change is visible immediately even while paused.
watch(() => props.pixelScale, (pixelScale) => {
  const i = instance
  if (!i)
    return
  setInstancePixelScale(i, pixelScale)
  renderInstanceOnce(i)
})

// Custom fragment stage: page-wide while set, back to the bundled one when
// this instance drops it (or unmounts — see `teardown`).
watch(() => props.fragmentShader, (src) => {
  setSharedFragmentShader(src ?? null)
})

// Sync paused.
watch(() => props.paused, (paused) => {
  const i = instance
  if (i)
    setInstancePaused(i, paused)
  cycle?.setPaused(paused)
})

// Patch live updates to the always-on cycle (avoid recreating per prop change).
watch(imagesArr, (images) => {
  cycle?.setImages(images)
})
watch(
  [() => props.revealDelayRange, () => props.revealHoldMs, () => props.revealFadeOutMs],
  () => {
    cycle?.setOptions({
      delayRange: props.revealDelayRange,
      holdMs: props.revealHoldMs,
      fadeOutMs: props.revealFadeOutMs,
    })
  },
)

// Start/stop the auto-loop in response to the `autoReveal` flag. The cycle
// itself is created on mount so manual `triggerReveal()` works even when
// `autoReveal === false`.
watch(() => props.autoReveal, (autoReveal) => {
  const activeCycle = cycle
  if (!activeCycle)
    return
  if (autoReveal)
    activeCycle.start()
  else
    activeCycle.stop()
})
</script>

<template>
  <div
    ref="rootRef"
    class="image-gen-root"
    :data-preset="props.preset"
    :data-theme="resolvedTheme"
    :data-paused="props.paused ? 'true' : undefined"
    :style="{ background: regenTint?.cardBg ?? cardBg }"
  >
    <canvas ref="shaderCanvasRef" class="image-gen-shader" aria-hidden="true" />
    <canvas ref="overlayCanvasRef" class="image-gen-overlay" aria-hidden="true" />
    <div ref="contentRef" class="image-gen-child">
      <slot />
    </div>
  </div>
</template>
