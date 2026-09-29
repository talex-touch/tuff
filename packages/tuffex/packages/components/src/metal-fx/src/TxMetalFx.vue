<script setup lang="ts">
// Vue port of the `MetalFx` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// `styles.ts` and the whole `engine/**` tree are verbatim upstream; this SFC
// only mirrors the wrapper behavior — instance lifecycle, glow/rim hosting,
// reflection targets, theme resolution and the WebGL2-less fallback. The
// module-scope half of the React file lives in `./glow-bridge`.

import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch, watchEffect, type CSSProperties, type StyleValue } from 'vue'
import { attachCursorLight, detachCursorLight } from './engine/cursor/light'
import { subscribeGlowConfig } from './engine/glow/config'
import { carryGlowState, injectGlow, updateGlowMask, type GlowHandles, type GlowOptions } from './engine/glow/glow'
import { addReflectionTarget, removeReflectionTarget } from './engine/reflection/paint'
import { scheduleReflectionPaint } from './engine/reflection/reflection-scheduler'
import { isMetalFxSupported, type MetalFxInstance } from './engine/renderer/core'
import {
  createInstance,
  destroyInstance,
  refreshInstanceDpr,
  registerGlowInstance,
  setInstanceVisible,
  setSharedPreset,
  unregisterGlowInstance,
  updateInstance,
} from './engine/renderer/loop'
import { RIM_DEFAULTS, injectRim, removeRim, updateRim, type RimHandles, type RimOptions } from './engine/rim'
import { CANVAS_STYLE, GLOW_HOST_STYLE, INNER_STYLE, RIM_HOST_STYLE, exposeGlowDebug, glowHandlesMap } from './glow-bridge'
import { isElementTarget, type MetalFxProps } from './types'

defineOptions({
  name: 'TxMetalFx',
  // `class` / `style` are merged onto the root by hand (upstream spreads
  // `className` into the class list and `style` last, under the library's own
  // `--mfx-strength` / reveal keys), so fallthrough is disabled and the rest of
  // `$attrs` is re-bound explicitly.
  inheritAttrs: false,
})

const props = withDefaults(defineProps<MetalFxProps>(), {
  variant: 'button',
  preset: 'chromatic',
  theme: 'auto',
  strength: 1,
  glowGain: 1,
  paused: false,
  normalizeHostStyles: true,
  disableGlow: false,
  scale: 1,
  glowMode: 'mask',
})

const attrs = useAttrs()

// DOM refs — for direct DOM access; the engine objects below are plain
// variables that survive re-renders without making anything reactive.
const rootEl = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const glowHostEl = ref<HTMLDivElement | null>(null)
const rimHostEl = ref<HTMLDivElement | null>(null)
const contentEl = ref<HTMLDivElement | null>(null)
let instance: MetalFxInstance | null = null
let glowHandles: GlowHandles | null = null
let rimHandles: RimHandles | null = null
// themeRef lets the glow callback read the current theme without a closure
// over a stale value — written by a watcher, never triggers a re-render.
const themeRef: { current: 'dark' | 'light' } = { current: 'dark' }
// Caches the CSS border-radius read at mount time so measure() can fall back
// to it when no explicit borderRadius prop is given.
let initialWrapperRadius = 0

const ready = ref(false)

/**
 * Resolves 'auto' theme to 'dark' | 'light' and keeps it in sync with
 * the OS preference via matchMedia.
 *
 * The initial value is read synchronously so it is available on the first
 * render (no flash); the watcher then attaches the MQL listener and calls
 * update() immediately to handle the case where the OS preference changed
 * between SSR and hydration.
 */
function osTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const resolvedTheme = ref<'dark' | 'light'>(props.theme === 'auto' ? osTheme() : props.theme)

watchEffect((onCleanup) => {
  const theme = props.theme
  if (theme !== 'auto') {
    resolvedTheme.value = theme
    return
  }
  if (typeof window === 'undefined' || !window.matchMedia) return
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const update = () => {
    resolvedTheme.value = mql.matches ? 'dark' : 'light'
  }
  update()
  mql.addEventListener('change', update)
  onCleanup(() => mql.removeEventListener('change', update))
})

