<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type {
  DeviceMockupEmits,
  DeviceMockupExportOptions,
  DeviceMockupMetrics,
  DeviceMockupPreset,
  DeviceMockupProps,
  DeviceMockupScene,
} from './types'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import { DEVICE_MOCKUP_GRADIENTS } from './core-presets'
import DeviceBrowserChrome from './DeviceBrowserChrome.vue'
import DeviceScreenChrome from './DeviceScreenChrome.vue'
import {
  buildDeviceMetrics,
  buildExportConfigFromProps,
  buildPerspectiveTransform,
  buildRootStyle,
  computeDeviceGeometry,
  computeEffectiveScale,
  isLightHexColor,
  parseAspectRatio,
  parseLengthPx,
  resolveVisualConfig,
} from './layout'
import {
  findDeviceMockupPreset,
  getDeviceMockupPreset,
  loadDeviceFamilyForId,
  resolveDeviceMockupDimensions,
  subscribeDeviceMockupRegistry,
} from './registry'
import { DEVICE_MOCKUP_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxDeviceMockup' })

const props = withDefaults(defineProps<DeviceMockupProps>(), {
  device: 'iphone-17-pro',
  orientation: 'portrait',
  fit: 'contain',
  interactiveTilt: false,
  tiltMaxAngle: 10,
  animated: true,
  showShell: true,
  showCutout: true,
  showStatusBar: true,
  statusBarTheme: 'auto',
  statusBarTime: '9:41',
  showHomeIndicator: true,
  showHardwareButtons: true,
  browserUrl: 'https://tuff.tagzxia.com',
  browserTitle: '',
  browserTheme: 'auto',
  stageRatio: 'auto',
  stagePadding: 32,
  alt: '',
  objectFit: 'cover',
  // Leave scene-overridable props undefined so active `scene` defaults apply cleanly
  frameStyle: undefined,
  finish: undefined,
  perspective: undefined,
  shadow: undefined,
  framing: undefined,
  backdrop: undefined,
  gradientPreset: undefined,
  backdropValue: undefined,
  backdropNoise: undefined,
  screenGlare: undefined,
})

const emit = defineEmits<DeviceMockupEmits>()
const slots = useSlots()

const stageRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
const measuredMaxHeightPx = ref<number | null>(null)
const measuredAspectRatio = ref<number | null>(null)
const hasExplicitCssHeight = ref(false)
const documentDark = ref(false)
const reducedMotion = ref(false)
const registryTick = ref(0)
const loadedScene = ref<DeviceMockupScene | undefined>(undefined)

// Fluid morph & orientation settle flags (strictly gated off during ResizeObserver / hover)
const isMorphing = ref(false)
const isOrienting = ref(false)
const orientDir = ref<'cw' | 'ccw'>('cw')
let morphTimer: ReturnType<typeof setTimeout> | null = null
let orientTimer: ReturnType<typeof setTimeout> | null = null

// Interactive tilt state
const tiltX = ref(0)
const tiltY = ref(0)
const sheenX = ref(50)
const sheenY = ref(30)
let pendingTiltFrame = 0
let targetTiltX = 0
let targetTiltY = 0
let targetSheenX = 50
let targetSheenY = 30

let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let detachMotionListener: (() => void) | null = null
let detachRegistry: (() => void) | null = null
let sceneLoadSeq = 0
let deviceLoadSeq = 0

const activeScene = computed<DeviceMockupScene | undefined>(() => {
  if (!props.scene)
    return undefined
  if (typeof props.scene === 'object')
    return props.scene
  return loadedScene.value?.id === props.scene ? loadedScene.value : undefined
})

const visual = computed(() => resolveVisualConfig(props, activeScene.value))

const resolvedLabels = computed(() => ({
  ...DEVICE_MOCKUP_DEFAULT_LABELS,
  ...props.labels,
}))

const resolvedPreset = computed<DeviceMockupPreset>(() => {
  void registryTick.value
  return getDeviceMockupPreset(props.device)
})

const resolvedDimensions = computed(() =>
  resolveDeviceMockupDimensions(resolvedPreset.value, props.orientation, {
    width: props.width,
    height: props.height,
  }),
)

const geom = computed(() =>
  computeDeviceGeometry(resolvedPreset.value, resolvedDimensions.value, props, visual.value.frameStyle),
)

const hasCaption = computed(() => Boolean(props.title || slots.caption))
const hasWatermark = computed(() => Boolean(props.watermark || slots.watermark))

const effectivePadding = computed(() => {
  const base = typeof props.stagePadding === 'number' && Number.isFinite(props.stagePadding)
    ? Math.max(0, props.stagePadding)
    : 32
  return containerWidth.value > 0 && containerWidth.value <= 480 ? Math.min(base, 16) : base
})

const scaleResult = computed(() => computeEffectiveScale({
  geom: geom.value,
  props,
  perspective: visual.value.perspective,
  framing: visual.value.framing,
  containerWidth: containerWidth.value,
  containerHeight: containerHeight.value,
  measuredMaxHeightPx: measuredMaxHeightPx.value,
  measuredAspectRatio: measuredAspectRatio.value,
  hasExplicitCssHeight: hasExplicitCssHeight.value,
  effectivePadding: effectivePadding.value,
  hasCaption: hasCaption.value,
}))

const effectiveScale = computed(() => scaleResult.value.renderScale)

const is3dActive = computed(() =>
  visual.value.perspective !== 'flat'
  || (props.interactiveTilt && !reducedMotion.value && (Math.abs(tiltX.value) > 0.2 || Math.abs(tiltY.value) > 0.2)),
)

const isGlassFrame = computed(() =>
  visual.value.frameStyle === 'glass-light'
  || visual.value.frameStyle === 'glass-dark'
  || visual.value.frameStyle === 'liquid-glass',
)

const showExtruded3dSlab = computed(() =>
  is3dActive.value
  && geom.value.effectiveShowShell
  && !geom.value.isResponsiveFluid
  && visual.value.frameStyle !== 'outline',
)

const slabLayers = computed(() =>
  Array.from({ length: geom.value.slabLayerCount }, (_, idx) => idx + 1),
)

const showFloorShadow = computed(() =>
  is3dActive.value && visual.value.shadow !== 'none' && !geom.value.isResponsiveFluid,
)

const resolvedStatusBarDark = computed(() =>
  props.statusBarTheme === 'auto' ? documentDark.value : props.statusBarTheme === 'dark',
)

const resolvedBrowserDark = computed(() =>
  props.browserTheme === 'auto' ? documentDark.value : props.browserTheme === 'dark',
)

const showMobileChrome = computed(() =>
  geom.value.effectiveShowShell
  && !geom.value.isResponsiveFluid
  && (resolvedPreset.value.category === 'phone' || resolvedPreset.value.category === 'tablet'),
)

const shouldShowStatusBar = computed(() => {
  if (!props.showStatusBar || !geom.value.effectiveShowShell || geom.value.isResponsiveFluid)
    return false
  return geom.value.isWatch || (showMobileChrome.value && resolvedDimensions.value.safeArea.top > 0)
})

const statusBarHeight = computed(() => {
  if (!shouldShowStatusBar.value)
    return 0
  return geom.value.isWatch ? 22 : Math.max(24, Math.min(resolvedDimensions.value.safeArea.top, 54))
})

const shouldShowPortraitCutout = computed(() =>
  props.showCutout
  && showMobileChrome.value
  && resolvedPreset.value.cutout !== 'none'
  && resolvedDimensions.value.orientation === 'portrait',
)

const shouldShowLandscapeCutout = computed(() =>
  props.showCutout
  && showMobileChrome.value
  && resolvedPreset.value.cutout !== 'none'
  && resolvedDimensions.value.orientation === 'landscape',
)

const shouldShowLidNotch = computed(() =>
  props.showCutout && geom.value.effectiveShowShell && resolvedPreset.value.cutout === 'lid-notch',
)

const shouldShowHomeIndicator = computed(() =>
  props.showHomeIndicator && showMobileChrome.value && resolvedDimensions.value.safeArea.bottom >= 20,
)

const shouldShowSideButtons = computed(() =>
  props.showHardwareButtons
  && geom.value.effectiveShowShell
  && !geom.value.isResponsiveFluid
  && (resolvedPreset.value.category === 'phone' || geom.value.isWatch),
)

const displayBrowserTitle = computed(() =>
  props.browserTitle || props.browserUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'TuffEx',
)

const backdropTone = computed<'dark' | 'light' | 'auto'>(() => {
  const { backdrop, backdropValue, gradientPreset } = visual.value
  if (backdrop === 'obsidian' || backdrop === 'slate')
    return 'dark'
  if (backdrop === 'gradient' || backdrop === 'mesh') {
    const customLight = isLightHexColor(backdropValue)
    if (customLight !== null)
      return customLight ? 'light' : 'dark'
    return (DEVICE_MOCKUP_GRADIENTS[gradientPreset] ?? DEVICE_MOCKUP_GRADIENTS.aurora).dark ? 'dark' : 'light'
  }
  if (backdrop === 'solid') {
    const customLight = isLightHexColor(backdropValue)
    if (customLight !== null)
      return customLight ? 'light' : 'dark'
  }
  return 'auto'
})

const rootStyle = computed(() => buildRootStyle({
  props,
  visual: visual.value,
  geom: geom.value,
  effectivePadding: effectivePadding.value,
  sheenX: sheenX.value,
  sheenY: sheenY.value,
}))

const scalerStyle = computed<CSSProperties>(() => (
  geom.value.isResponsiveFluid
    ? { width: '100%' }
    : {
        width: `${Math.max(1, Math.ceil(scaleResult.value.envelopeWidth * effectiveScale.value))}px`,
        height: `${Math.max(1, Math.ceil(scaleResult.value.envelopeHeight * effectiveScale.value))}px`,
      }
))

const assemblyStyle = computed<CSSProperties>(() => {
  if (geom.value.isResponsiveFluid)
    return { width: '100%' }
  return {
    width: `${geom.value.footprintWidth}px`,
    height: `${geom.value.footprintHeight}px`,
    transform: `scale(${effectiveScale.value})`,
  }
})

const tiltStyle = computed<CSSProperties>(() => {
  const persp = buildPerspectiveTransform(visual.value.perspective, tiltX.value, tiltY.value, reducedMotion.value)
  return persp ? { transform: persp } : {}
})

const resolvedShellBorderRadius = computed(() => {
  const g = geom.value
  if (g.isCircular)
    return '50%'
  if (g.isLaptop && g.effectiveShowShell)
    return `${g.outerRadius}px ${g.outerRadius}px ${Math.max(4, Math.round(g.outerRadius * 0.35))}px ${Math.max(4, Math.round(g.outerRadius * 0.35))}px`
  return `${g.outerRadius}px`
})

const hasMetallicBand = computed(() =>
  geom.value.effectiveShowShell
  && !geom.value.isBrowser
  && !geom.value.isResponsiveFluid
  && geom.value.effectiveBezel >= 5
  && (visual.value.frameStyle === 'default' || visual.value.frameStyle === 'inset'),
)

const shellBoxStyle = computed<CSSProperties>(() => {
  const g = geom.value
  if (g.isResponsiveFluid)
    return { width: '100%', padding: `${g.effectiveBezel}px`, borderRadius: `${g.outerRadius}px` }
  const bandPx = hasMetallicBand.value ? 3 : 0
  return {
    width: `${g.outerWidth}px`,
    height: `${g.outerHeight}px`,
    padding: g.isArcBrowser && g.effectiveShowShell
      ? '8px'
      : `${Math.max(0, g.effectiveBezel - bandPx)}px`,
    borderRadius: resolvedShellBorderRadius.value,
  }
})

const screenBoxStyle = computed<CSSProperties>(() => {
  const g = geom.value
  if (g.isResponsiveFluid)
    return { width: '100%', minHeight: '240px', borderRadius: `${g.innerRadius}px` }
  return {
    width: `${resolvedDimensions.value.width}px`,
    height: `${resolvedDimensions.value.height}px`,
    borderRadius: g.isCircular
      ? '50%'
      : g.isArcBrowser && g.effectiveShowShell
        ? '8px'
        : g.isBrowser && g.effectiveShowShell
          ? `0 0 ${g.innerRadius}px ${g.innerRadius}px`
          : `${g.innerRadius}px`,
  }
})

const figureAriaLabel = computed(() => {
  if (props.labels?.figure)
    return props.labels.figure
  return props.title
    ? `${props.title} (${resolvedPreset.value.name})`
    : `${resolvedPreset.value.name} ${resolvedLabels.value.figure.toLowerCase()}`
})

const metrics = computed<DeviceMockupMetrics>(() => buildDeviceMetrics({
  preset: resolvedPreset.value,
  dims: resolvedDimensions.value,
  geom: geom.value,
  scale: effectiveScale.value,
  containerWidth: containerWidth.value,
  containerHeight: containerHeight.value,
}))

let lastMetricsKey = ''
watch(
  metrics,
  (next) => {
    const key = JSON.stringify(next)
    if (key !== lastMetricsKey) {
      lastMetricsKey = key
      emit('metrics-change', next)
    }
  },
  { immediate: true },
)

// Lazy-load string preset family on demand (zero static import of presets/*)
watch(
  () => props.device,
  async (nextDevice) => {
    if (typeof nextDevice !== 'string' || findDeviceMockupPreset(nextDevice))
      return
    const seq = ++deviceLoadSeq
    const loaded = await loadDeviceFamilyForId(nextDevice)
    if (seq === deviceLoadSeq && loaded)
      registryTick.value += 1
  },
  { immediate: true },
)

// Lazy-load string scene ID on demand (zero static import of scenes)
watch(
  () => props.scene,
  async (nextScene) => {
    if (!nextScene || typeof nextScene === 'object') {
      loadedScene.value = undefined
      return
    }
    const seq = ++sceneLoadSeq
    try {
      const mod = await import('../scenes/index')
      if (seq === sceneLoadSeq)
        loadedScene.value = mod.getDeviceMockupScene(nextScene)
    }
    catch {
      if (seq === sceneLoadSeq)
        loadedScene.value = undefined
    }
  },
  { immediate: true },
)

function triggerMorph(orientFlip: boolean, toLandscape: boolean): void {
  if (!props.animated || reducedMotion.value)
    return
  isMorphing.value = true
  if (morphTimer)
    clearTimeout(morphTimer)
  morphTimer = setTimeout(() => {
    isMorphing.value = false
    morphTimer = null
  }, 440)

  if (orientFlip) {
    orientDir.value = toLandscape ? 'cw' : 'ccw'
    isOrienting.value = false
    if (orientTimer)
      clearTimeout(orientTimer)
    // Next tick / microtask re-arms the keyframe cleanly
    queueMicrotask(() => {
      if (!props.animated || reducedMotion.value)
        return
      isOrienting.value = true
      orientTimer = setTimeout(() => {
        isOrienting.value = false
        orientTimer = null
      }, 460)
    })
  }
}

watch(
  [
    () => resolvedPreset.value.id,
    () => resolvedDimensions.value.orientation,
    () => visual.value.frameStyle,
    () => visual.value.finish,
    () => visual.value.framing,
    () => activeScene.value?.id,
  ],
  (next, prev) => {
    if (!prev)
      return
    const sameDeviceOrientFlip = next[0] === prev[0] && next[1] !== prev[1]
    triggerMorph(sameDeviceOrientFlip, next[1] === 'landscape')
  },
)

function detectDocumentDark(): boolean {
  if (!hasDocument())
    return false
  const root = document.documentElement
  const body = document.body
  const attr = root.getAttribute('data-theme') || body?.getAttribute('data-theme')
  if (attr === 'dark')
    return true
  if (attr === 'light')
    return false
  return root.classList.contains('dark') || Boolean(body?.classList.contains('dark'))
}

function readStageBorderBox(el: HTMLElement, entry?: ResizeObserverEntry): { width: number, height: number } {
  const box = entry?.borderBoxSize?.[0]
  if (box && box.inlineSize > 0)
    return { width: box.inlineSize, height: box.blockSize }
  const rect = el.getBoundingClientRect()
  return {
    width: rect.width || el.offsetWidth || el.clientWidth,
    height: rect.height || el.offsetHeight || el.clientHeight,
  }
}

function measureStage(entry?: ResizeObserverEntry): void {
  const el = stageRef.value
  if (!el)
    return
  const { width: w, height: h } = readStageBorderBox(el, entry)
  if (w > 0)
    containerWidth.value = w
  if (h > 0)
    containerHeight.value = h

  hasExplicitCssHeight.value = Boolean(el.style.height && el.style.height !== 'auto')
  if (hasWindow() && typeof window.getComputedStyle === 'function') {
    const cs = window.getComputedStyle(el)
    measuredMaxHeightPx.value = parseLengthPx(cs.maxHeight)
    measuredAspectRatio.value = parseAspectRatio(cs.aspectRatio)
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!props.interactiveTilt || reducedMotion.value)
    return
  const el = stageRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return

  const maxAngle = Number.isFinite(props.tiltMaxAngle) ? Math.max(0, Math.min(28, props.tiltMaxAngle)) : 10
  const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
  const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))

  targetTiltX = -ny * maxAngle
  targetTiltY = nx * maxAngle
  targetSheenX = Math.round((nx * 0.5 + 0.5) * 100)
  targetSheenY = Math.round((ny * 0.5 + 0.5) * 100)

  if (!pendingTiltFrame && typeof requestAnimationFrame === 'function') {
    pendingTiltFrame = requestAnimationFrame(() => {
      pendingTiltFrame = 0
      tiltX.value = targetTiltX
      tiltY.value = targetTiltY
      sheenX.value = targetSheenX
      sheenY.value = targetSheenY
    })
  }
}

