<script setup lang="ts">
import { useLiquidDrag } from '@talex-touch/tuffex/glass-surface'
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import type { ComponentPublicInstance } from 'vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowReactive, watch } from 'vue'

definePageMeta({
  layout: 'fullscreen',
})

useSeoMeta({
  title: 'Glass lab · TuffEx',
  robots: 'noindex',
})

type Engine = 'lens' | 'classic'
type Profile = 'squircle' | 'circle'
type SceneKey = 'aurora' | 'grid' | 'type' | 'bars'

interface Lab {
  width: number
  height: number
  borderRadius: number
  /** `null` leaves the size to the engine. */
  bezel: number | null
  thickness: number | null
  ior: number
  refraction: number
  zoom: number
  profile: Profile
  dispersion: number
  rimLight: number
  rimSaturation: number
  frost: number
  backgroundOpacity: number
  saturation: number
  borderWidth: number
  brightness: number
  opacity: number
  blur: number
  displace: number
  distortionScale: number
  stiffness: number
  damping: number
  /** Percent of the size per 1000 px/s of speed; `useLiquidDrag` takes it as a share per px/s. */
  stretch: number
  maxStretch: number
  restHeight: number
  pressGrow: number
  swell: number
  /** Percent of half the size a pointer at the edge leans a touch surface. */
  touchLean: number
  touchMaxLean: number
  touchHover: number
  touchGrow: number
  /** Percent of the size per 1000 px/s of speed, like `stretch`. */
  touchStretch: number
  touchMaxStretch: number
}

type NumericKey = { [K in keyof Lab]: Lab[K] extends number ? K : never }[keyof Lab]

/** What `<TxGlassSurface engine="lens" />` and `useLiquidDrag` do when told nothing. */
const DEFAULTS: Lab = {
  width: 210,
  height: 150,
  borderRadius: 20,
  bezel: null,
  thickness: null,
  ior: 1.5,
  refraction: 1,
  zoom: 1,
  profile: 'squircle',
  dispersion: 0,
  rimLight: 1,
  rimSaturation: 1,
  frost: 0,
  backgroundOpacity: 0,
  saturation: 1.5,
  borderWidth: 0.07,
  brightness: 70,
  opacity: 0.93,
  blur: 11,
  displace: 0.5,
  distortionScale: -180,
  stiffness: 150,
  damping: 19,
  stretch: 18,
  maxStretch: 0.3,
  restHeight: 1,
  pressGrow: 0.1,
  swell: 0.016,
  touchLean: 10,
  touchMaxLean: 12,
  touchHover: 0.3,
  touchGrow: 0.06,
  touchStretch: 10,
  touchMaxStretch: 0.2,
}

interface Preset {
  key: string
  label: string
  engine?: Engine
  values: Partial<Lab>
}

const PRESETS: Preset[] = [
  // The classic engine on the geometry of the Glisse lens: the default look of the surfaces.
  { key: 'classic', label: 'Classic', engine: 'classic', values: { borderRadius: 75, saturation: 1, restHeight: 0.8, pressGrow: 0.25 } },
  {
    key: 'glisse',
    label: 'Glisse',
    values: { borderRadius: 75, bezel: 25, thickness: 50, zoom: 1.13, rimSaturation: 9, restHeight: 0.8, pressGrow: 0.25 },
  },
  { key: 'default', label: 'Default', values: { borderRadius: 40 } },
  { key: 'control', label: 'Control', values: { width: 96, height: 40, borderRadius: 20 } },
  { key: 'thin', label: 'Thin', values: { width: 240, height: 120, borderRadius: 28, bezel: 6, thickness: 12, rimLight: 0.8 } },
  {
    key: 'crystal',
    label: 'Crystal',
    values: { borderRadius: 48, bezel: 22, thickness: 44, ior: 1.9, dispersion: 0.22, rimSaturation: 3, zoom: 1.05 },
  },
  {
    key: 'bubble',
    label: 'Bubble',
    values: { width: 190, height: 190, borderRadius: 95, profile: 'circle', bezel: 45, thickness: 34, zoom: 1.22, rimLight: 1.4 },
  },
  {
    key: 'frosted',
    label: 'Frosted',
    values: { width: 240, height: 140, borderRadius: 36, frost: 8, refraction: 0.6, backgroundOpacity: 0.12 },
  },
]