// No WebGL2 → no engine. Every effect below bails on this, and the render
// falls through to the plain child so the button is never lost.
const supported = isMetalFxSupported()
// Writes the resolved theme outside render so the glow callback always sees
// the up-to-date value on the very next tick.
watch(resolvedTheme, (theme) => {
  themeRef.current = theme
}, { immediate: true })

const shape = computed<'pill' | 'circle'>(() => (props.variant === 'circle' ? 'circle' : 'pill'))
const glowEnabled = computed(() => !props.disableGlow)

const resolveRadius = (w: number, h: number): number => {
  // variant='circle' is the user's explicit promise that the wrapped
  // element should render as a circle. Always pick min(w,h)/2 so the
  // engine produces a true circle even when the child's CSS border-radius
  // is read in a different coordinate space than the bounding rect (the
  // exact failure mode under CSS `zoom: 2`, where getComputedStyle
  // returns source pixels but getBoundingClientRect returns zoomed ones).
  if (shape.value === 'circle') return Math.min(w, h) / 2

  const raw = typeof props.borderRadius === 'number'
    ? props.borderRadius
    : (() => {
        const childEl = contentEl.value?.firstElementChild as HTMLElement | null
        if (childEl) {
          const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius)
          if (Number.isFinite(parsed) && parsed > 0) return parsed
        }
        return initialWrapperRadius
      })()
  return Math.min(raw, Math.min(w, h) / 2)
}

// Dark-mode only: no DOM work in light mode (and no scan of the targets).
let detachReflection: (() => void) | null = null
const bindReflection = (): void => {
  detachReflection?.()
  detachReflection = null
  const inst = instance
  const root = rootEl.value
  const targets = props.reflectionTargets
  if (!inst || !root || !targets || resolvedTheme.value !== 'dark') return

  // onAfterFrame is wired here rather than at createInstance time so instances
  // without reflectionTargets never schedule the reflection RAF.
  inst.onAfterFrame = scheduleReflectionPaint
  const live = targets.flatMap((target) => {
    const el = isElementTarget(target) ? target : 'value' in target ? target.value : target.ref.value
    const strength = isElementTarget(target) || 'value' in target ? 1 : (target.strength ?? 1)
    return el ? [{ el, strength }] : []
  })
  for (const { el, strength } of live) addReflectionTarget(el, inst, root, strength)
  detachReflection = () => {
    inst.onAfterFrame = undefined
    for (const { el } of live) removeReflectionTarget(el)
  }
}

