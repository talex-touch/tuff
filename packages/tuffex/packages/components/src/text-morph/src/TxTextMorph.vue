<script setup lang="ts">
import type { TextMorphProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { MorphController, MORPH_DEFAULTS } from './engine'

defineOptions({
  name: 'TxTextMorph',
})

const props = withDefaults(defineProps<TextMorphProps>(), {
  tag: 'span',
  durationMs: MORPH_DEFAULTS.durationMs,
  easing: MORPH_DEFAULTS.easing,
  scale: MORPH_DEFAULTS.scale,
  numbers: MORPH_DEFAULTS.numbers,
  locale: MORPH_DEFAULTS.locale,
  disabled: MORPH_DEFAULTS.disabled,
  respectReducedMotion: MORPH_DEFAULTS.respectReducedMotion,
  debug: MORPH_DEFAULTS.debug,
})

const emit = defineEmits<{
  'animation-start': []
  'animation-complete': []
  'animation-cancel': []
}>()

const rootRef = ref<HTMLElement | null>(null)
const controller = new MorphController()

/*
  Rendered once and then frozen. It has to be in the SSR markup so hydration
  matches, but from mount onwards the controller owns these children — letting
  Vue re-render here would wipe the segments mid-morph and the next diff would
  measure elements that are no longer in the DOM.
*/
const initialText = String(props.text)

function controllerOptions() {
  return {
    durationMs: props.durationMs,
    easing: props.easing,
    spring: props.spring,
    scale: props.scale,
    numbers: props.numbers,
    decimals: props.decimals,
    locale: props.locale,
    disabled: props.disabled,
    respectReducedMotion: props.respectReducedMotion,
    debug: props.debug,
    onAnimationStart: () => emit('animation-start'),
    onAnimationComplete: () => emit('animation-complete'),
    onAnimationCancel: () => emit('animation-cancel'),
  }
}

// Serialised rather than watched field by field: `spring` is an object, so a
// deep watcher would fire on every re-render that recreates the literal.
const configKey = computed(() => MorphController.serializeConfig(controllerOptions()))

function attach() {
  if (!rootRef.value)
    return
  controller.attach(rootRef.value, controllerOptions())
  controller.update(props.text, props.cursorIndex)
}

watch(rootRef, () => attach(), { flush: 'post' })
watch(configKey, () => attach())

watch(
  () => [props.text, props.cursorIndex] as const,
  ([text, cursorIndex]) => controller.update(text, cursorIndex),
)

onBeforeUnmount(() => controller.destroy())

defineExpose({
  /** The root element the engine writes into. */
  rootRef,
})
</script>

<template>
  <component :is="tag" ref="rootRef" class="tx-text-morph">
    {{ initialText }}
  </component>
</template>

<!--
  Deliberately NOT scoped. The engine builds every segment with
  `document.createElement`, so those elements never receive the `data-v-*`
  attribute a scoped block keys on and every rule below would silently miss.
  Containment comes from the `tx-morph-*` attribute names instead, which only
  the engine ever writes.
-->
<style lang="scss">
[tx-morph-root] {
  display: inline-block;
  position: relative;
  vertical-align: top;
  will-change: width, height;
  white-space: nowrap;
  text-align: inherit;
}

[tx-morph-item]:not(br) {
  display: inline-block;
  position: relative;
  will-change: opacity, transform;
  transform: none;
  opacity: 1;
}

/*
  The value once as plain text — every other child is an aria-hidden fragment.
  Out of flow, because the engine measures every child of the root. Clipped
  rather than `display: none`, which would take it out of the a11y tree as well.
  `user-select: none`, or a copied selection pastes the value twice.
*/
[tx-morph-sr] {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: pre;
  -webkit-user-select: none;
  user-select: none;
}

/*
  A digit slides a whole line box to arrive, so it needs its own box to hide
  behind. Not the root: that spans every line, so clipping there leaves a digit
  on a middle line sliding over its neighbour in view. The transform sits on the
  child, so the slide never touches the slot's rect and the FLIP pass stays
  oblivious. clip-path, not overflow — an inline-block whose overflow is
  anything but visible has its baseline synthesized to the bottom margin edge
  (CSS 2.1 §10.8.1), and engines disagree on whether `overflow: clip` counts.
  The inline axis stays open so glyph overhang is not shaved.
*/
[tx-morph-slot] {
  clip-path: inset(0 -100vw);
}

[tx-morph-slot] > span {
  display: inline-block;
  will-change: opacity, transform;
}

/*
  Softens the clip above into a gradient, positionally rather than on a timer, so
  it stays in step with the slide at any duration. The band (--tx-morph-fade, 0
  for a hard edge) must eat into the box: the clip trims at the border box, so a
  ramp reaching past it sits in territory already removed and is never seen.
  no-clip plus repeat-x is what carries the profile across glyph overhang.
*/
@supports (mask-clip: no-clip) or (-webkit-mask-clip: no-clip) {
  [tx-morph-slot] {
    --tx-morph-mask: linear-gradient(
      to bottom,
      transparent,
      #000 var(--tx-morph-fade, 0.15em),
      #000 calc(100% - var(--tx-morph-fade, 0.15em)),
      transparent
    );

    -webkit-mask-image: var(--tx-morph-mask);
    mask-image: var(--tx-morph-mask);
    -webkit-mask-repeat: repeat-x;
    mask-repeat: repeat-x;
    -webkit-mask-clip: no-clip;
    mask-clip: no-clip;
  }
}

[tx-morph-root][tx-morph-debug] {
  outline: 2px solid magenta;

  [tx-morph-item] {
    outline: 2px solid cyan;
    outline-offset: -4px;
  }
}
</style>