interface RangeControl {
  kind: 'range'
  key: NumericKey
  label: string
  min: number
  max: number
  step: number
  hint: string
}

interface AutoControl {
  kind: 'auto'
  key: 'bezel' | 'thickness'
  label: string
  min: number
  max: number
  step: number
  hint: string
}

interface ProfileControl {
  kind: 'profile'
  key: 'profile'
  label: string
  hint: string
}

type Control = RangeControl | AutoControl | ProfileControl

interface Section {
  title: string
  controls: Control[]
}

function range(key: NumericKey, label: string, min: number, max: number, step: number, hint: string): RangeControl {
  return { kind: 'range', key, label, min, max, step, hint }
}

const SHAPE: Section = {
  title: 'Shape',
  controls: [
    range('width', 'Width', 40, 520, 1, 'Layout width in px.'),
    range('height', 'Height', 24, 400, 1, 'Layout height in px.'),
    range('borderRadius', 'Border radius', 0, 260, 1, 'Corner radius in px; the lens caps it at half the short side.'),
  ],
}

const LENS_SECTIONS: Section[] = [
  {
    title: 'Refraction',
    controls: [
      { kind: 'auto', key: 'bezel', label: 'Bezel', min: 0, max: 80, step: 1, hint: 'How wide the refracting rim is, px. Automatic: 12% of the short side, 4 to 10px.' },
      { kind: 'auto', key: 'thickness', label: 'Thickness', min: 0, max: 120, step: 1, hint: 'How deep the glass is, px; a thicker lens carries the page further. Automatic: 20% of the short side, 8 to 24px.' },
      range('ior', 'Index of refraction', 1, 3, 0.01, 'Bends the rim harder as it rises.'),
      range('refraction', 'Strength', 0, 2, 0.05, 'Scales how far the rim carries the page.'),
      range('zoom', 'Zoom', 1, 1.6, 0.01, 'Magnification of the middle.'),
      { kind: 'profile', key: 'profile', label: 'Profile', hint: 'The bezel cross-section: squircle is the dome iOS uses, circle is a rounder one.' },
      range('dispersion', 'Dispersion', 0, 0.5, 0.01, 'Splits red, green and blue apart along the rim.'),
    ],
  },
  {
    title: 'Rim',
    controls: [
      range('rimLight', 'Highlight', 0, 3, 0.05, 'Strength of the light along the edge.'),
      range('rimSaturation', 'Saturation', 1, 12, 0.5, 'What shows through the edge turns vivid above 1.'),
    ],
  },
  {
    title: 'Surface',
    controls: [
      range('frost', 'Frost', 0, 24, 1, 'Blur of the backdrop, px.'),
      range('backgroundOpacity', 'Tint', 0, 0.6, 0.01, 'Opacity of the white veil.'),
      range('saturation', 'Saturation', 0, 3, 0.05, 'Saturation of the face.'),
    ],
  },
]

const CLASSIC_SECTIONS: Section[] = [
  {
    title: 'Classic',
    controls: [
      range('borderWidth', 'Border width', 0, 0.3, 0.01, 'Share of the short side the displacement ramps over.'),
      range('brightness', 'Brightness', 0, 140, 1, 'Lightness of the middle of the map.'),
      range('opacity', 'Opacity', 0, 1, 0.01, 'Opacity of the middle of the map.'),
      range('blur', 'Blur', 0, 24, 1, 'Blur of the middle of the map, px.'),
      range('displace', 'Displace', 0, 6, 0.1, 'Blur after the displacement, px.'),
      range('distortionScale', 'Distortion', -600, 0, 10, 'Displacement scale; the sign sets the direction.'),
    ],
  },
  {
    title: 'Surface',
    controls: [
      range('backgroundOpacity', 'Tint', 0, 0.6, 0.01, 'Opacity of the white veil.'),
      range('saturation', 'Saturation', 0, 3, 0.05, 'Saturation of the face.'),
    ],
  },
]

