<script setup lang="ts">
import type { BotAvatarProps, BotAvatarShading, BotAvatarState } from './types'
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { autoInk, shade } from './color'
import { draw, OVERSCAN, RISE, type DrawConfig } from './draw'
import { restPose, Sim } from './engine'
import { warmPlastic } from './plastic'
import { botAvatarPresets, stateLabels } from './presets'
import { SHAPE_PARTS, SHAPE_PATHS } from './shapes'
import { pointer, subscribe } from './ticker'

// Vue port of the `BotAvatar` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// draw/plastic/engine/color/shapes/presets/ticker are verbatim upstream; this
// SFC only mirrors the wrapper behavior: sizing to the element with the
// overscan box, the shared ticker loop, pointer following, theme resolution,
// offscreen/reduced-motion pause and the plastic bake on idle time.

defineOptions({
  name: 'TxBotAvatar',
})

const props = withDefaults(defineProps<BotAvatarProps>(), {
  type: 'clover',
  state: 'default',
  size: 64,
  brightness: 1,
  saturation: 1.5,
  speed: 1,
  paused: false,
  shading: 'plastic',
  shadow: 0.35,
  highlight: 1.3,
  depth: 0.65,
  light: 265,
  rim: 0.5,
  spread: 1.55,
  interactive: true,
  turn: 1,
  theme: 'auto',
  whirl: 0,
  whirlSize: 1,
  whirlWidth: 1,
  whirlLength: 1,
  whirlTilt: 1,
  jumpHeight: 26,
  jumpTime: 0.68,
  jumpStretch: 1,
  jumpSpin: 1,
  jumpLean: 6,
  jumpEvery: 8,
  jumpLand: 0,
  jumpSquash: 1.15,
  jumpSquashTime: 0.37,
  jumpSquashEase: 'pulse',
  jumpGroundTime: 0.11,
  jumpGroundEase: 'pulse',
  jumpRiseTime: 0.33,
  jumpRiseEase: 'pulse',
  jumpClickSquashTime: 0.24,
})

/* A 0–1 seed from the Vue id, so two avatars side by side never blink
   in step unless asked to. */
function hashSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 1))