// One instance lifecycle. Upstream runs this from `useLayoutEffect` with
// `[shape]`: created on mount, torn down and re-created when the shape flips.
let teardown: (() => void) | null = null
const mountFx = (): void => {
  teardown?.()
  teardown = null
  const canvas = canvasEl.value
  const root = rootEl.value
  const glowHost = glowHostEl.value
  if (!canvas || !root || !supported) return

  {
    const rootStyle = getComputedStyle(root)
    const parsed = parseFloat(rootStyle.borderTopLeftRadius)
    initialWrapperRadius = Number.isFinite(parsed) ? parsed : 0
  }

  const measure = () => {
    const rect = root.getBoundingClientRect()
    const cssWidth = Math.max(1, Math.round(rect.width))
    const cssHeight = Math.max(1, Math.round(rect.height))
    return { cssWidth, cssHeight, cornerRadius: resolveRadius(cssWidth, cssHeight) }
  }

  const initial = measure()
  const created = createInstance({
    onComposite: () => {
      const inst = instance
      if (inst && glowHandles) updateGlowMask(glowHandles, inst.deform)
      if (inst && rimHandles) updateRim(rimHandles, inst.deform)
    },
    hostCanvas: canvas,
    cssWidth: initial.cssWidth,
    cssHeight: initial.cssHeight,
    cornerRadius: initial.cornerRadius,
    kind: shape.value,
    paused: props.paused,
    shaderScale: props.shaderScale,
    ringCssPx: props.ringCssPx,
    scale: props.scale,
    mask: props.mask ?? null,
    onFirstCopy: () => {
      ready.value = true
    },
  })
  instance = created
  root.style.setProperty('--mfx-radius', `${initial.cornerRadius}px`)
  root.style.borderRadius = `${initial.cornerRadius}px`

  // Custom-mask instances feed the glow a point set inside the glyphs and
  // the mask itself as an image, so the halo sits *on the metal* and is
  // clipped to it — not to a ring band that doesn't exist.
  const glowMaskData = (w: number, h: number): Pick<GlowOptions, 'samplePoints' | 'maskDataUrl'> => {
    const mask = props.mask
    if (!mask || props.glowMode === 'ring') return {}
    const dpr = window.devicePixelRatio || 1
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * dpr))
    c.height = Math.max(1, Math.round(h * dpr))
    const g = c.getContext('2d')
    if (!g) return {}
    g.fillStyle = '#fff'
    mask(g, c.width, c.height, dpr)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const pts: Array<{ x: number; y: number }> = []
    const step = Math.max(1, Math.round(2 * dpr)) // ~2 CSS px grid
    for (let y = step >> 1; y < c.height; y += step) {
      for (let x = step >> 1; x < c.width; x += step) {
        if ((d[(y * c.width + x) * 4 + 3] ?? 0) > 128) pts.push({ x: x / dpr, y: y / dpr })
      }
    }
    return { samplePoints: pts, maskDataUrl: c.toDataURL('image/png') }
  }

  if (glowHost) {
    glowHandles = injectGlow(glowHost, {
      width: initial.cssWidth,
      height: initial.cssHeight,
      cornerRadius: initial.cornerRadius,
      kind: shape.value,
      scale: props.scale,
      ...glowMaskData(initial.cssWidth, initial.cssHeight),
    })
  }

  const rebuildGlow = (dims: { cssWidth: number; cssHeight: number; cornerRadius: number }) => {
    if (!glowHost) return
    const prev = glowHandles
    glowHost.innerHTML = ''
    glowHandles = injectGlow(glowHost, {
      width: dims.cssWidth,
      height: dims.cssHeight,
      cornerRadius: dims.cornerRadius,
      kind: shape.value,
      scale: props.scale,
      ...glowMaskData(dims.cssWidth, dims.cssHeight),
    })
    // A rebuild is a fresh, invisible glow. Carry the old one's state over so
    // a resize doesn't read as "the glow vanished, then came back elsewhere".
    if (prev) carryGlowState(prev, glowHandles)
    if (instance && glowHandles) {
      glowHandlesMap.set(instance, { handles: glowHandles, themeRef })
    }
  }

  const rimOpts = (): RimOptions | null => {
    const innerShadow = props.innerShadow
    if (!innerShadow) return null
    return innerShadow === true ? RIM_DEFAULTS : { ...RIM_DEFAULTS, ...innerShadow }
  }
  const rebuildRim = (dims: { cssWidth: number; cssHeight: number; cornerRadius: number }) => {
    const host = rimHostEl.value
    const inst = instance
    removeRim(rimHandles)
    rimHandles = null
    const o = rimOpts()
    if (!host || !inst || !o) return
    rimHandles = injectRim(host, { width: dims.cssWidth, height: dims.cssHeight, cornerRadius: dims.cornerRadius, kind: shape.value, ring: inst.ringCssPx }, o)
  }
  rebuildRim(initial)

  let resizeRaf = 0
  // Last dimensions the glow was built for. ResizeObserver fires on any box
  // change — including ones that leave the size identical (re-layout, font
  // load, a parent's transform) — and rebuilding the glow for those restarts
  // it from invisible, which reads as the halo blinking out with no fade.
  let builtW = initial.cssWidth
  let builtH = initial.cssHeight
  let builtR = initial.cornerRadius
  const ro = new ResizeObserver(() => {
    if (resizeRaf !== 0) return
    // RAF-debounce: coalesce multiple resize events within the same frame and
    // skip any that fire while a frame is already queued.
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0
      const next = measure()
      const inst = instance
      if (!inst) return
      const same = Math.abs(next.cssWidth - builtW) < 0.5 && Math.abs(next.cssHeight - builtH) < 0.5
        && Math.abs(next.cornerRadius - builtR) < 0.5
      if (same) return
      builtW = next.cssWidth
      builtH = next.cssHeight
      builtR = next.cornerRadius
      updateInstance(inst, { cssWidth: next.cssWidth, cssHeight: next.cssHeight, cornerRadius: next.cornerRadius })
      root.style.setProperty('--mfx-radius', `${next.cornerRadius}px`)
      root.style.borderRadius = `${next.cornerRadius}px`
      rebuildGlow(next)
      rebuildRim(next)
    })
  })
  ro.observe(root)

  // Browser zoom changes the DPR but not the CSS box, so the observer above
  // stays quiet and every raster (metal, glow, rim) would stay at the old
  // resolution. A resolution query fires once per DPR change; re-arm it
  // for the new value each time.
  let dprMql: MediaQueryList | null = null
  const onDpr = () => {
    const inst = instance
    if (inst && refreshInstanceDpr(inst)) {
      const next = measure()
      rebuildGlow(next)
      rebuildRim(next)
    }
    watchDpr()
  }
  const watchDpr = () => {
    dprMql?.removeEventListener('change', onDpr)
    dprMql = typeof window.matchMedia === 'function' ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null
    dprMql?.addEventListener('change', onDpr)
  }
  watchDpr()

  // Glow markup params (stroke widths, blurs, blob lengths) are baked into
  // the SVG, so a live config change to one of them means a rebuild. Runtime
  // params are read per-frame and need nothing here.
  const unsubGlow = subscribeGlowConfig((markupChanged) => {
    if (markupChanged && instance) rebuildGlow(measure())
  })

  // Skip GL compositing for off-screen instances — the loop checks inst.visible
  // before copyShaderToInstance, so hidden instances cost nothing per frame.
  // rootMargin: 64px starts rendering slightly before the element scrolls into view.
  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entries) => {
        const inst = instance
        if (!inst) return
        for (const e of entries) setInstanceVisible(inst, e.isIntersecting)
      },
      { rootMargin: '64px' },
    )
    io.observe(root)
  }

  if (instance && glowHandles) {
    glowHandlesMap.set(instance, { handles: glowHandles, themeRef })
    registerGlowInstance(instance)
  }
  attachCursorLight()
  exposeGlowDebug()

  // strength=1 maps directly to a full-opacity composite (opacityMul=1) for
  // every variant. Per-preset toning lives in `shaderOpacity` inside each
  // PresetMode, not here, so buttons and circles share the same headroom.
  // (Upstream applies this from a separate effect; here it is the mount-time
  // application of the same patch, so a mount never paints at the wrong alpha.)
  updateInstance(created, { opacityMul: Math.max(0, Math.min(1, props.strength)), glowGain: Math.max(0, props.glowGain) })
  bindReflection()

  teardown = () => {
    detachCursorLight()
    removeRim(rimHandles)
    rimHandles = null
    ro.disconnect()
    dprMql?.removeEventListener('change', onDpr)
    io?.disconnect()
    unsubGlow()
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf)
    const inst = instance
    if (inst) {
      glowHandlesMap.delete(inst)
      unregisterGlowInstance(inst)
      destroyInstance(inst)
    }
    instance = null
    glowHandles = null
    if (glowHost) glowHost.innerHTML = ''
  }
}