const MOTION_SECTIONS: Section[] = [
  {
    title: 'Spring · shared',
    controls: [
      range('stiffness', 'Stiffness', 40, 400, 1, 'How hard the lift and the stretch are pulled to their target.'),
      range('damping', 'Damping', 4, 40, 0.5, 'Lower rings and wobbles; higher settles at once.'),
    ],
  },
  {
    title: 'Stretch',
    controls: [
      range('stretch', 'Stretch', 0, 60, 1, 'Percent of the size gained along the way it moves, per 1000 px/s.'),
      range('maxStretch', 'Max stretch', 0, 0.5, 0.01, 'The most one axis stretches, as a share of its size.'),
      range('swell', 'Swell', 0, 0.05, 0.001, 'Width gained while the lens lifts or settles.'),
    ],
  },
  {
    title: 'Press',
    controls: [
      range('restHeight', 'Rest height', 0.5, 1.2, 0.01, 'Height at rest, as a share of the layout height.'),
      range('pressGrow', 'Press grow', 0, 0.5, 0.01, 'How much taller a press makes it.'),
    ],
  },
]

const TOUCH_SECTION: Section = {
  title: 'Touch',
  controls: [
    range('touchLean', 'Lean', 0, 30, 1, 'Percent of half its size that a pointer at the edge leans a touch surface toward it.'),
    range('touchMaxLean', 'Max lean', 0, 40, 1, 'The most a touch surface leans, px.'),
    range('touchHover', 'Hover lift', 0, 1, 0.05, 'How far a hovering mouse lifts it; a press or a finger lifts it fully.'),
    range('touchGrow', 'Grow', 0, 0.2, 0.005, 'How much larger a full lift makes it.'),
    range('touchStretch', 'Stretch', 0, 60, 1, 'Percent of the size gained along the way the pointer moves, per 1000 px/s.'),
    range('touchMaxStretch', 'Max stretch', 0, 0.4, 0.01, 'The most one axis stretches, as a share of its size.'),
  ],
}

const SCENES: Array<{ key: SceneKey, label: string }> = [
  { key: 'aurora', label: 'Aurora' },
  { key: 'grid', label: 'Grid' },
  { key: 'type', label: 'Type' },
  { key: 'bars', label: 'Bars' },
]

const SIZES = [
  { key: 'pill', width: 96, height: 40, borderRadius: 20 },
  { key: 'knob', width: 44, height: 44, borderRadius: 22 },
  { key: 'bar', width: 260, height: 64, borderRadius: 20 },
] as const

const lab = reactive<Lab>({ ...DEFAULTS })
const engine = ref<Engine>('classic')
const scene = ref<SceneKey>('aurora')
const presetKey = ref('')
const copied = ref(false)

const reducedMotion = useReducedMotion()

const stageRef = ref<HTMLElement | null>(null)
const stripRef = ref<HTMLElement | null>(null)
const lensRef = ref<ComponentPublicInstance | null>(null)
const sizeRefs = shallowReactive<Record<string, ComponentPublicInstance | null>>({})

function bindSize(key: string, instance: unknown): void {
  sizeRefs[key] = instance as ComponentPublicInstance | null
}

let applied = ''

function stamp(): string {
  return JSON.stringify([engine.value, lab])
}

function applyPreset(key: string): void {
  const preset = PRESETS.find(item => item.key === key) ?? PRESETS[0]!
  engine.value = preset.engine ?? 'lens'
  Object.assign(lab, DEFAULTS, preset.values)
  presetKey.value = preset.key
  applied = stamp()
}