function onPointerLeave(): void {
  if (pendingTiltFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingTiltFrame)
    pendingTiltFrame = 0
  }
  tiltX.value = 0
  tiltY.value = 0
  sheenX.value = 50
  sheenY.value = 30
}

function getMetrics(): DeviceMockupMetrics {
  return { ...metrics.value }
}

async function exportSvg(options?: DeviceMockupExportOptions): Promise<string> {
  const { renderDeviceMockupSvg } = await import('./export')
  return renderDeviceMockupSvg(
    buildExportConfigFromProps(props, resolvedPreset.value, visual.value, resolvedStatusBarDark.value, resolvedBrowserDark.value, options),
  )
}

async function exportImage(options?: DeviceMockupExportOptions): Promise<Blob | null> {
  const { exportDeviceMockupImage } = await import('./export')
  return exportDeviceMockupImage(
    buildExportConfigFromProps(props, resolvedPreset.value, visual.value, resolvedStatusBarDark.value, resolvedBrowserDark.value, options),
  )
}

onMounted(() => {
  documentDark.value = detectDocumentDark()
  detachRegistry = subscribeDeviceMockupRegistry(() => {
    registryTick.value += 1
  })

  if (hasDocument() && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      documentDark.value = detectDocumentDark()
    })
    const init: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'data-theme'] }
    themeObserver.observe(document.documentElement, init)
    if (document.body)
      themeObserver.observe(document.body, init)
  }

  if (hasWindow() && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = mq.matches
    const onChange = (event: MediaQueryListEvent): void => {
      reducedMotion.value = event.matches
      if (event.matches) {
        onPointerLeave()
        isMorphing.value = false
        isOrienting.value = false
      }
    }
    mq.addEventListener('change', onChange)
    detachMotionListener = () => mq.removeEventListener('change', onChange)
  }

  measureStage()
  if (stageRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry)
        measureStage(entry)
    })
    resizeObserver.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  detachMotionListener?.()
  detachMotionListener = null
  detachRegistry?.()
  detachRegistry = null
  if (morphTimer) {
    clearTimeout(morphTimer)
    morphTimer = null
  }
  if (orientTimer) {
    clearTimeout(orientTimer)
    orientTimer = null
  }
  if (pendingTiltFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingTiltFrame)
    pendingTiltFrame = 0
  }
})

