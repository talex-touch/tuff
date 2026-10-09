<script setup lang="ts">
import type { TxMorphEmits, TxMorphProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMorphBox } from '../../../../utils/use-morph-box'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import { presets, resolveTransition } from '../../liquid/src/spring'

defineOptions({
  name: 'TxMorph',
})

const props = withDefaults(defineProps<TxMorphProps>(), {
  morphKey: undefined,
  radius: undefined,
  fill: undefined,
  inset: undefined,
  spring: 'snappy',
  width: true,
  height: true,
  tag: 'div',
})

const emit = defineEmits<TxMorphEmits>()

const boxRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const reduced = useReducedMotion()

// One spring for both halves: the size integrates it frame by frame (so a
// change mid-flight keeps its momentum), and the radius and fill run it as the
// CSS curve liquid compiles from the same numbers.
const springConfig = computed(() => {
  const spring = props.spring
  const base = typeof spring === 'string' ? presets[spring] ?? presets.snappy : { ...presets.snappy, ...spring }
  return { stiffness: base.stiffness, damping: base.damping, mass: base.mass }
})
const timing = computed(() => resolveTransition(springConfig.value, reduced.value))

const { morphing } = useMorphBox(boxRef, contentRef, {
  width: () => props.width,
  height: () => props.height,
  spring: springConfig,
  onFrame: (frame) => {
    if (frame.settled)
      emit('settle')
  },
})

// Radius and fill ease only across a change: the class opens the window and a
// timer closes it once the curve has run, so a host's hover rules stay instant.
const changing = ref(false)
let changeTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [props.radius, props.fill, props.morphKey],
  () => {
    changing.value = true
    if (changeTimer)
      clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      changing.value = false
    }, timing.value.duration + 60)
  },
)
onBeforeUnmount(() => {
  if (changeTimer)
    clearTimeout(changeTimer)
})

const length = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value)

const style = computed(() => ({
  '--tx-morph-radius': length(props.radius),
  '--tx-morph-fill': props.fill,
  '--tx-morph-inset': length(props.inset),
  '--tx-morph-duration': `${timing.value.duration}ms`,
  '--tx-morph-easing': timing.value.easing,
}))

/**
 * The leaving content keeps the size it had and steps out of flow, centred in
 * the shape, so the content box measures only what is arriving and the shape
 * starts towards it in the same frame. It is inert while it fades.
 */
function pinLeaving(el: Element) {
  const node = el as HTMLElement
  node.style.width = `${node.offsetWidth}px`
  node.style.height = `${node.offsetHeight}px`
  node.setAttribute('inert', '')
  node.setAttribute('aria-hidden', 'true')
}
</script>

<template>
  <component
    :is="tag"
    ref="boxRef"
    class="tx-morph"
    :class="{ 'is-morphing': morphing || changing, 'is-fluid': !width }"
    :style="style"
  >
    <div ref="contentRef" class="tx-morph__content">
      <Transition name="tx-morph-swap" @before-leave="pinLeaving">
        <div :key="morphKey" class="tx-morph__layer">
          <slot />
        </div>
      </Transition>
    </div>
  </component>
</template>

<style lang="scss">
// Registered so it can transition, and inherited so children computing a
// concentric radius from it follow the animated value, not the target.
@property --tx-morph-radius {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}

// Every shape starts from its own values: custom properties inherit, and a
// nested shape must not pick up its parent's fill, inset or radius. Zero
// specificity, so the props (inline) and a host's own class both win.
:where(.tx-morph) {
  --tx-morph-radius: 0px;
  --tx-morph-fill: transparent;
  --tx-morph-inset: 0px;
}

.tx-morph {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  max-width: 100%;
  overflow: hidden;
  vertical-align: middle;
  border-radius: var(--tx-morph-radius);
  background: var(--tx-morph-fill);
}

// Width left to layout: block level, and the content fills it.
.tx-morph.is-fluid {
  display: flex;
}

// Static, so the pinned leaving layer is positioned against the shape itself.
// The inset is the content's own padding: a change of inset is then a change
// of the size the shape springs to, never a jump of the shape's edges.
.tx-morph__content {
  flex: none;
  box-sizing: border-box;
  padding: var(--tx-morph-inset);
}

// On a morphed width the content keeps its own width, whatever the shape is
// doing mid-flight; that is the size the shape is measured towards.
.tx-morph:not(.is-fluid) > .tx-morph__content {
  width: max-content;
}

.tx-morph.is-fluid > .tx-morph__content {
  width: 100%;
}

.tx-morph-swap-leave-active {
  position: absolute;
  inset: 0;
  margin: auto;
  pointer-events: none;
}

// Declared only for those who have not asked for less motion: reduced motion
// swaps the content and lands the shape at once.
@media (prefers-reduced-motion: no-preference) {
  .tx-morph.is-morphing {
    transition:
      --tx-morph-radius var(--tx-morph-duration) var(--tx-morph-easing),
      background-color 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  // Exit first and fast; entry a beat later, so the two never read as one smear.
  .tx-morph-swap-leave-active {
    transition:
      opacity 120ms ease-out,
      filter 120ms ease-out;
  }

  .tx-morph-swap-enter-active {
    transition:
      opacity 260ms ease-out 70ms,
      filter 260ms ease-out 70ms,
      transform 340ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) 70ms;
  }

  .tx-morph-swap-enter-from {
    opacity: 0;
    filter: blur(4px);
    transform: scale(0.96);
  }

  .tx-morph-swap-leave-to {
    opacity: 0;
    filter: blur(3px);
  }
}
</style>