applyPreset('classic')

// A chip stays lit only while the lab still matches it.
watch(stamp, (now) => {
  if (now !== applied)
    presetKey.value = ''
})

// The numbers are read on every frame, so the motion controls act while a lens is moving.
const motion = {
  stiffness: () => lab.stiffness,
  damping: () => lab.damping,
  stretch: () => lab.stretch / 100000,
  maxStretch: () => lab.maxStretch,
  restHeight: () => lab.restHeight,
  pressGrow: () => lab.pressGrow,
  swell: () => lab.swell,
}

// The spring and the swell are the drag's too, so the two feel like one liquid.
const touch = computed(() => ({
  lean: lab.touchLean / 100,
  maxLean: lab.touchMaxLean,
  hoverLift: lab.touchHover,
  pressGrow: lab.touchGrow,
  stretch: lab.touchStretch / 100000,
  maxStretch: lab.touchMaxStretch,
  swell: lab.swell,
  stiffness: lab.stiffness,
  damping: lab.damping,
}))

const drags = [
  useLiquidDrag(lensRef, { bounds: stageRef, ...motion }),
  ...SIZES.map(size => useLiquidDrag(() => sizeRefs[size.key], { bounds: stripRef, ...motion })),
]

function recentre(): void {
  drags.forEach(drag => drag.reset())
}

const material = computed(() => ({
  engine: engine.value,
  ior: lab.ior,
  refraction: lab.refraction,
  zoom: lab.zoom,
  profile: lab.profile,
  dispersion: lab.dispersion,
  rimLight: lab.rimLight,
  rimSaturation: lab.rimSaturation,
  frost: lab.frost,
  backgroundOpacity: lab.backgroundOpacity,
  saturation: lab.saturation,
  borderWidth: lab.borderWidth,
  brightness: lab.brightness,
  opacity: lab.opacity,
  blur: lab.blur,
  displace: lab.displace,
  distortionScale: lab.distortionScale,
}))

const lensStyle = computed(() => ({
  position: 'absolute' as const,
  left: `calc(50% - ${lab.width / 2}px)`,
  top: `calc(50% - ${lab.height / 2}px)`,
}))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// The lens picks these from its short side; this only has to show what it would pick.
const autoValues = computed(() => {
  const short = Math.max(1, Math.min(lab.width, lab.height))
  return {
    bezel: Math.round(clamp(short * 0.12, 4, 10) * 10) / 10,
    thickness: Math.round(clamp(short * 0.2, 8, 24) * 10) / 10,
  }
})

function setAuto(key: 'bezel' | 'thickness', auto: boolean): void {
  lab[key] = auto ? null : autoValues.value[key]
}

// One function per precision, so a slider is not handed a new prop on every render.
const formatters = new Map<number, (value: number) => string>()

function formatter(step: number): (value: number) => string {
  const decimals = String(step).split('.')[1]?.length ?? 0
  let format = formatters.get(decimals)
  if (!format) {
    format = value => value.toFixed(decimals)
    formatters.set(decimals, format)
  }
  return format
}

const sections = computed<Section[]>(() => [
  SHAPE,
  ...(engine.value === 'lens' ? LENS_SECTIONS : CLASSIC_SECTIONS),
  ...MOTION_SECTIONS,
  TOUCH_SECTION,
])

const refracting = ref(true)
const settled = ref(false)
let observer: MutationObserver | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let copyTimer: ReturnType<typeof setTimeout> | null = null

function lensElement(): HTMLElement | null {
  return (lensRef.value?.$el as HTMLElement | undefined) ?? null
}

function syncRefracting(): void {
  refracting.value = lensElement()?.classList.contains('is-refracting') ?? false
}