defineExpose({
  getMetrics,
  exportSvg,
  exportImage,
})
</script>

<template>
  <figure
    ref="stageRef"
    class="tx-device-mockup"
    :class="[
      `tx-device-mockup--frame-${visual.frameStyle}`,
      `tx-device-mockup--finish-${visual.finish}`,
      `tx-device-mockup--backdrop-${visual.backdrop}`,
      `tx-device-mockup--shadow-${visual.shadow}`,
      `tx-device-mockup--perspective-${visual.perspective}`,
      `tx-device-mockup--framing-${visual.framing}`,
      {
        'is-fluid': geom.isResponsiveFluid,
        'is-3d': is3dActive,
        'is-circular': geom.isCircular,
        'is-backdrop-dark': backdropTone === 'dark',
        'is-backdrop-light': backdropTone === 'light',
        'is-interactive-tilt': interactiveTilt && !reducedMotion,
        'is-morphing': isMorphing && !reducedMotion,
        'is-orienting': isOrienting && !reducedMotion,
        'is-orienting-cw': isOrienting && !reducedMotion && orientDir === 'cw',
        'is-orienting-ccw': isOrienting && !reducedMotion && orientDir === 'ccw',
      },
    ]"
    :style="rootStyle"
    :data-device="resolvedPreset.id"
    :data-category="resolvedPreset.category"
    :data-orientation="resolvedDimensions.orientation"
    :data-frame-style="visual.frameStyle"
    :data-finish="visual.finish"
    :data-perspective="visual.perspective"
    :data-framing="visual.framing"
    :data-shadow="visual.shadow"
    role="figure"
    :aria-label="figureAriaLabel"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <!-- Shots.so subtle backdrop film-grain overlay -->
    <div v-if="visual.backdropNoise && visual.backdrop !== 'none' && visual.backdrop !== 'transparent'" class="tx-device-mockup__grain" aria-hidden="true" />

    <div class="tx-device-mockup__stage">
      <div class="tx-device-mockup__scaler" :style="scalerStyle">
        <div class="tx-device-mockup__assembly" :style="assemblyStyle">
          <div
            class="tx-device-mockup__tilt"
            :class="{ 'is-floating': visual.perspective === 'floating' }"
            :style="tiltStyle"
          >
            <!-- Watch top strap lug -->
            <Transition name="tx-dm-chrome">
              <span
                v-if="geom.effectiveShowShell && geom.isWatch"
                class="tx-device-mockup__watch-lug tx-device-mockup__watch-lug--top"
                aria-hidden="true"
              />
            </Transition>

            <!-- 3D chassis group: floor shadow + extruded slab sit as siblings BEHIND flat-composited __shell -->
            <div class="tx-device-mockup__body">
              <!-- Decoupled two-layer studio floor shadow in 3D mode -->
              <div
                v-if="showFloorShadow"
                class="tx-device-mockup__floor-shadow"
                aria-hidden="true"
              >
                <span
                  class="tx-device-mockup__floor-cast"
                  :style="{ borderRadius: resolvedShellBorderRadius }"
                />
                <span
                  class="tx-device-mockup__floor-contact"
                  :style="{ borderRadius: resolvedShellBorderRadius }"
                />
              </div>

              <!-- True 3D extruded hardware body plates behind front face -->
              <div
                v-if="showExtruded3dSlab"
                class="tx-device-mockup__slab"
                :class="{ 'is-glass-slab': isGlassFrame }"
                aria-hidden="true"
              >
                <span
                  v-for="idx in slabLayers"
                  :key="idx"
                  class="tx-device-mockup__slab-layer"
                  :class="{
                    'is-front-chamfer': idx === 1,
                    'is-backplate': idx === slabLayers.length,
                  }"
                  :style="{ '--tx-dm-layer-idx': idx, borderRadius: resolvedShellBorderRadius }"
                />
              </div>

              <div
                class="tx-device-mockup__shell"
                :class="[
                  `is-form-${resolvedPreset.formFactor}`,
                  {
                    'is-frameless': !geom.effectiveShowShell,
                    'is-two-layer': hasMetallicBand,
                    'is-dark-chrome': resolvedBrowserDark,
                    'is-arc': geom.isArcBrowser && geom.effectiveShowShell,
                    'is-circular': geom.isCircular,
                  },
                ]"
                :style="shellBoxStyle"
              >
              <!-- Side hardware buttons / Apple Watch Digital Crown -->
              <template v-if="shouldShowSideButtons">
                <template v-if="geom.isWatch">
                  <span class="tx-device-mockup__watch-crown" :class="{ 'is-circle-crown': geom.isCircular }" aria-hidden="true" />
                  <span class="tx-device-mockup__watch-side-btn" aria-hidden="true" />
                </template>
                <template v-else-if="resolvedDimensions.orientation === 'portrait'">
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--action" aria-hidden="true" />
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--vol-up" aria-hidden="true" />
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--vol-down" aria-hidden="true" />
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--power" aria-hidden="true" />
                </template>
                <template v-else>
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--top-a" aria-hidden="true" />
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--top-b" aria-hidden="true" />
                  <span class="tx-device-mockup__side-btn tx-device-mockup__side-btn--bottom-pwr" aria-hidden="true" />
                </template>
              </template>

              <!-- Browser & OS window chrome (Arc rail or top toolbar) -->
              <Transition name="tx-dm-chrome">
                <DeviceBrowserChrome
                  v-if="geom.effectiveShowShell && geom.isBrowser"
                  :form-factor="resolvedPreset.formFactor"
                  :url="browserUrl"
                  :title="displayBrowserTitle"
                  :dark="resolvedBrowserDark"
                  :bar-label="resolvedLabels.browserBar"
                >
                  <template v-if="slots['browser-bar']" #default>
                    <slot name="browser-bar" />
                  </template>
                </DeviceBrowserChrome>
              </Transition>

              <!-- Simulated screen viewport -->
              <div
                class="tx-device-mockup__screen"
                :class="{
                  'is-browser-screen': geom.isBrowser && !geom.isArcBrowser && geom.effectiveShowShell,
                  'is-arc-screen': geom.isArcBrowser && geom.effectiveShowShell,
                  'is-circular-screen': geom.isCircular,
                }"
                :style="screenBoxStyle"
                role="region"
                :aria-label="resolvedLabels.screen"
              >
                <div class="tx-device-mockup__content">
                  <img
                    v-if="src"
                    class="tx-device-mockup__media"
                    :class="{ 'is-underlay': Boolean(slots.default) }"
                    :src="src"
                    :alt="alt || title || resolvedPreset.name"
                    :style="{ objectFit }"
                    draggable="false"
                  >
                  <slot
                    :preset="resolvedPreset"
                    :width="resolvedDimensions.width"
                    :height="resolvedDimensions.height"
                    :orientation="resolvedDimensions.orientation"
                    :scale="effectiveScale"
                  >
                    <div v-if="!src" class="tx-device-mockup__placeholder">
                      <span class="tx-device-mockup__placeholder-badge">{{ resolvedPreset.name }}</span>
                      <span v-if="!geom.isResponsiveFluid" class="tx-device-mockup__placeholder-dim">
                        {{ resolvedDimensions.width }}×{{ resolvedDimensions.height }}
                      </span>
                    </div>
                  </slot>
                </div>

                <!-- Optional diagonal studio screen glare -->
                <div v-if="visual.screenGlare" class="tx-device-mockup__glare" aria-hidden="true" />

                <div v-if="slots.overlay" class="tx-device-mockup__overlay">
                  <slot name="overlay" />
                </div>

                <DeviceScreenChrome
                  :category="resolvedPreset.category"
                  :cutout="resolvedPreset.cutout"
                  :width="resolvedDimensions.width"
                  :inner-radius="geom.innerRadius"
                  :status-bar-height="statusBarHeight"
                  :status-bar-time="statusBarTime"
                  :dark-screen="resolvedStatusBarDark"
                  :is-watch="geom.isWatch"
                  :is-circular="geom.isCircular"
                  :show-lid-notch="shouldShowLidNotch"
                  :show-status-bar="shouldShowStatusBar"
                  :show-portrait-cutout="shouldShowPortraitCutout"
                  :show-landscape-cutout="shouldShowLandscapeCutout"
                  :show-home-indicator="shouldShowHomeIndicator"
                >
                  <template v-if="slots['status-bar']" #status-bar>
                    <slot name="status-bar" />
                  </template>
                </DeviceScreenChrome>
              </div>

              <div v-if="geom.effectiveShowShell && geom.isImac" class="tx-device-mockup__imac-chin" aria-hidden="true" />
              </div>
            </div>

            <Transition name="tx-dm-chrome">
              <div v-if="geom.effectiveShowShell && geom.isLaptop" class="tx-device-mockup__laptop-deck" aria-hidden="true">
                <span class="tx-device-mockup__laptop-lip" />
              </div>
            </Transition>

            <Transition name="tx-dm-chrome">
              <div v-if="geom.effectiveShowShell && geom.isImac" class="tx-device-mockup__imac-stand" aria-hidden="true">
                <span class="tx-device-mockup__imac-neck" />
                <span class="tx-device-mockup__imac-foot" />
              </div>
            </Transition>

            <Transition name="tx-dm-chrome">
              <div v-if="geom.effectiveShowShell && geom.isMonitor" class="tx-device-mockup__monitor-stand" aria-hidden="true">
                <span class="tx-device-mockup__monitor-neck" />
                <span class="tx-device-mockup__monitor-foot" />
              </div>
            </Transition>

            <Transition name="tx-dm-chrome">
              <span
                v-if="geom.effectiveShowShell && geom.isWatch"
                class="tx-device-mockup__watch-lug tx-device-mockup__watch-lug--bottom"
                aria-hidden="true"
              />
            </Transition>

            <!-- Grounded flat-mode base contact shadow -->
            <span
              v-if="!is3dActive && visual.shadow === 'grounded' && !geom.isResponsiveFluid"
              class="tx-device-mockup__contact-ellipse"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <figcaption v-if="hasCaption" class="tx-device-mockup__caption">
        <slot name="caption">
          <span class="tx-device-mockup__caption-title">{{ title }}</span>
        </slot>
      </figcaption>
    </div>

    <div v-if="hasWatermark" class="tx-device-mockup__watermark">
      <slot name="watermark">
        <span>{{ watermark }}</span>
      </slot>
    </div>
  </figure>