onMounted(mountFx)
watch(shape, mountFx)
onBeforeUnmount(() => {
  teardown?.()
  teardown = null
  detachReflection?.()
  detachReflection = null
})

// `paused` is per-instance: it freezes only this instance's 2D canvas while
// the shared GL loop keeps running for any other unpaused instance.
watch(() => props.paused, (paused) => {
  if (instance) updateInstance(instance, { paused })
})
watch(() => props.mask, (mask) => {
  if (instance) updateInstance(instance, { mask: mask ?? null })
})
// Re-sync optional shader/ring/scale overrides if they change at runtime.
watch([() => props.shaderScale, () => props.ringCssPx, () => props.scale], () => {
  if (!instance) return
  const patch: Partial<Parameters<typeof updateInstance>[1]> = {}
  if (props.shaderScale !== undefined) patch.shaderScale = props.shaderScale
  if (props.ringCssPx !== undefined) patch.ringCssPx = props.ringCssPx
  if (props.scale !== undefined) patch.scale = props.scale
  if (Object.keys(patch).length > 0) updateInstance(instance, patch)
})
watch([() => props.strength, () => props.glowGain], () => {
  if (!instance) return
  updateInstance(instance, { opacityMul: Math.max(0, Math.min(1, props.strength)), glowGain: Math.max(0, props.glowGain) })
})
// Separate from the main lifecycle so borderRadius / variant / theme changes
// re-sync the radius without destroying and recreating the instance.
watch([() => props.borderRadius, resolvedTheme, () => props.variant], () => {
  const root = rootEl.value
  if (!root || !instance) return
  const cornerRadius = resolveRadius(instance.cssWidth, instance.cssHeight)
  updateInstance(instance, { cornerRadius })
  root.style.setProperty('--mfx-radius', `${cornerRadius}px`)
  root.style.borderRadius = `${cornerRadius}px`
})
// `deep` so an inline array literal (`:reflection-targets="[{ ref: x }]"`) does
// not tear down and re-add every target on each parent render: the refs inside
// are what actually change, and the traversal stops at the non-plain DOM nodes.
watch([() => props.reflectionTargets, resolvedTheme], bindReflection, { deep: true })