// The lens is measured and drawn a frame after it mounts; only a lens that still has not refracted after that is a fallback.
function waitForLens(): void {
  settled.value = false
  if (settleTimer)
    clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settled.value = true
    syncRefracting()
  }, 900)
}

onMounted(() => {
  const element = lensElement()
  if (element && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(syncRefracting)
    observer.observe(element, { attributes: true, attributeFilter: ['class'] })
  }
  waitForLens()
})

watch(engine, waitForLens)

onBeforeUnmount(() => {
  observer?.disconnect()
  if (settleTimer)
    clearTimeout(settleTimer)
  if (copyTimer)
    clearTimeout(copyTimer)
})

const notes = computed(() => {
  const list: string[] = []
  if (engine.value === 'lens' && settled.value && !refracting.value)
    list.push('This browser cannot run SVG backdrop filters, so the lens is drawn as frosted glass. Refraction needs Chromium: Chrome, Edge or Electron.')
  if (reducedMotion.value)
    list.push('Reduced motion is on: the lens lifts without easing and never stretches.')
  return list
})

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function plain(value: number, digits = 4): string {
  return String(Number(value.toFixed(digits)))
}

const LENS_KEYS = ['bezel', 'thickness', 'ior', 'refraction', 'zoom', 'profile', 'dispersion', 'rimLight', 'rimSaturation', 'frost', 'backgroundOpacity', 'saturation'] as const
const CLASSIC_KEYS = ['borderWidth', 'brightness', 'opacity', 'blur', 'displace', 'distortionScale', 'backgroundOpacity', 'saturation'] as const
const MOTION_KEYS = ['stiffness', 'damping', 'stretch', 'maxStretch', 'restHeight', 'pressGrow', 'swell'] as const

const snippet = computed(() => {
  const lens = engine.value === 'lens'
  const attrs: string[] = lens ? ['engine="lens"'] : []
  attrs.push(`:width="${lab.width}"`, `:height="${lab.height}"`, `:border-radius="${lab.borderRadius}"`)

  for (const key of lens ? LENS_KEYS : CLASSIC_KEYS) {
    const value = lab[key]
    const fallback = key === 'saturation' && !lens ? 1 : DEFAULTS[key]
    // A null bezel or thickness is the engine's own pick, which is what leaving the prop out gives.
    if (value === null || value === fallback)
      continue
    attrs.push(typeof value === 'string' ? `${kebab(key)}="${value}"` : `:${kebab(key)}="${plain(value)}"`)
  }

  const options = ['bounds: stage']
  for (const key of MOTION_KEYS) {
    if (lab[key] === DEFAULTS[key])
      continue
    options.push(`${key}: ${key === 'stretch' ? plain(lab.stretch / 100000, 6) : plain(lab[key])}`)
  }

  const touchAttrs: string[] = []
  const addTouch = (name: string, value: number, fallback: number, digits = 4): void => {
    if (value !== fallback)
      touchAttrs.push(`:${name}="${plain(value, digits)}"`)
  }
  addTouch('lean', lab.touchLean / 100, DEFAULTS.touchLean / 100)
  addTouch('max-lean', lab.touchMaxLean, DEFAULTS.touchMaxLean)
  addTouch('hover-lift', lab.touchHover, DEFAULTS.touchHover)
  addTouch('press-grow', lab.touchGrow, DEFAULTS.touchGrow)
  addTouch('stretch', lab.touchStretch / 100000, DEFAULTS.touchStretch / 100000, 6)
  addTouch('max-stretch', lab.touchMaxStretch, DEFAULTS.touchMaxStretch)
  addTouch('swell', lab.swell, DEFAULTS.swell)
  addTouch('stiffness', lab.stiffness, DEFAULTS.stiffness)
  addTouch('damping', lab.damping, DEFAULTS.damping)

  return [
    '<TxGlassSurface',
    ...attrs.map(attr => `  ${attr}`),
    '/>',
    '',
    `useLiquidDrag(lens, { ${options.join(', ')} })`,
    '',
    '<TxTouchSurface',
    '  surface="glass"',
    ...[...attrs, ...touchAttrs].map(attr => `  ${attr}`),
    '/>',
  ].join('\n')
})

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(snippet.value)
  }
  catch {
    return
  }
  copied.value = true
  if (copyTimer)
    clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1400)
}
</script>