const pathCache = new Map<string, Path2D>()
function bodyPath(d: string): Path2D {
  let p = pathCache.get(d)
  if (!p) {
    p = new Path2D(d)
    pathCache.set(d, p)
  }
  return p
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const canvasRef = ref<HTMLCanvasElement | null>(null)

const reactId = useId()
const preset = computed(() => botAvatarPresets[props.type] ?? botAvatarPresets.clover)
const faceKind = computed(() => props.face ?? preset.value.face)
const picked = computed(() => props.color ?? preset.value.color)
const body = computed(() =>
  props.brightness === 1 && props.saturation === 1
    ? picked.value
    : shade(
        picked.value,
        (Math.min(2, Math.max(0, props.brightness)) - 1) * 0.35,
        (Math.min(2, Math.max(0, props.saturation)) - 1) * 0.5,
      ),
)
const inkColor = computed(() => props.ink ?? autoInk(body.value))
const seedValue = computed(() => Math.min(1, Math.max(0, props.seed ?? hashSeed(reactId))))
const stateKey = computed<BotAvatarState>(() => (props.state in stateLabels ? props.state : 'default'))
const frozen = computed(() => props.paused || !(props.speed > 0))
const shadingMode = computed<BotAvatarShading>(() =>
  props.shading === true ? 'crisp' : props.shading === false ? 'flat' : props.shading,
)

const ariaLabel = computed(() => props.ariaLabel ?? `${preset.value.label} bot, ${stateLabels[stateKey.value]}`)

/* the sim lives across renders; props reach it through the reactive cfg */
let sim: Sim | null = null
let cfg: DrawConfig | null = null
let cssSize = 0

function buildCfg(): DrawConfig {
  const type = props.type
  return {
    path: typeof Path2D === 'undefined' ? (null as unknown as Path2D) : bodyPath(SHAPE_PATHS[type] ?? SHAPE_PATHS.clover),
    face: faceKind.value,
    faceX: preset.value.faceX,
    faceY: preset.value.faceY,
    faceScale: preset.value.faceScale,
    color: body.value,
    ink: inkColor.value,
    shading: shadingMode.value,
    shadow: clamp(props.shadow, 0, 2),
    highlight: clamp(props.highlight, 0, 2),
    depth: clamp(props.depth, 0.2, 2),
    light: props.light,
    rim: clamp(props.rim, 0, 2),
    spread: clamp(props.spread, 0.4, 2.5),
    typeKey: type,
    still: frozen.value || reducedMotion(),
    whirl: {
      strength: clamp(props.whirl, 0, 2),
      size: clamp(props.whirlSize, 0.6, 1.6),
      width: clamp(props.whirlWidth, 0.4, 2),
      length: clamp(props.whirlLength, 0.4, 1.6),
      tilt: clamp(props.whirlTilt, 0.5, 1.8),
    },
    parts: typeof Path2D !== 'undefined' && SHAPE_PARTS[type] ? bodyPath(SHAPE_PARTS[type] as string) : undefined,
  }
}

/* the surface: an ancestor's say, else the system's */
function resolveTheme(el: HTMLElement | null): 'dark' | 'light' {
  if (props.theme !== 'auto') return props.theme
  const host = el?.closest('[data-theme], .dark, .light') as HTMLElement | null
  if (host) {
    const v = host.getAttribute('data-theme')
    if (v === 'dark' || v === 'light') return v
    if (host.classList.contains('dark')) return 'dark'
    if (host.classList.contains('light')) return 'light'
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/* paint the current pose, sizing the backing store to the element */
function paint(): void {
  const canvas = canvasRef.value
  const c = cfg
  if (!canvas || !c || !c.path) return
  /* a hidden ancestor measures 0: keep the last size rather than
     wiping the backing store */
  const px = canvas.clientWidth / OVERSCAN || cssSize || (typeof props.size === 'number' ? props.size : 64)
  if (!px) return
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
  const want = Math.round(px * OVERSCAN * dpr)
  if (canvas.width !== want || canvas.height !== want) {
    canvas.width = want
    canvas.height = want
  }
  cssSize = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.dpr = dpr
  const pose = sim ? sim.pose : restPose(stateKey.value)
  draw(ctx, px, pose, c)
}

/* the still pose of the state, no loop */
function paintStatic(): void {
  const canvas = canvasRef.value
  if (!canvas || !cfg || !cfg.path) return
  const px = canvas.clientWidth / OVERSCAN || cssSize || (typeof props.size === 'number' ? props.size : 64)
  if (!px) return
  cssSize = px
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
  canvas.width = canvas.height = Math.round(px * OVERSCAN * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  cfg.theme = resolveTheme(canvas)
  cfg.dpr = dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw(ctx, px, restPose(stateKey.value), cfg)
}

/* the layout effect: (re)build the sim and cfg, then paint one frame */
function sync(): void {
  const key = stateKey.value
  if (!sim) sim = new Sim(seedValue.value, key)
  else sim.setState(key)
  sim.setTurn(clamp(props.turn, 0, 2))
  sim.setJump({
    height: props.jumpHeight,
    time: Math.max(0.2, props.jumpTime),
    stretch: props.jumpStretch,
    spin: Math.max(0, Math.round(props.jumpSpin)),
    lean: props.jumpLean,
    every: props.jumpEvery,
    land: props.jumpLand,
    squash: props.jumpSquash,
    squashTime: Math.max(0.05, props.jumpSquashTime),
    squashEase: props.jumpSquashEase,
    groundTime: Math.max(0, props.jumpGroundTime),
    groundEase: props.jumpGroundEase,
    riseTime: Math.max(0.05, props.jumpRiseTime),
    riseEase: props.jumpRiseEase,
    clickSquashTime: Math.max(0.05, props.jumpClickSquashTime),
  })
  cfg = buildCfg()
  if (reducedMotion()) {
    paintStatic()
    return
  }
  /* the surface's theme, read once per sync rather than per frame */
  const canvas = canvasRef.value
  if (cfg && canvas) cfg.theme = resolveTheme(canvas)
  paint()
}

/* the shared-rAF loop: only while visible, animated and not reduced */
let stopLoop: (() => void) | null = null
function startLoop(): void {
  if (frozen.value || reducedMotion()) return
  const canvas = canvasRef.value
  if (!canvas) return
  let onScreen = true
  let unsub: (() => void) | null = null
  /* how far the pointer's pull reaches, in head widths */
  const REACH = 3
  const tick = (dt: number): void => {
    const s = sim
    if (!s) return
    if (props.interactive && !Number.isNaN(pointer.x)) {
      const r = canvas.getBoundingClientRect()
      const box = r.width / OVERSCAN || 1
      const dx = (pointer.x - (r.left + r.width / 2)) / box
      const dy = (pointer.y - (r.top + r.height / 2 + RISE * box)) / box
      const d = Math.hypot(dx, dy)
      /* full pull up close, gone by REACH */
      const strength = d < 1 ? 1 : d > REACH ? 0 : 1 - (d - 1) / (REACH - 1)
      s.setPointer(dx / Math.max(1, d), dy / Math.max(1, d), strength)
    } else s.setPointer(0, 0, 0)
    s.update(dt * props.speed)
    paint()
  }
  const run = (): void => {
    if (!unsub) unsub = subscribe(tick)
  }
  const stop = (): void => {
    if (unsub) unsub()
    unsub = null
  }
  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true
      if (onScreen) run()
      else stop()
    })
    io.observe(canvas)
  } else run()
  stopLoop = () => {
    stop()
    if (io) io.disconnect()
  }
}

function restartLoop(): void {
  stopLoop?.()
  stopLoop = null
  startLoop()
}

/* plastic bakes its form per type; start that on idle time at mount so
   the first frames do not stand in with the smooth look for long */
let cancelBake: (() => void) | null = null
function bake(): void {
  cancelBake?.()
  cancelBake = null
  if (shadingMode.value !== 'plastic' || !cfg?.path) return
  const path = cfg.path
  const dev = (typeof props.size === 'number' ? props.size : 64) * Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
  const ric = (typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 1)) as (fn: () => void) => number
  const id = ric(() => warmPlastic(props.type, path, dev, props.depth))
  cancelBake = () => {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id)
    else clearTimeout(id)
  }
}