// Preset is global to the shared renderer (one GL context feeds every instance).
watch([() => props.preset, resolvedTheme], () => {
  if (supported) setSharedPreset(props.preset, resolvedTheme.value)
}, { immediate: true })

// The wrapper owns `class` / `style` (upstream merges `className` into the
// root class list and spreads `style` last); everything else falls through.
const forwardAttrs = computed(() => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class' || key === 'style') continue
    out[key] = value
  }
  return out
})
const rootClass = computed(() => ['metal-fx-root', attrs.class])
const fallbackClass = computed(() => ['metal-fx-fallback', attrs.class])
const userStyle = computed(() => attrs.style as StyleValue | undefined)
const glowHostStyle = computed<CSSProperties>(() => ({ ...GLOW_HOST_STYLE, display: glowEnabled.value ? undefined : 'none' }))
// --mfx-strength is consumed by downstream CSS (e.g. content opacity rules).
// Consumer style is spread first so the library's own reveal keys still win —
// exactly the upstream object-literal order.
const wrapperStyle = computed<StyleValue>(() => [
  userStyle.value,
  {
    '--mfx-strength': String(Math.min(1, Math.max(0, props.strength))),
    opacity: ready.value ? 1 : 0,
    visibility: ready.value ? 'visible' : 'hidden',
    transition: ready.value ? 'opacity 0.15s ease-out' : 'none',
  },
])
// Graceful degradation keeps the consumer's own styling intact — no
// normalisation, no canvas, no glow.
const fallbackStyle = computed<StyleValue>(() => [{ display: 'inline-flex' }, userStyle.value])

defineExpose({ el: rootEl })
</script>

<template>
  <!-- Graceful degradation: the wrapped element with its own styling intact.
       Consumers can style `[data-metal-fx-unsupported]` for a static stand-in. -->
  <div
    v-if="!supported"
    v-bind="forwardAttrs"
    ref="rootEl"
    :class="fallbackClass"
    data-metal-fx-unsupported=""
    :style="fallbackStyle"
  >
    <slot />
  </div>

  <div
    v-else
    v-bind="forwardAttrs"
    ref="rootEl"
    :class="rootClass"
    :data-variant="props.variant"
    :data-shape="shape"
    :data-theme="resolvedTheme"
    :data-paused="props.paused ? 'true' : undefined"
    :data-normalize="props.normalizeHostStyles ? 'true' : 'false'"
    :style="wrapperStyle"
  >
    <canvas ref="canvasEl" class="metal-fx-canvas" :style="CANVAS_STYLE" />
    <div class="metal-fx-inner" aria-hidden="true" :style="INNER_STYLE" />
    <div ref="glowHostEl" aria-hidden="true" :style="glowHostStyle" />
    <div v-if="props.innerShadow" ref="rimHostEl" aria-hidden="true" :style="RIM_HOST_STYLE" />
    <div ref="contentEl" class="metal-fx-content">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
// Layout only: the effect's own CSS is injected by `ensureStylesInjected()`.
.metal-fx-fallback {
  display: inline-flex;
}
</style>