<template>
  <div class="lab">
    <div class="lab-main">
      <header class="lab-bar">
        <div class="lab-bar__title">
          <h1>Glass lab</h1>
          <p>TxGlassSurface, TxTouchSurface · drag the lens, touch the cards</p>
        </div>

        <div class="lab-bar__group">
          <span class="lab-bar__label">Engine</span>
          <TxRadioGroup v-model="engine" type="button">
            <TxRadio value="classic">
              Classic
            </TxRadio>
            <TxRadio value="lens">
              Lens
            </TxRadio>
          </TxRadioGroup>
        </div>

        <div class="lab-bar__group">
          <span class="lab-bar__label">Scene</span>
          <TxRadioGroup v-model="scene" type="button">
            <TxRadio v-for="item in SCENES" :key="item.key" :value="item.key">
              {{ item.label }}
            </TxRadio>
          </TxRadioGroup>
        </div>

        <div class="lab-bar__actions">
          <TxButton size="sm" variant="secondary" @click="recentre">
            Recentre
          </TxButton>
          <TxButton size="sm" variant="secondary" @click="applyPreset(presetKey || 'classic')">
            Reset
          </TxButton>
          <TxButton size="sm" variant="primary" @click="copy">
            {{ copied ? 'Copied' : 'Copy code' }}
          </TxButton>
        </div>
      </header>

      <p v-for="note in notes" :key="note" class="lab-note" role="status">
        {{ note }}
      </p>

      <div ref="stageRef" class="lab-stage lab-scene" :class="`lab-scene--${scene}`">
        <div class="lab-art" aria-hidden="true">
          <p v-if="scene === 'aurora'" class="lab-art__word">
            Liquid<br>Glass
          </p>
          <div v-else-if="scene === 'type'" class="lab-art__text">
            <h2>Liquid Glass</h2>
            <p>
              A lens does not tint what is behind it, it carries it. At the rim the picture is pulled in from further
              inside the glass, so edges bend, letters swell and colours part; in the middle it stays almost as it was.
            </p>
            <p>
              Drag the lens across this text. Its rim should flow like a drop of water, stretching the way it travels and
              settling back when it stops.
            </p>
            <p>
              Light crossing from air into glass slows down and turns toward the normal, and the steeper the surface the
              more it turns. A dome is flat on top and steep at its edge, so only the rim bends what you see through it.
            </p>
            <p>
              The bezel is that rim. Make it wider and more of the lens refracts; make the glass thicker and the picture
              is carried further before it reaches your eye. Raise the index and the same slope bends harder.
            </p>
            <p>
              Dispersion lets red, green and blue take slightly different paths, which is why a thick crystal edge shows
              a fringe of colour. A little is enough; a lot looks like a mistake.
            </p>
            <p>
              Small controls need a thin bezel and thin glass, large panels can afford a deep one. The automatic values
              follow the short side of the lens for that reason.
            </p>
          </div>
        </div>

        <TxGlassSurface
          ref="lensRef"
          class="lab-lens"
          :width="lab.width"
          :height="lab.height"
          :border-radius="lab.borderRadius"
          :bezel="lab.bezel ?? undefined"
          :thickness="lab.thickness ?? undefined"
          v-bind="material"
          :style="lensStyle"
        />
      </div>

      <div ref="stripRef" class="lab-strip lab-scene" :class="`lab-scene--${scene}`">
        <p class="lab-strip__caption" aria-hidden="true">
          Volume 40 · Sound · Brightness
        </p>
        <TxGlassSurface
          v-for="size in SIZES"
          :key="size.key"
          :ref="(instance: unknown) => bindSize(size.key, instance)"
          class="lab-lens"
          :width="size.width"
          :height="size.height"
          :border-radius="size.borderRadius"
          v-bind="material"
        />
      </div>

      <div class="lab-strip lab-touch lab-scene" :class="`lab-scene--${scene}`">
        <p class="lab-touch__caption" aria-hidden="true">
          TxTouchSurface · hover, press or touch
        </p>
        <TxTouchSurface class="lab-touch__card" :radius="36" v-bind="touch">
          <span class="lab-touch__label">Base · refraction</span>
        </TxTouchSurface>
        <TxTouchSurface class="lab-touch__card" mode="glass" :radius="36" v-bind="touch">
          <span class="lab-touch__label">Base · glass</span>
        </TxTouchSurface>
        <TxTouchSurface
          surface="glass"
          class="lab-touch__card"
          :width="200"
          :height="72"
          :border-radius="36"
          v-bind="{ ...material, ...touch }"
        >
          <span class="lab-touch__label">Glass · {{ engine }}</span>
        </TxTouchSurface>
      </div>
    </div>

    <aside class="lab-panel" aria-label="Glass controls">
      <section class="lab-section">
        <h2 class="lab-section__title">
          Presets
        </h2>
        <div class="lab-chips">
          <TxButton
            v-for="preset in PRESETS"
            :key="preset.key"
            size="sm"
            :variant="presetKey === preset.key ? 'primary' : 'secondary'"
            @click="applyPreset(preset.key)"
          >
            {{ preset.label }}
          </TxButton>
        </div>
      </section>

      <section v-for="section in sections" :key="section.title" class="lab-section">
        <h2 class="lab-section__title">
          {{ section.title }}
        </h2>

        <div v-for="control in section.controls" :key="control.key" class="lab-row" :title="control.hint">
          <div class="lab-row__head">
            <span :id="`lab-${control.key}`" class="lab-row__label">{{ control.label }}</span>
            <TxSwitch
              v-if="control.kind === 'auto'"
              size="small"
              label="Auto"
              :model-value="lab[control.key] === null"
              @update:model-value="setAuto(control.key, $event)"
            />
          </div>

          <TxRadioGroup v-if="control.kind === 'profile'" v-model="lab.profile" type="button">
            <TxRadio value="squircle">
              Squircle
            </TxRadio>
            <TxRadio value="circle">
              Circle
            </TxRadio>
          </TxRadioGroup>

          <TxSlider
            v-else-if="control.kind === 'auto'"
            show-value
            :aria-labelledby="`lab-${control.key}`"
            :model-value="lab[control.key] ?? autoValues[control.key]"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :format-value="formatter(control.step)"
            @update:model-value="lab[control.key] = $event"
          />

          <TxSlider
            v-else
            show-value
            :aria-labelledby="`lab-${control.key}`"
            :model-value="lab[control.key]"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :format-value="formatter(control.step)"
            @update:model-value="lab[control.key] = $event"
          />
        </div>
      </section>

      <section class="lab-section">
        <h2 class="lab-section__title">
          Code
        </h2>
        <pre class="lab-code">{{ snippet }}</pre>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.lab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  height: 100dvh;
  min-height: 560px;
  background: var(--tx-bg-color-page, var(--tx-bg-color));
  color: var(--tx-text-color-primary);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.lab-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.lab-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 24px;
}