</template>

<style lang="scss">
$tx-dm-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");

.tx-device-mockup {
  --tx-device-shell-bg: #141417;
  --tx-device-oled-bezel: #09090b;
  --tx-device-oled-rim: rgba(255, 255, 255, 0.08);
  --tx-device-band-hi: #3a3c45;
  --tx-device-band-mid: #23242b;
  --tx-device-band-lo: #14151a;
  --tx-device-band-stroke: rgba(255, 255, 255, 0.14);
  --tx-device-shell-ring: rgba(255, 255, 255, 0.14);
  --tx-device-shell-rim-highlight: rgba(255, 255, 255, 0.22);
  --tx-device-slab-chamfer: #3e404a;
  --tx-device-slab-edge: #2b2d35;
  --tx-device-slab-wall: #1d1e24;
  --tx-device-slab-back: #0d0e12;
  --tx-device-cutout-bg: #09090b;
  --tx-device-lens-bg: #23252e;
  --tx-device-hardware-btn: #2e3038;
  --tx-device-strap-fade: rgba(34, 36, 44, 0.18);
  --tx-device-strap-mid: #262830;
  --tx-device-strap-root: #18191f;
  --tx-device-hinge-bg: #0a0a0d;
  --tx-device-deck-edge: #1e1f25;
  --tx-device-deck-top: #2c2d35;
  --tx-device-deck-sheen: #3b3d47;
  --tx-device-deck-bottom: #17181d;
  --tx-device-chin-bg: #1f2026;
  --tx-device-stand-bg: #353740;
  --tx-device-screen-bg: var(--tx-bg-color, #ffffff);
  --tx-device-status-ink: #1d1d1f;
  --tx-device-status-ink-dark: #f5f5f7;
  --tx-device-dot-close: #ff5f57;
  --tx-device-dot-min: #febc2e;
  --tx-device-dot-max: #28c840;
  --tx-device-browser-bg: #f5f6f8;
  --tx-device-browser-strip: #eceef2;
  --tx-device-browser-pill: #ffffff;
  --tx-device-browser-border: #dce0e8;
  --tx-device-browser-ink: #27272a;
  --tx-device-browser-muted: #71717a;
  --tx-device-browser-bg-dark: #1d1e25;
  --tx-device-browser-strip-dark: #15161c;
  --tx-device-browser-pill-dark: #252730;
  --tx-device-browser-border-dark: #2e313d;
  --tx-device-browser-ink-dark: #e4e4e7;
  --tx-device-browser-muted-dark: #9ca3af;
  --tx-device-glass-light-bg: rgba(255, 255, 255, 0.28);
  --tx-device-glass-light-ring: rgba(255, 255, 255, 0.52);
  --tx-device-glass-light-3d-a: rgba(255, 255, 255, 0.36);
  --tx-device-glass-light-3d-b: rgba(240, 244, 252, 0.18);
  --tx-device-glass-light-3d-c: rgba(255, 255, 255, 0.28);
  --tx-device-glass-dark-bg: rgba(12, 14, 20, 0.48);
  --tx-device-glass-dark-ring: rgba(255, 255, 255, 0.16);
  --tx-device-glass-dark-3d-a: rgba(26, 30, 40, 0.56);
  --tx-device-glass-dark-3d-b: rgba(12, 14, 20, 0.46);
  --tx-device-glass-dark-3d-c: rgba(32, 36, 48, 0.52);
  --tx-device-liquid-bg: rgba(255, 255, 255, 0.06);
  --tx-device-liquid-ring: rgba(255, 255, 255, 0.34);
  --tx-device-liquid-inner: rgba(255, 255, 255, 0.15);
  --tx-device-liquid-3d-sheen: rgba(255, 255, 255, 0.22);
  --tx-device-liquid-3d-mid: rgba(214, 228, 255, 0.09);
  --tx-device-liquid-3d-edge: rgba(255, 255, 255, 0.14);
  --tx-device-glass-screen-seam: rgba(255, 255, 255, 0.18);
  --tx-device-glass-slab-wall: rgba(255, 255, 255, 0.035);
  --tx-device-glass-slab-edge: rgba(255, 255, 255, 0.075);
  --tx-device-glass-slab-back: rgba(255, 255, 255, 0.055);
  --tx-device-glass-slab-rim: rgba(255, 255, 255, 0.24);
  --tx-device-glass-slab-wall-dark: rgba(12, 14, 20, 0.14);
  --tx-device-glass-slab-edge-dark: rgba(255, 255, 255, 0.14);
  --tx-device-glass-slab-back-dark: rgba(8, 10, 14, 0.34);
  --tx-device-backdrop-studio-key: #ffffff;
  --tx-device-backdrop-studio-mid: #f3f5f9;
  --tx-device-backdrop-studio-edge: #e4e9f2;
  --tx-device-backdrop-obsidian-key: rgba(96, 130, 210, 0.16);
  --tx-device-backdrop-obsidian-mid: #0e1118;
  --tx-device-backdrop-obsidian-edge: #07080d;
  --tx-device-backdrop-slate-sheen: rgba(148, 178, 224, 0.18);
  --tx-device-backdrop-slate-top: #263144;
  --tx-device-backdrop-slate-mid: #1a2230;
  --tx-device-backdrop-slate-edge: #101520;
  --tx-device-checker-a: rgba(128, 128, 138, 0.14);
  --tx-device-checker-b: transparent;
  --tx-device-shadow-soft: rgba(0, 0, 0, 0.14);
  --tx-device-shadow-crisp: rgba(0, 0, 0, 0.22);
  --tx-device-shadow-elevated: rgba(0, 0, 0, 0.24);
  --tx-device-shadow-dramatic: rgba(0, 0, 0, 0.38);
  --tx-device-shadow-contact: rgba(0, 0, 0, 0.15);
  --tx-device-floor-color: rgba(10, 14, 24, 0.48);
  --tx-device-floor-contact: rgba(10, 14, 24, 0.52);
  --tx-device-floor-cast: rgba(10, 14, 24, 0.30);
  --tx-device-glare-a: rgba(255, 255, 255, 0.24);
  --tx-device-glare-b: rgba(255, 255, 255, 0.04);
  --tx-device-grain-tint: rgba(255, 255, 255, 0.08);
  --tx-device-caption-ink-dark: #f5f5f7;
  --tx-device-watermark-ink-dark: rgba(245, 245, 247, 0.72);
  --tx-device-caption-ink-light: #18181b;
  --tx-device-watermark-ink-light: rgba(24, 24, 27, 0.72);

  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0;
  padding: var(--tx-dm-stage-pad, 32px);
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 16px;
  color: var(--tx-text-color-primary, #303133);

  &--finish-silver {
    --tx-device-shell-bg: #dde1ea;
    --tx-device-band-hi: #f4f6fa;
    --tx-device-band-mid: #d3d8e2;
    --tx-device-band-lo: #adb3c0;
    --tx-device-band-stroke: rgba(0, 0, 0, 0.14);
    --tx-device-shell-ring: rgba(0, 0, 0, 0.12);
    --tx-device-shell-rim-highlight: rgba(255, 255, 255, 0.86);
    --tx-device-slab-chamfer: #f0f2f7;
    --tx-device-slab-edge: #cfd4df;
    --tx-device-slab-wall: #b4bac7;
    --tx-device-slab-back: #8c93a3;
    --tx-device-hardware-btn: #b9bec8;
    --tx-device-strap-fade: rgba(196, 202, 214, 0.18);
    --tx-device-strap-mid: #c9ced8;
    --tx-device-strap-root: #9ea4b2;
    --tx-device-deck-edge: #bcc1cc;
    --tx-device-deck-top: #e2e5ec;
    --tx-device-deck-sheen: #f3f5f8;
    --tx-device-deck-bottom: #b7bcc8;
    --tx-device-chin-bg: #eaedf2;
    --tx-device-stand-bg: #cfd3dc;
  }

  &--finish-titanium {
    --tx-device-shell-bg: #c2bcb2;
    --tx-device-band-hi: #ddd7cd;
    --tx-device-band-mid: #bdb6ab;
    --tx-device-band-lo: #8d877d;
    --tx-device-band-stroke: rgba(255, 255, 255, 0.26);
    --tx-device-shell-ring: rgba(255, 255, 255, 0.26);
    --tx-device-shell-rim-highlight: rgba(255, 255, 255, 0.48);
    --tx-device-slab-chamfer: #d5cfc5;
    --tx-device-slab-edge: #b4ada2;
    --tx-device-slab-wall: #8f897f;
    --tx-device-slab-back: #656058;
    --tx-device-hardware-btn: #a39c92;
    --tx-device-strap-fade: rgba(146, 140, 130, 0.18);
    --tx-device-strap-mid: #8e887e;
    --tx-device-strap-root: #67625a;
    --tx-device-deck-edge: #8e8980;
    --tx-device-deck-top: #bcb6ac;
    --tx-device-deck-sheen: #d2ccc2;
    --tx-device-deck-bottom: #7e7970;
    --tx-device-chin-bg: #cbc6bd;
    --tx-device-stand-bg: #a49f95;
  }

  &--finish-graphite {
    --tx-device-shell-bg: #3b3d44;
    --tx-device-band-hi: #666a78;
    --tx-device-band-mid: #464954;
    --tx-device-band-lo: #292b33;
    --tx-device-band-stroke: rgba(255, 255, 255, 0.18);
    --tx-device-shell-ring: rgba(255, 255, 255, 0.2);
    --tx-device-shell-rim-highlight: rgba(255, 255, 255, 0.3);
    --tx-device-slab-chamfer: #636775;
    --tx-device-slab-edge: #494d59;
    --tx-device-slab-wall: #31343d;
    --tx-device-slab-back: #1b1d23;
    --tx-device-hardware-btn: #505460;
    --tx-device-strap-fade: rgba(58, 61, 70, 0.18);
    --tx-device-strap-mid: #3a3d47;
    --tx-device-strap-root: #23252c;
    --tx-device-deck-edge: #353841;
    --tx-device-deck-top: #50545f;
    --tx-device-deck-sheen: #636774;
    --tx-device-deck-bottom: #2c2e36;
    --tx-device-chin-bg: #454852;
    --tx-device-stand-bg: #545864;
  }

  &--backdrop-none { border-radius: 0; background: transparent; }
  &--backdrop-solid,
  &--backdrop-gradient,
  &--backdrop-mesh { background: var(--tx-dm-backdrop-custom, var(--tx-fill-color-light, #f5f7fa)); }
  &--backdrop-studio {
    background:
      radial-gradient(ellipse 78% 58% at 50% 6%, var(--tx-device-backdrop-studio-key) 0%, transparent 68%),
      linear-gradient(180deg, var(--tx-device-backdrop-studio-key) 0%, var(--tx-device-backdrop-studio-mid) 58%, var(--tx-device-backdrop-studio-edge) 100%);
  }
  &--backdrop-obsidian {
    background:
      radial-gradient(ellipse 68% 52% at 50% 34%, var(--tx-device-backdrop-obsidian-key) 0%, transparent 66%),
      radial-gradient(ellipse 88% 72% at 50% 50%, var(--tx-device-backdrop-obsidian-mid) 0%, var(--tx-device-backdrop-obsidian-edge) 100%);
  }
  &--backdrop-slate {
    background:
      radial-gradient(ellipse 68% 54% at 24% 14%, var(--tx-device-backdrop-slate-sheen) 0%, transparent 64%),
      linear-gradient(142deg, var(--tx-device-backdrop-slate-top) 0%, var(--tx-device-backdrop-slate-mid) 54%, var(--tx-device-backdrop-slate-edge) 100%);
  }
  &--backdrop-transparent {
    background-image: repeating-conic-gradient(var(--tx-device-checker-a) 0% 25%, var(--tx-device-checker-b) 0% 50%);
    background-size: 16px 16px;
  }

  &.is-backdrop-dark {
    color: var(--tx-device-caption-ink-dark);
    --tx-device-floor-contact: rgba(0, 0, 0, 0.82);
    --tx-device-floor-cast: rgba(0, 0, 0, 0.56);
  }
  &.is-backdrop-light {
    color: var(--tx-device-caption-ink-light);
    --tx-device-grain-tint: rgba(24, 24, 27, 0.06);
  }

  &__grain {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-color: var(--tx-device-grain-tint);
    mask-image: $tx-dm-grain;
    mask-size: 128px 128px;
  }

  /* Shots.so framing modes */
  &--framing-bleed-bottom {
    justify-content: flex-end;
    padding-bottom: 0;
  }
  &--framing-bleed-bottom &__scaler { transform: translateY(16%); }

  &--framing-bleed-top {
    justify-content: flex-start;
    padding-top: 0;
  }
  &--framing-bleed-top &__scaler { transform: translateY(-16%); }

  &--framing-bleed-left {
    align-items: flex-start;
    padding-left: 0;
  }
  &--framing-bleed-left &__stage { align-items: flex-start; }
  &--framing-bleed-left &__scaler { transform: translateX(-14%); }

  &--framing-bleed-right {
    align-items: flex-end;
    padding-right: 0;
  }
  &--framing-bleed-right &__stage { align-items: flex-end; }
  &--framing-bleed-right &__scaler { transform: translateX(14%); }

  &--framing-float &__scaler { transform: translateY(-4px); }

  &__stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
  }

  &__scaler {
    position: relative;
    flex: none;
    max-width: 100%;
    box-sizing: border-box;
  }

  &__assembly {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transform-origin: center center;
    box-sizing: border-box;
  }

  &.is-fluid &__assembly {
    position: relative;
    top: auto;
    left: auto;
    translate: none;
  }

  &__tilt {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    transform-origin: center center;
    transform-style: preserve-3d;
    transition: transform 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    box-sizing: border-box;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  /* 3D chassis container: keeps floor shadow + extruded slab aligned behind flat-composited __shell */
  &__body {
    position: relative;
    z-index: 2;
    display: flex;
    flex: none;
    transform-style: preserve-3d;
    box-sizing: border-box;
  }

  &.is-fluid &__body { width: 100%; }

  /* Decoupled two-layer studio floor shadow in 3D (contact core + soft cast penumbra behind backplate) */
  &__floor-shadow {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  &__floor-cast,
  &__floor-contact {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &__floor-cast {
    background: var(--tx-device-floor-cast);
    filter: blur(var(--tx-dm-floor-cast-blur, 28px));
    opacity: var(--tx-dm-floor-cast-opacity, 0.72);
    transform:
      translateZ(calc(var(--tx-dm-extrusion, 15px) * -1 - 16px))
      translate(var(--tx-dm-floor-cast-x, 22px), var(--tx-dm-floor-cast-y, 34px))
      scale(var(--tx-dm-floor-cast-scale, 1.01));
  }

  &__floor-contact {
    background: var(--tx-device-floor-contact);
    filter: blur(var(--tx-dm-floor-contact-blur, 14px));
    opacity: var(--tx-dm-floor-contact-opacity, 0.76);
    transform:
      translateZ(calc(var(--tx-dm-extrusion, 15px) * -1 - 5px))
      translate(var(--tx-dm-floor-contact-x, 8px), var(--tx-dm-floor-contact-y, 14px))
      scale(var(--tx-dm-floor-contact-scale, 0.96));
  }

  &--perspective-isometric {
    --tx-dm-floor-contact-x: 8px;
    --tx-dm-floor-contact-y: 14px;
    --tx-dm-floor-contact-blur: 14px;
    --tx-dm-floor-cast-x: 24px;
    --tx-dm-floor-cast-y: 38px;
    --tx-dm-floor-cast-blur: 30px;
    --tx-dm-floor-cast-scale: 1.02;
  }

  &--perspective-tilt-left {
    --tx-dm-floor-contact-x: 8px;
    --tx-dm-floor-contact-y: 14px;
    --tx-dm-floor-cast-x: 20px;
    --tx-dm-floor-cast-y: 30px;
    --tx-dm-floor-cast-blur: 26px;
  }

  &--perspective-tilt-right {
    --tx-dm-floor-contact-x: 10px;
    --tx-dm-floor-contact-y: 14px;
    --tx-dm-floor-cast-x: 24px;
    --tx-dm-floor-cast-y: 32px;
    --tx-dm-floor-cast-blur: 26px;
  }

  &--perspective-angled-low {
    --tx-dm-floor-contact-x: 5px;
    --tx-dm-floor-contact-y: 12px;
    --tx-dm-floor-contact-blur: 12px;
    --tx-dm-floor-cast-x: 12px;
    --tx-dm-floor-cast-y: 28px;
    --tx-dm-floor-cast-blur: 24px;
    --tx-dm-floor-cast-scale: 0.97;
  }

  &--perspective-floating {
    --tx-dm-floor-contact-x: 12px;
    --tx-dm-floor-contact-y: 26px;
    --tx-dm-floor-contact-blur: 20px;
    --tx-dm-floor-contact-opacity: 0.56;
    --tx-dm-floor-cast-x: 22px;
    --tx-dm-floor-cast-y: 48px;
    --tx-dm-floor-cast-blur: 32px;
    --tx-dm-floor-cast-scale: 0.9;
    --tx-dm-floor-cast-opacity: 0.58;
  }

  &--shadow-ambient &__floor-cast {
    background: color-mix(in srgb, var(--tx-dm-ambient-color, #3b82f6) 66%, var(--tx-device-floor-cast));
    --tx-dm-floor-cast-blur: 34px;
    --tx-dm-floor-cast-opacity: 0.78;
  }

  &--shadow-grounded {
    --tx-dm-floor-contact-blur: 12px;
    --tx-dm-floor-contact-opacity: 0.88;
    --tx-dm-floor-cast-blur: 24px;
    --tx-dm-floor-cast-opacity: 0.62;
  }

  &--shadow-dramatic {
    --tx-dm-floor-contact-opacity: 0.9;
    --tx-dm-floor-cast-opacity: 0.84;
    --tx-dm-floor-cast-blur: 34px;
    --tx-dm-floor-cast-x: 32px;
    --tx-dm-floor-cast-y: 48px;
  }

  &--shadow-soft {
    --tx-dm-floor-contact-opacity: 0.42;
    --tx-dm-floor-cast-opacity: 0.44;
    --tx-dm-floor-cast-blur: 32px;
  }

  &--shadow-crisp {
    --tx-dm-floor-contact-blur: 8px;
    --tx-dm-floor-contact-opacity: 0.76;
    --tx-dm-floor-cast-blur: 16px;
    --tx-dm-floor-cast-opacity: 0.46;
  }

  /* Continuous extruded 3D machined chassis plates (zero per-layer strokes on intermediate walls -> seamless metal) */
  &__slab {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  &__slab-layer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      142deg,
      var(--tx-device-slab-edge) 0%,
      var(--tx-device-slab-wall) 52%,
      var(--tx-device-slab-back) 100%
    );
    transform: translateZ(calc(var(--tx-dm-layer-idx, 1) * var(--tx-dm-depth-step, 1.5px) * -1));

    &.is-front-chamfer {
      background: linear-gradient(
        142deg,
        var(--tx-device-slab-chamfer) 0%,
        var(--tx-device-slab-edge) 50%,
        var(--tx-device-slab-wall) 100%
      );
      box-shadow: inset 0 0 0 0.75px var(--tx-device-shell-rim-highlight);
    }

    &.is-backplate {
      background: var(--tx-device-slab-back);
      box-shadow: inset 0 0 0 1px var(--tx-device-slab-edge);
    }
  }

  /* Translucent optical glass 3D slab (low per-layer alpha prevents compounding into solid white) */
  &__slab.is-glass-slab &__slab-layer {
    background: linear-gradient(142deg, var(--tx-device-glass-slab-edge) 0%, var(--tx-device-glass-slab-wall) 100%);
    box-shadow: none;

    &.is-backplate {
      background: var(--tx-device-glass-slab-back);
      box-shadow: inset 0 0 0 1px var(--tx-device-glass-slab-rim);
    }
  }

  &--frame-glass-dark &__slab.is-glass-slab &__slab-layer {
    background: linear-gradient(142deg, var(--tx-device-glass-slab-edge-dark) 0%, var(--tx-device-glass-slab-wall-dark) 100%);
    box-shadow: none;

    &.is-backplate {
      background: var(--tx-device-glass-slab-back-dark);
      box-shadow: inset 0 0 0 1px var(--tx-device-glass-slab-edge-dark);
    }
  }

  /* Front face is ALWAYS transform-style: flat so __screen composites inside __shell with zero 3D Z-fighting */
  &__shell {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: none;
    box-sizing: border-box;
    transform-style: flat;
    background: var(--tx-device-shell-bg);
    box-shadow:
      inset 0 0 0 1px var(--tx-device-shell-ring),
      inset 1px 1px 0 0 var(--tx-device-shell-rim-highlight),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);

    /* Authentic two-layer flagship hardware bezel: thin outer metallic band + glossy OLED-black inner glass bezel */
    &.is-two-layer {
      border: 3px solid transparent;
      background-color: transparent;
      background-image:
        linear-gradient(var(--tx-device-oled-bezel), var(--tx-device-oled-bezel)),
        linear-gradient(
          142deg,
          var(--tx-device-band-hi) 0%,
          var(--tx-device-band-mid) 44%,
          var(--tx-device-band-lo) 74%,
          var(--tx-device-band-hi) 100%
        );
      background-origin: border-box;
      background-clip: padding-box, border-box;
      box-shadow:
        inset 0 0 0 0.75px var(--tx-device-oled-rim),
        0 0 0 0.75px var(--tx-device-band-stroke),
        var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
    }

    &.is-dark-chrome {
      --tx-device-browser-bg: var(--tx-device-browser-bg-dark);
      --tx-device-browser-strip: var(--tx-device-browser-strip-dark);
      --tx-device-browser-pill: var(--tx-device-browser-pill-dark);
      --tx-device-browser-border: var(--tx-device-browser-border-dark);
      --tx-device-browser-ink: var(--tx-device-browser-ink-dark);
      --tx-device-browser-muted: var(--tx-device-browser-muted-dark);
    }

    &.is-form-browser-safari,
    &.is-form-browser-safari-compact,
    &.is-form-browser-chrome,
    &.is-form-browser-firefox,
    &.is-form-browser-edge,
    &.is-form-browser-minimal,
    &.is-form-window-macos,
    &.is-form-window-windows {
      background: var(--tx-device-screen-bg);
    }

    &.is-arc {
      flex-direction: row;
      gap: 8px;
      background: var(--tx-device-browser-strip);
    }

    &.is-frameless {
      background: transparent;
      box-shadow:
        0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
        var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
    }
  }

  /* In 3D mode, lift front face +1px ahead of extruded slab & decouple drop-shadow to __floor-shadow */
  &.is-3d {
    --tx-dm-drop-shadow: 0 0 0 0 transparent;
  }

  &.is-3d &__shell {
    transform: translateZ(1px);
    backface-visibility: hidden;
  }

  /* 7 Shots.so shadow presets (all cast down-right at ~1:2 per top-left light source) */
  &--shadow-none { --tx-dm-drop-shadow: 0 0 0 0 transparent; }
  &--shadow-soft { --tx-dm-drop-shadow: 5px 12px 30px -6px var(--tx-device-shadow-soft); }
  &--shadow-crisp {
    --tx-dm-drop-shadow:
      3px 6px 14px -2px var(--tx-device-shadow-crisp),
      1px 2px 4px 0 var(--tx-device-shadow-contact);
  }
  &--shadow-grounded {
    --tx-dm-drop-shadow:
      5px 12px 24px -8px var(--tx-device-shadow-elevated),
      2px 4px 8px -2px var(--tx-device-shadow-contact);
  }
  &--shadow-elevated {
    --tx-dm-drop-shadow:
      8px 18px 42px -10px var(--tx-device-shadow-elevated),
      3px 6px 14px -4px var(--tx-device-shadow-contact);
  }
  &--shadow-dramatic {
    --tx-dm-drop-shadow:
      14px 32px 70px -10px var(--tx-device-shadow-dramatic),
      6px 12px 24px -6px var(--tx-device-shadow-contact);
  }
  &--shadow-ambient {
    --tx-dm-drop-shadow:
      8px 20px 56px -6px color-mix(in srgb, var(--tx-dm-ambient-color, #3b82f6) 42%, transparent),
      3px 6px 16px -4px var(--tx-device-shadow-contact);
  }

  &__contact-ellipse {
    width: 82%;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--tx-device-floor-color);
    filter: blur(10px);
    opacity: 0.56;
    pointer-events: none;
  }

  /* Frame styles (backdrop-filter is strictly 2D-only; 3D uses delicate translucent optical cushions) */
  &--frame-glass-light &__shell:not(.is-frameless) {
    background: var(--tx-device-glass-light-bg);
    backdrop-filter: blur(18px) saturate(145%);
    box-shadow:
      inset 0 0 0 1px var(--tx-device-glass-light-ring),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &.is-3d#{&}--frame-glass-light &__shell:not(.is-frameless) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: linear-gradient(
      145deg,
      var(--tx-device-glass-light-3d-a) 0%,
      var(--tx-device-glass-light-3d-b) 48%,
      var(--tx-device-glass-light-3d-c) 100%
    );
    box-shadow:
      inset 0 0 0 1px var(--tx-device-glass-light-ring),
      inset 1px 1px 0 0 var(--tx-device-shell-rim-highlight);
  }

  &--frame-glass-dark &__shell:not(.is-frameless) {
    background: var(--tx-device-glass-dark-bg);
    backdrop-filter: blur(18px) saturate(130%);
    box-shadow:
      inset 0 0 0 1px var(--tx-device-glass-dark-ring),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &.is-3d#{&}--frame-glass-dark &__shell:not(.is-frameless) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: linear-gradient(
      145deg,
      var(--tx-device-glass-dark-3d-a) 0%,
      var(--tx-device-glass-dark-3d-b) 54%,
      var(--tx-device-glass-dark-3d-c) 100%
    );
    box-shadow:
      inset 0 0 0 1px var(--tx-device-glass-dark-ring),
      inset 1px 1px 0 0 var(--tx-device-shell-rim-highlight);
  }

  &--frame-liquid-glass &__shell:not(.is-frameless) {
    background: radial-gradient(
      circle at var(--tx-dm-sheen-x, 50%) var(--tx-dm-sheen-y, 30%),
      var(--tx-device-liquid-inner) 0%,
      var(--tx-device-liquid-bg) 68%
    );
    backdrop-filter: blur(20px) saturate(150%);
    box-shadow:
      inset 0 0 0 1px var(--tx-device-liquid-ring),
      inset 1.5px 2px 6px 0 var(--tx-device-liquid-inner),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &.is-3d#{&}--frame-liquid-glass &__shell:not(.is-frameless) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background:
      radial-gradient(
        circle at var(--tx-dm-sheen-x, 50%) var(--tx-dm-sheen-y, 30%),
        var(--tx-device-liquid-3d-sheen) 0%,
        transparent 54%
      ),
      linear-gradient(
        142deg,
        var(--tx-device-liquid-3d-edge) 0%,
        var(--tx-device-liquid-3d-mid) 46%,
        var(--tx-device-liquid-bg) 100%
      );
    box-shadow:
      inset 0 0 0 1px var(--tx-device-liquid-ring),
      inset 1.5px 2px 6px 0 var(--tx-device-liquid-inner);
  }

  &--frame-glass-light &__screen,
  &--frame-glass-dark &__screen,
  &--frame-liquid-glass &__screen {
    box-shadow: 0 0 0 1px var(--tx-device-glass-screen-seam);
  }

  &--frame-inset &__shell:not(.is-frameless) {
    box-shadow:
      inset 0 0 0 1px var(--tx-device-shell-ring),
      inset 2px 4px 10px 0 var(--tx-device-shadow-elevated),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &--frame-outline &__shell:not(.is-frameless) {
    background: transparent;
    box-shadow:
      inset 0 0 0 1.5px var(--tx-border-color, #dcdfe6),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &--frame-border &__shell:not(.is-frameless) {
    background: var(--tx-border-color-light, #e4e7ed);
    box-shadow:
      inset 0 0 0 1px var(--tx-border-color, #dcdfe6),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
  }

  &__side-btn {
    position: absolute;
    background: var(--tx-device-hardware-btn);
    border-radius: 2px;
    pointer-events: none;

    &--action { left: -3px; top: 16%; width: 3px; height: 28px; }
    &--vol-up { left: -3px; top: 24%; width: 3px; height: 44px; }
    &--vol-down { left: -3px; top: 32%; width: 3px; height: 44px; }
    &--power { right: -3px; top: 27%; width: 3px; height: 64px; }
    &--top-a { top: -3px; left: 24%; width: 44px; height: 3px; }
    &--top-b { top: -3px; left: 34%; width: 44px; height: 3px; }
    &--bottom-pwr { bottom: -3px; left: 28%; width: 64px; height: 3px; }
  }

  /* Offset side buttons outside the 3px transparent metallic border box when two-layer bezel is active */
  &__shell.is-two-layer &__side-btn {
    &--action,
    &--vol-up,
    &--vol-down { left: -5.5px; }
    &--power { right: -5.5px; }
    &--top-a,
    &--top-b { top: -5.5px; }
    &--bottom-pwr { bottom: -5.5px; }
  }

  &__watch-crown {
    position: absolute;
    top: 24%;
    right: -7px;
    width: 7px;
    height: 34px;
    border-radius: 1px 4px 4px 1px;
    background: repeating-linear-gradient(
      180deg,
      var(--tx-device-slab-edge) 0 2px,
      var(--tx-device-hardware-btn) 2px 4px
    );
    box-shadow: inset 0 0 0 0.75px var(--tx-device-shell-ring);
    pointer-events: none;

    &.is-circle-crown {
      top: 39%;
      height: 28px;
    }
  }

  &__watch-side-btn {
    position: absolute;
    top: 58%;
    right: -3px;
    width: 3px;
    height: 22px;
    border-radius: 0 2px 2px 0;
    background: var(--tx-device-hardware-btn);
    pointer-events: none;
  }

  &__shell.is-two-layer &__watch-crown { right: -9.5px; }
  &__shell.is-two-layer &__watch-side-btn { right: -5.5px; }

  /* Sculpted tapered watch straps tucked smoothly behind the watch chassis */
  &__watch-lug {
    position: relative;
    z-index: 1;
    width: 50%;
    height: 26px;
    pointer-events: none;

    &--top {
      margin-bottom: -9px;
      border-radius: 10px 10px 3px 3px;
      clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
      background: linear-gradient(180deg, var(--tx-device-strap-fade) 0%, var(--tx-device-strap-mid) 54%, var(--tx-device-strap-root) 100%);
    }

    &--bottom {
      margin-top: -9px;
      border-radius: 3px 3px 10px 10px;
      clip-path: polygon(0% 0%, 100% 0%, 92% 100%, 8% 100%);
      background: linear-gradient(0deg, var(--tx-device-strap-fade) 0%, var(--tx-device-strap-mid) 54%, var(--tx-device-strap-root) 100%);
    }
  }

  &.is-circular &__watch-lug {
    width: 44%;
    height: 32px;

    &--top { margin-bottom: -16px; }
    &--bottom { margin-top: -16px; }
  }

  &.is-3d &__watch-lug { transform: translateZ(-2px); }

  /* Sleek anodized aluminum laptop base deck (centered 108% width, dark hinge groove, locked to 3D front plane) */
  &__laptop-deck {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 20px;
    margin-top: -1px;
    border-radius: 2px 2px 12px 12px;
    border-bottom: 2px solid var(--tx-device-slab-back);
    box-sizing: border-box;
    background:
      linear-gradient(180deg, var(--tx-device-hinge-bg) 0, var(--tx-device-hinge-bg) 2.5px, transparent 2.5px),
      linear-gradient(
        90deg,
        var(--tx-device-deck-edge) 0%,
        var(--tx-device-deck-top) 12%,
        var(--tx-device-deck-sheen) 50%,
        var(--tx-device-deck-top) 88%,
        var(--tx-device-deck-edge) 100%
      );
    box-shadow:
      inset 0 -3px 4px 0 var(--tx-device-deck-bottom),
      inset 0 3px 0 0 var(--tx-device-shell-rim-highlight),
      var(--tx-dm-drop-shadow, 0 0 0 0 transparent);
    pointer-events: none;
  }

  &.is-3d &__laptop-deck {
    transform: translateZ(1px);
  }

  &__laptop-lip {
    position: absolute;
    top: 2px;
    left: 50%;
    width: 12%;
    height: 5px;
    transform: translateX(-50%);
    border-radius: 0 0 6px 6px;
    background: var(--tx-device-deck-bottom);
  }

  &__imac-chin {
    flex: none;
    height: 68px;
    margin: var(--tx-dm-bezel, 14px) calc(var(--tx-dm-bezel, 14px) * -1) calc(var(--tx-dm-bezel, 14px) * -1);
    border-radius: 0 0 var(--tx-dm-outer-radius, 24px) var(--tx-dm-outer-radius, 24px);
    background: var(--tx-device-chin-bg);
    pointer-events: none;
  }

  &__shell.is-two-layer &__imac-chin {
    margin: calc(var(--tx-dm-bezel, 14px) - 3px) calc((var(--tx-dm-bezel, 14px) - 3px) * -1) calc((var(--tx-dm-bezel, 14px) - 3px) * -1);
    border-radius: 0 0 calc(var(--tx-dm-outer-radius, 24px) - 3px) calc(var(--tx-dm-outer-radius, 24px) - 3px);
  }

  &__imac-stand,
  &__monitor-stand {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    pointer-events: none;
  }

  &__imac-neck {
    width: 16%;
    height: 112px;
    background: var(--tx-device-stand-bg);
    clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
  }

  &__imac-foot {
    width: 28%;
    height: 12px;
    margin-top: -2px;
    border-radius: 4px;
    background: var(--tx-device-deck-top);
    box-shadow: inset 0 1px 0 0 var(--tx-device-shell-rim-highlight);
  }

  &__monitor-neck { width: 8%; height: 80px; background: var(--tx-device-stand-bg); }
  &__monitor-foot {
    width: 24%;
    height: 10px;
    border-radius: 5px;
    background: var(--tx-device-deck-top);
    box-shadow: inset 0 1px 0 0 var(--tx-device-shell-rim-highlight);
  }

  /* Sleek 124px Arc browser sidebar rail (syncs seamlessly with dark/light browserTheme) */
  &__arc-rail {
    flex: none;
    width: 124px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 4px;
    box-sizing: border-box;
    color: var(--tx-device-browser-ink);
    font-size: 11px;
    user-select: none;

    &.is-dark {
      --tx-device-browser-bg: var(--tx-device-browser-bg-dark);
      --tx-device-browser-strip: var(--tx-device-browser-strip-dark);
      --tx-device-browser-pill: var(--tx-device-browser-pill-dark);
      --tx-device-browser-border: var(--tx-device-browser-border-dark);
      --tx-device-browser-ink: var(--tx-device-browser-ink-dark);
      --tx-device-browser-muted: var(--tx-device-browser-muted-dark);
    }
  }

  &__arc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px;
  }

  &__arc-sidebar-glyph {
    width: 12px;
    height: 9px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-muted);
    opacity: 0.45;
  }

  &__arc-url {
    height: 24px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    border-radius: 7px;
    background: var(--tx-device-browser-pill);
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);
    color: var(--tx-device-browser-muted);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__arc-pins { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  &__arc-pin {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: var(--tx-device-browser-bg);
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);

    i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--tx-device-browser-muted);
      opacity: 0.38;
    }
  }

  &__arc-divider {
    height: 1px;
    background: var(--tx-device-browser-border);
    opacity: 0.7;
  }

  &__arc-tab {
    height: 26px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    border-radius: 7px;
    background: var(--tx-device-browser-pill);
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);
    color: var(--tx-device-browser-ink);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__arc-ghost {
    height: 8px;
    width: 76%;
    margin-left: 6px;
    border-radius: 4px;
    background: var(--tx-device-browser-muted);
    opacity: 0.16;

    &.is-short { width: 52%; }
  }

  /* Browser & OS window toolbars */
  &__browser-bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 0 16px;
    box-sizing: border-box;
    border-radius: var(--tx-dm-outer-radius, 12px) var(--tx-dm-outer-radius, 12px) 0 0;
    overflow: hidden;
    background: var(--tx-device-browser-bg);
    color: var(--tx-device-browser-ink);
    border-bottom: 1px solid var(--tx-device-browser-border);
    font-size: 12px;
    user-select: none;

    &.is-dark {
      --tx-device-browser-bg: var(--tx-device-browser-bg-dark);
      --tx-device-browser-strip: var(--tx-device-browser-strip-dark);
      --tx-device-browser-pill: var(--tx-device-browser-pill-dark);
      --tx-device-browser-border: var(--tx-device-browser-border-dark);
      --tx-device-browser-ink: var(--tx-device-browser-ink-dark);
      --tx-device-browser-muted: var(--tx-device-browser-muted-dark);
    }

    &--browser-safari { height: 44px; justify-content: space-between; }
    &--browser-safari-compact { height: 38px; justify-content: space-between; }
    &--browser-minimal,
    &--window-macos,
    &--window-windows { height: 36px; justify-content: space-between; }
    &--browser-chrome,
    &--browser-firefox,
    &--browser-edge { flex-direction: column; align-items: stretch; gap: 0; height: 72px; padding: 0; }
  }

  &__win-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__win-glyph {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--tx-device-browser-muted);
    opacity: 0.45;
  }

  &__win-controls {
    display: inline-flex;
    align-items: center;
    gap: 18px;
    color: var(--tx-device-browser-ink);
  }

  &__traffic-lights { display: inline-flex; align-items: center; gap: 7px; flex: none; }
  &__dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    display: inline-block;
    &--close { background: var(--tx-device-dot-close); }
    &--min { background: var(--tx-device-dot-min); }
    &--max { background: var(--tx-device-dot-max); }
  }

  &__safari-url {
    flex: 1 1 auto;
    max-width: 460px;
    margin: 0 auto;
    height: 26px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    background: var(--tx-device-browser-pill);
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);
    color: var(--tx-device-browser-muted);
    overflow: hidden;
  }

  &__url-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__lock { flex: none; opacity: 0.72; }

  &__minimal-title {
    flex: 1 1 auto;
    text-align: center;
    padding-right: 48px;
    color: var(--tx-device-browser-muted);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chrome-tabs {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    height: 34px;
    padding: 0 14px;
    background: var(--tx-device-browser-strip);
  }

  &__chrome-tab {
    height: 28px;
    max-width: 220px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    border-radius: 8px 8px 0 0;
    background: var(--tx-device-browser-bg);
    color: var(--tx-device-browser-ink);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-pill-tab {
      height: 24px;
      margin-bottom: 5px;
      border-radius: 7px;
      background: var(--tx-device-browser-pill);
      box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);
    }
  }

  &__chrome-omni { display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 14px; }
  &__chrome-nav { flex: none; color: var(--tx-device-browser-muted); font-size: 14px; }
  &__url-pill {
    flex: 1 1 auto;
    height: 26px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-radius: 999px;
    background: var(--tx-device-browser-pill);
    box-shadow: inset 0 0 0 1px var(--tx-device-browser-border);
    color: var(--tx-device-browser-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__screen {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--tx-device-screen-bg);
    clip-path: inset(0 round var(--tx-dm-inner-radius, 0px));
    box-sizing: border-box;

    &.is-browser-screen {
      clip-path: inset(0 round 0 0 var(--tx-dm-inner-radius, 0px) var(--tx-dm-inner-radius, 0px));
    }

    &.is-arc-screen {
      clip-path: inset(0 round 8px);
      box-shadow: 0 0 0 1px var(--tx-device-browser-border);
    }

    &.is-circular-screen {
      clip-path: circle(50% at 50% 50%);
    }
  }

  &__content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  &__media {
    display: block;
    width: 100%;
    height: 100%;
    flex: 1 1 auto;
    &.is-underlay { position: absolute; inset: 0; z-index: 0; }
  }

  &__glare {
    position: absolute;
    inset: -12%;
    z-index: 3;
    pointer-events: none;
    background: linear-gradient(
      128deg,
      var(--tx-device-glare-a) 0%,
      var(--tx-device-glare-b) 38%,
      transparent 52%
    );
    transform: translate(
      calc((var(--tx-dm-sheen-x, 50%) - 50%) * 0.16),
      calc((var(--tx-dm-sheen-y, 30%) - 50%) * 0.12)
    );
  }

  &__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 100%;
    padding: 24px;
    box-sizing: border-box;
    background: var(--tx-fill-color-lighter, #fafafa);
    color: var(--tx-text-color-regular, #606266);
    text-align: center;
  }

  &__placeholder-badge { font-size: 14px; font-weight: 600; color: var(--tx-text-color-primary, #303133); }
  &__placeholder-dim { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--tx-text-color-secondary, #909399); }

  &__overlay { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  &__lid-notch { position: absolute; top: 0; left: 50%; z-index: 5; transform: translateX(-50%); pointer-events: none; }

  &__status-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 4;
    color: var(--tx-device-status-ink);
    pointer-events: none;
    user-select: none;
    &.is-dark-screen { color: var(--tx-device-status-ink-dark); }
  }

  &__status-svg {
    display: block;
    width: 100%;
    pointer-events: none;
    &--cutout-only { position: absolute; top: 0; left: 0; z-index: 5; }
  }

  &__status-time {
    fill: currentColor;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    &--watch { font-size: 11px; }
  }

  &__landscape-cutout { position: absolute; top: 50%; left: 0; z-index: 5; transform: translateY(-50%); pointer-events: none; }

  &__home-indicator {
    position: absolute;
    bottom: 7px;
    left: 50%;
    z-index: 4;
    width: 34%;
    min-width: 64px;
    max-width: 134px;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tx-device-status-ink) 32%, transparent);
    transform: translateX(-50%);
    pointer-events: none;
    &.is-dark-screen { background: color-mix(in srgb, var(--tx-device-status-ink-dark) 42%, transparent); }
  }

  &__caption {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    text-align: center;
    text-wrap: balance;
  }

  &__watermark {
    position: absolute;
    right: 16px;
    bottom: 12px;
    z-index: 2;
    font-size: 12px;
    font-weight: 500;
    color: var(--tx-text-color-secondary, #909399);
    pointer-events: none;
    user-select: none;
  }

  &.is-backdrop-dark &__watermark { color: var(--tx-device-watermark-ink-dark); }
  &.is-backdrop-light &__watermark { color: var(--tx-device-watermark-ink-light); }
}

/* Morph, orientation settle, floating, and chrome transitions — strictly gated under no-preference */
@media (prefers-reduced-motion: no-preference) {
  @keyframes tx-device-mockup-float {
    0%, 100% { translate: 0 0; }
    50% { translate: 0 -7px; }
  }

  @keyframes tx-device-mockup-floor-float {
    0%, 100% { scale: 1; opacity: 0.56; }
    50% { scale: 0.92; opacity: 0.42; }
  }

  @keyframes tx-device-mockup-orient-cw {
    0% { rotate: -6deg; scale: 0.95; }
    62% { rotate: 1.2deg; scale: 1.01; }
    100% { rotate: 0deg; scale: 1; }
  }

  @keyframes tx-device-mockup-orient-ccw {
    0% { rotate: 6deg; scale: 0.95; }
    62% { rotate: -1.2deg; scale: 1.01; }
    100% { rotate: 0deg; scale: 1; }
  }

  .tx-device-mockup__tilt.is-floating {
    animation: tx-device-mockup-float 4.8s ease-in-out infinite;
  }

  .tx-device-mockup__tilt.is-floating .tx-device-mockup__floor-shadow {
    animation: tx-device-mockup-floor-float 4.8s ease-in-out infinite;
  }

  .tx-device-mockup.is-morphing .tx-device-mockup__scaler {
    transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1), height 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-device-mockup.is-morphing .tx-device-mockup__assembly {
    transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1), height 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-device-mockup.is-morphing .tx-device-mockup__shell {
    transition:
      width 420ms cubic-bezier(0.22, 1, 0.36, 1),
      height 420ms cubic-bezier(0.22, 1, 0.36, 1),
      padding 420ms cubic-bezier(0.22, 1, 0.36, 1),
      border-radius 420ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 320ms ease,
      box-shadow 360ms ease;
  }

  .tx-device-mockup.is-morphing .tx-device-mockup__slab-layer {
    transition: border-radius 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-device-mockup.is-morphing .tx-device-mockup__screen {
    transition:
      width 420ms cubic-bezier(0.22, 1, 0.36, 1),
      height 420ms cubic-bezier(0.22, 1, 0.36, 1),
      border-radius 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-device-mockup.is-orienting-cw .tx-device-mockup__tilt {
    animation: tx-device-mockup-orient-cw 440ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-device-mockup.is-orienting-ccw .tx-device-mockup__tilt {
    animation: tx-device-mockup-orient-ccw 440ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-dm-chrome-enter-active,
  .tx-dm-chrome-leave-active {
    transition: opacity 180ms ease, scale 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tx-dm-chrome-enter-from,
  .tx-dm-chrome-leave-to {
    opacity: 0;
    scale: 0.96;
  }
}

.dark .tx-device-mockup,
[data-theme='dark'] .tx-device-mockup {
  --tx-device-backdrop-studio-key: #1c212d;
  --tx-device-backdrop-studio-mid: #10131a;
  --tx-device-backdrop-studio-edge: #080a0f;
  --tx-device-shadow-soft: rgba(0, 0, 0, 0.34);
  --tx-device-shadow-crisp: rgba(0, 0, 0, 0.48);
  --tx-device-shadow-elevated: rgba(0, 0, 0, 0.52);
  --tx-device-shadow-dramatic: rgba(0, 0, 0, 0.68);
  --tx-device-shadow-contact: rgba(0, 0, 0, 0.32);
  --tx-device-floor-color: rgba(0, 0, 0, 0.72);
  --tx-device-floor-contact: rgba(0, 0, 0, 0.84);
  --tx-device-floor-cast: rgba(0, 0, 0, 0.62);
}

@media (prefers-contrast: more) {
  .tx-device-mockup {
    --tx-device-shell-ring: var(--tx-border-color, #6b7280);
  }
}
</style>
