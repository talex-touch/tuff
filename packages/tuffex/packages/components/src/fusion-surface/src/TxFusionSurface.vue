<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { FusionSurfaceBud, FusionSurfaceEmits, FusionSurfaceProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useReducedMotion } from '../../liquid/src/use-reduced-motion'
import { FusionSurfaceDriver, fusionSurfaceLayerSize, fusionSurfaceOpenTarget } from './driver'
import { shadowFilter } from './shadow'

// A rounded surface whose edges grow buds (trays, submenus, bubbles) and pull
// them off into drops. The outline is one SVG path from `fusionSurfacePath()`
// painted under the slot content; the content stays ordinary DOM. See
// geometry.ts for the shape and driver.ts for the per-frame loop.

defineOptions({
  name: 'TxFusionSurface',
})

const props = withDefaults(defineProps<FusionSurfaceProps>(), {
  buds: () => [],
  radius: 16,
  fillet: 12,
  breakAt: 28,
  transition: 'smooth',
  contentBlur: 6,
})

const emit = defineEmits<FusionSurfaceEmits>()

const rootRef = ref<HTMLDivElement | null>(null)
const pathRef = ref<SVGPathElement | null>(null)
const layers = new Map<string, HTMLElement>()
const reducedMotion = useReducedMotion()
/** Buds removed from `buds` that are still closing; their content stays
 *  mounted (and inert) until the silhouette is gone. */
const leaving = shallowRef<FusionSurfaceBud[]>([])
let driver: FusionSurfaceDriver | null = null

// Declared buds, then the ones still closing. Each id once, the first
// declaration winning, as in the driver: a repeated id would be a duplicate
// `v-for` key, and a leaving bud that was declared again is not leaving.
const rendered = computed(() => {
  const seen = new Set<string>()
  return [...props.buds, ...leaving.value].filter((bud) => {
    if (!bud || seen.has(bud.id))
      return false
    seen.add(bud.id)
    return true
  })
})

// Only what the props set goes inline; everything else falls back to the
// stylesheet's token defaults, so a theme can still restyle a surface that
// was given no colours.
const rootStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.fill)
    style['--tx-fusion-surface-fill'] = props.fill
  if (props.stroke)
    style['--tx-fusion-surface-stroke'] = props.stroke
  if (typeof props.strokeWidth === 'number' && Number.isFinite(props.strokeWidth))
    style['--tx-fusion-surface-stroke-width'] = `${Math.max(0, props.strokeWidth)}px`
  const filter = shadowFilter(props.shadow)
  if (filter)
    style['--tx-fusion-surface-filter'] = filter
  return style
})

// A closed, closing or removed bud keeps focus out of content nobody can see.
// `undefined` when open, never `false`: Vue sets `inert` as a DOM property
// where one exists but falls back to the attribute where it does not, and
// `inert="false"` is still inert.
function inertOf(bud: FusionSurfaceBud): true | undefined {
  const open = fusionSurfaceOpenTarget(bud.open) > 0 && props.buds.some(item => item?.id === bud.id)
  return open ? undefined : true
}

// Size only. Transform, opacity and filter belong to the driver: Vue re-sets
// every key of a style binding on each render, so a key listed here would
// wipe the driver's last frame and leave it there while the loop sleeps.
function layerStyle(bud: FusionSurfaceBud): Record<string, string> {
  const [width, height] = fusionSurfaceLayerSize(bud)
  return { width: `${width}px`, height: `${height}px` }
}

// One ref function per bud id. Vue calls a function ref on every patch of its
// element, so the setter only acts when the element is new: that is when a
// layer mounted while the loop sleeps (a `bud` slot that appears later) needs
// its frame written.
const layerRefs = new Map<string, (el: Element | ComponentPublicInstance | null) => void>()
function layerRef(id: string): (el: Element | ComponentPublicInstance | null) => void {
  let setter = layerRefs.get(id)
  if (!setter) {
    setter = (el) => {
      if (el instanceof HTMLElement) {
        if (layers.get(id) !== el) {
          layers.set(id, el)
          driver?.draw()
        }
      }
      else {
        layers.delete(id)
        layerRefs.delete(id)
      }
    }
    layerRefs.set(id, setter)
  }
  return setter
}

watch(
  () => props.buds,
  (buds) => {
    if (!driver)
      return
    driver.setBuds(buds)
    leaving.value = driver.leavingBuds()
  },
  { deep: true },
)

watch(
  () => [props.radius, props.fillet, props.breakAt, props.transition, props.contentBlur, reducedMotion.value] as const,
  ([radius, fillet, breakAt, transition, contentBlur, reduced]) => {
    driver?.configure({ radius, fillet, breakAt, transition, contentBlur, reducedMotion: reduced })
  },
  { deep: true },
)

onMounted(() => {
  const root = rootRef.value
  if (!root)
    return
  driver = new FusionSurfaceDriver(
    {
      path: () => pathRef.value,
      layer: id => layers.get(id) ?? null,
      onBreak: id => emit('break', id),
      onSettle: () => emit('settle'),
      onLeave: () => {
        if (driver)
          leaving.value = driver.leavingBuds()
      },
    },
    {
      radius: props.radius,
      fillet: props.fillet,
      breakAt: props.breakAt,
      transition: props.transition,
      contentBlur: props.contentBlur,
      reducedMotion: reducedMotion.value,
    },
  )
  const measure = (): void => driver?.setSize(root.offsetWidth, root.offsetHeight)
  measure()
  driver.setBuds(props.buds)
  if (typeof ResizeObserver === 'undefined')
    return
  const observer = new ResizeObserver(measure)
  observer.observe(root)
  onBeforeUnmount(() => observer.disconnect())
})

onBeforeUnmount(() => {
  driver?.destroy()
  driver = null
})
</script>

<template>
  <div ref="rootRef" class="tx-fusion-surface" :style="rootStyle">
    <svg class="tx-fusion-surface__silhouette" aria-hidden="true" focusable="false">
      <path ref="pathRef" class="tx-fusion-surface__shape" />
    </svg>
    <slot />
    <template v-if="$slots.bud">
      <div
        v-for="bud in rendered"
        :key="bud.id"
        :ref="layerRef(bud.id)"
        class="tx-fusion-surface__bud"
        :data-bud="bud.id"
        :style="layerStyle(bud)"
        :inert="inertOf(bud)"
      >
        <slot name="bud" :bud="bud" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.tx-fusion-surface {
  position: relative;
  isolation: isolate;
}

// Behind every child and above the root's own background, the layering
// TxLiquid uses: the silhouette is the surface, the slot content sits on it.
.tx-fusion-surface__silhouette {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  filter: var(--tx-fusion-surface-filter, drop-shadow(var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06))));
}

.tx-fusion-surface__shape {
  fill: var(--tx-fusion-surface-fill, var(--tx-bg-color-overlay, #fff));
  stroke: var(--tx-fusion-surface-stroke, none);
  stroke-width: var(--tx-fusion-surface-stroke-width, 1px);
  // The remnant's apex and a fresh drop's tail are cusps; a mitred stroke
  // would shoot a spike out of each.
  stroke-linejoin: round;
}

// Placed, faded and blurred by the driver every frame. Invisible until its
// first frame, so server-rendered content never floats without a surface.
// The origin is the top-left corner because the driver scales a closing
// drop's content about the drop's centre, which it computes in the surface's
// coordinates; a centred origin would move with the layer's own size.
.tx-fusion-surface__bud {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  transform-origin: 0 0;
}
</style>
