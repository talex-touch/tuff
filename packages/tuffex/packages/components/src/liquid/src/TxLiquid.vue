<script setup lang="ts">
import type { LiquidProps } from './types'
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, useId, watchEffect } from 'vue'
import { liquidContextKey } from './context'
import { buildGooFilter } from './filter-primitives'
import { ObserveEngine } from './observer'
import { parseShadow } from './shadow'

// Vue port of the liquid-gooey group (`<Liquid>` / Gooey.tsx)
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// Renders the merged silhouette (goo filter + real shadow chain) behind its
// slot content. Items stay crisp; <TxLiquidItem> mirrors each piece's geometry
// into the liquid layer. Filters run on SVG content — not CSS url() filters on
// HTML — because that is the one variant WebKit renders correctly.

defineOptions({
  name: 'TxLiquid',
})

const props = withDefaults(defineProps<LiquidProps>(), {
  blur: 6,
  contrast: 18,
  fill: '#fff',
  shadow: undefined,
  filterPadding: 24,
})

const filterId = `tx-liquid-${useId().replace(/[^a-z0-9_-]/gi, '-')}`

const groupRef = ref<HTMLDivElement | null>(null)
const filterRef = ref<SVGElement | null>(null)
const portal = shallowRef<SVGGElement | null>(null)
const meltPortal = shallowRef<SVGGElement | null>(null)
const size = ref({ w: 0, h: 0 })

const shadows = computed(() => parseShadow(props.shadow))

// The filter raster is the whole performance story on WebKit, which runs SVG
// filters on the CPU at full device scale. The heavy layers are the BLURRED
// outer shadows — CSS drop-shadow() is mathematically the same operation
// (blur-radius = 2σ) but runs on the COMPOSITOR, GPU-accelerated in both
// WebKit and Chromium. So the stack is split:
//   - blurred/offset outer shadows  -> drop-shadow() on the svg element
//   - spread rings and inset layers -> SVG passes (cheap morphology/offset ops)
//   - the goo chain itself          -> SVG, as before
const svgShadows = computed(() => shadows.value.filter(s => s.inset || s.spread !== 0))
const cssShadowFilter = computed(() =>
  shadows.value
    .filter(s => !s.inset && s.spread === 0)
    // box-shadow lists paint the FIRST layer on top; drop-shadow chains paint
    // later filters behind earlier output, so document order already matches.
    .map(s => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`)
    .join(' '),
)
const shadowExtent = computed(() =>
  svgShadows.value.reduce(
    (m, s) => Math.max(m, Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur * 1.5 + Math.max(0, s.spread)),
    0,
  ),
)
const pad = computed(() => Math.ceil(props.blur * 3 + shadowExtent.value + props.filterPadding))

const engine = new ObserveEngine(() => groupRef.value)
watchEffect(() => {
  engine.gooBlur = props.blur
})
onBeforeUnmount(() => engine.dispose())

provide(liquidContextKey, {
  portal,
  meltPortal,
  fill: () => props.fill,
  getGroup: () => groupRef.value,
  engine,
})

// The goo/shadow passes are rebuilt imperatively so the SVG namespace is
// unambiguous; runs once the <filter> ref exists and again on tuning changes.
watchEffect(() => {
  const filterEl = filterRef.value
  if (!filterEl || typeof document === 'undefined')
    return
  buildGooFilter(filterEl, props.blur, props.contrast, svgShadows.value)
})

onMounted(() => {
  const el = groupRef.value
  if (!el)
    return
  const measure = (): void => {
    if (size.value.w !== el.offsetWidth || size.value.h !== el.offsetHeight)
      size.value = { w: el.offsetWidth, h: el.offsetHeight }
  }
  measure()
  if (typeof ResizeObserver === 'undefined')
    return
  const ro = new ResizeObserver(measure)
  ro.observe(el)
  onBeforeUnmount(() => ro.disconnect())
})
</script>

<template>
  <div ref="groupRef" class="tx-liquid">
    <!-- zIndex -1 inside the isolated group: the liquid paints above the
         group's own background but below every child, positioned or not. -->
    <svg
      aria-hidden="true"
      focusable="false"
      data-gooey-svg=""
      class="tx-liquid__silhouette"
      :style="{ filter: cssShadowFilter || undefined }"
    >
      <defs>
        <filter
          :id="filterId"
          ref="filterRef"
          filterUnits="userSpaceOnUse"
          :x="-pad"
          :y="-pad"
          :width="size.w + pad * 2"
          :height="size.h + pad * 2"
          color-interpolation-filters="sRGB"
        />
      </defs>
      <g :id="`${filterId}-sil`" ref="portal" :filter="`url(#${filterId})`" :style="{ fill }" />
    </svg>
    <!-- Melt overlay: warped-image copies render here, ABOVE the content
         layer. SVG content so displacement/blur filters work in WebKit. The
         mask re-renders the goo-filtered silhouette so the warped copies are
         clipped to the merged surface. -->
    <svg
      aria-hidden="true"
      focusable="false"
      data-gooey-overlay=""
      class="tx-liquid__overlay"
    >
      <defs>
        <mask
          :id="`${filterId}-meltmask`"
          maskUnits="userSpaceOnUse"
          :x="-pad"
          :y="-pad"
          :width="size.w + pad * 2"
          :height="size.h + pad * 2"
        >
          <use :href="`#${filterId}-sil`" />
        </mask>
      </defs>
      <g :mask="`url(#${filterId}-meltmask)`">
        <g ref="meltPortal" />
      </g>
    </svg>
    <slot />
  </div>
</template>

<style scoped>
.tx-liquid {
  position: relative;
  isolation: isolate;
}

.tx-liquid__silhouette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: -1;
  /* Promote the filtered layer: WebKit otherwise repaints the goo a frame or
     two behind the plain-DOM content. */
  will-change: filter, transform;
}

.tx-liquid__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  /* Above the content layer by design, and high enough that an app's own
     stacking (e.g. a dragged item raised over its neighbours) can't slip in
     front and hide the melt. Scoped: the group is an isolated stacking
     context, so this can't escape it. */
  z-index: 9999;
}
</style>