.lab-bar__title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.lab-bar__title p {
  margin: 2px 0 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.lab-bar__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lab-bar__label {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.lab-bar__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.lab-note {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}

.lab-scene {
  --lab-ink: #fff;

  position: relative;
  overflow: hidden;
  border-radius: 20px;
  user-select: none;
}

.lab-stage {
  flex: 1;
  min-height: 320px;
}

.lab-strip {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-evenly;
  height: 168px;
}

.lab-strip__caption {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  margin: 0;
  color: var(--lab-ink);
  font-size: 30px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}

.lab-touch {
  height: 128px;
}

.lab-touch__caption {
  position: absolute;
  top: 10px;
  left: 16px;
  margin: 0;
  color: var(--lab-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.8;
  pointer-events: none;
}

.lab-touch__card {
  z-index: 1;
  width: 200px;
  height: 72px;
}

.lab-touch__card :deep(.tx-base-surface__content) {
  display: grid;
  height: 100%;
  place-items: center;
}

.lab-touch__label {
  color: var(--lab-ink);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.lab-lens {
  z-index: 1;
}

.lab-scene--aurora {
  background:
    radial-gradient(circle at 80% 14%, transparent 0 17%, rgb(160 190 255 / 0.55) 17.4% 21.4%, transparent 21.8%),
    radial-gradient(circle at 8% 104%, rgb(90 220 180 / 0.65) 0 30%, transparent 30.4%),
    radial-gradient(120% 90% at 100% 0%, #6f8fe8 0%, #2f4fc0 38%, transparent 60%),
    radial-gradient(90% 80% at 0% 100%, #5fd3b2 0%, #2f9c86 40%, transparent 62%),
    #0a1a5c;
}

.lab-scene--grid {
  background:
    linear-gradient(rgb(255 255 255 / 0.28) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgb(255 255 255 / 0.28) 1px, transparent 1px) 0 0 / 32px 32px,
    radial-gradient(circle at 24% 30%, #ff5e8a 0 56px, transparent 57px),
    radial-gradient(circle at 72% 66%, #44d4ff 0 76px, transparent 77px),
    #111827;
}

.lab-scene--type {
  --lab-ink: #1b1d24;

  background: #f3ede2;
  color: var(--lab-ink);
}

.lab-scene--bars {
  background:
    repeating-linear-gradient(135deg, #fff 0 8px, #111 8px 16px) 0 100% / 100% 20% no-repeat,
    linear-gradient(90deg, #fff 0 14.28%, #ffe14a 0 28.56%, #38e0ff 0 42.84%, #46e07a 0 57.12%, #ff4fd8 0 71.4%, #ff4a4a 0 85.68%, #4a63ff 0) 0 0 / 154px 100%;
}

.lab-art {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.lab-art__word {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  margin: 0;
  color: #fff;
  font: 800 clamp(48px, 9vw, 96px) / 0.95 'Helvetica Neue', Arial, sans-serif;
  letter-spacing: -0.03em;
  text-align: center;
}

.lab-art__text {
  height: 100%;
  padding: 32px 36px;
  color: var(--lab-ink);
  column-fill: auto;
  column-gap: 40px;
  column-width: 300px;
  overflow: hidden;
}

.lab-art__text h2 {
  margin: 0 0 12px;
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.lab-art__text p {
  margin: 0 0 14px;
  font-size: 20px;
  line-height: 1.45;
}

.lab-panel {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px 24px;
  border-left: 1px solid var(--tx-border-color-light);
  background: var(--tx-bg-color);
}

.lab-section {
  padding: 12px 0;
  border-bottom: 1px solid var(--tx-border-color-extra-light);
}

.lab-section__title {
  margin: 0 0 8px;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lab-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lab-row {
  display: grid;
  gap: 4px;
  padding: 4px 0;
}

.lab-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--tx-text-color-regular);
  font-size: 12px;
}

.lab-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font: 11px / 1.55 ui-monospace, 'SF Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

@media (max-width: 960px) {
  .lab {
    grid-template-columns: 1fr;
    height: auto;
  }

  .lab-stage {
    min-height: 420px;
  }

  .lab-touch {
    flex-wrap: wrap;
    height: auto;
    gap: 12px;
    padding: 36px 12px 16px;
  }

  .lab-panel {
    border-top: 1px solid var(--tx-border-color-light);
    border-left: 0;
  }
}
</style>