/* The canvas overscans its box (see draw.ts) and pulls itself back in
   with negative margins, so it lays out at `size` and still has room
   to hop and flip. */
const canvasStyle = computed<CSSProperties>(() => {
  const size = props.size
  const dim = typeof size === 'number' ? `${size * OVERSCAN}px` : `calc(${size} * ${OVERSCAN})`
  const pull = (k: number) => (typeof size === 'number' ? `${-size * k}px` : `calc(${size} * ${-k})`)
  const side = (OVERSCAN - 1) / 2
  return {
    display: 'inline-block',
    verticalAlign: 'middle',
    width: dim,
    height: dim,
    marginLeft: pull(side),
    marginRight: pull(side),
    marginTop: pull(side + RISE),
    marginBottom: pull(side - RISE),
    flex: 'none',
  }
})

/* A click makes it hop and turn right round. Native listeners passed by the
   consumer come through attribute fallthrough and are merged by Vue. */
function onClick(): void {
  if (props.interactive && !frozen.value) sim?.poke()
}

onMounted(() => {
  sync()
  bake()
  startLoop()
})

watch(
  () => [shadingMode.value, props.type, props.size, props.depth],
  () => bake(),
)

// Any prop change re-runs the layout effect, mirroring the upstream
// dependency-less `useLayoutEffect`.
watch(props, () => sync(), { flush: 'post' })

// The loop only restarts when the freeze state flips (upstream dep `[frozen]`).
watch(frozen, () => restartLoop())

onBeforeUnmount(() => {
  stopLoop?.()
  stopLoop = null
  cancelBake?.()
  cancelBake = null
})

defineExpose({ canvas: canvasRef })
</script>

<template>
  <canvas
    ref="canvasRef"
    class="tx-bot-avatar"
    :data-bot-avatar="props.type"
    :data-face="faceKind"
    :data-state="stateKey"
    role="img"
    :aria-label="ariaLabel"
    :style="canvasStyle"
    @click="onClick"
  />
</template>

<style lang="scss">
.tx-bot-avatar {
  display: inline-block;
  vertical-align: middle;
  flex: none;
}
</style>
