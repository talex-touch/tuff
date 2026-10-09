<script lang="ts" setup>
import type { JellyRect } from '../../../../utils/use-jelly-indicator'
import { computed, nextTick, onMounted, ref, useSlots, watch } from 'vue'
import { useJellyIndicator } from '../../../../utils/use-jelly-indicator'
import { springSteps } from '../../liquid/src/spring'
import { TxTextTransformer } from '../../text-transformer'

defineOptions({
  name: 'TuffSwitch',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    /** Pending async commit: morphs the thumb into a spinning ring and blocks toggling. */
    loading?: boolean
    size?: 'small' | 'default' | 'large'
    /** Visible text beside the track. Changes morph through `TxTextTransformer`. */
    label?: string
    /** Which side the label sits on. */
    labelPlacement?: 'start' | 'end'
    /** Accessible name. Ignored once a visible label or the default slot is present. */
    ariaLabel?: string
    /** Id of a visible label element that names this switch. */
    ariaLabelledby?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    loading: false,
    size: 'default',
    labelPlacement: 'end',
    ariaLabel: 'Toggle',
    ariaLabelledby: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'change': [value: boolean]
}>()

const slots = useSlots()

const isActive = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

// Loading blocks input the same way `disabled` does, but stays a separate class
// so the ring indicator reads as "busy" instead of inheriting the dimmed look.
const isBlocked = computed(() => props.disabled || props.loading)

const hasLabel = computed(() => Boolean(props.label) || Boolean(slots.default))

// A visible label already names the control, and a competing `aria-label` would
// override the text a speech-control user actually reads (label-in-name).
const effectiveAriaLabel = computed(() => {
  if (props.ariaLabelledby || hasLabel.value)
    return undefined
  return props.ariaLabel
})

function toggle() {
  if (isBlocked.value)
    return
  const newVal = !isActive.value
  isActive.value = newVal
  emit('change', newVal)
}

// --- Thumb travel ---
// The CSS rests the thumb (`left` per state) and stays the truth at rest and
// before hydration. A change of state travels on the glide material, as the
// tabs family's indicator does: each end of the thumb rides its own spring, so
// it stretches towards where it is going and gathers as it lands, and a toggle
// mid-flight bends the trip instead of restarting it. The engine draws through
// `translate` and `width` only, leaving `transform` to the press feedback, and
// lands every move at once under reduced motion.
const trackRef = ref<HTMLElement | null>(null)
const thumbRef = ref<HTMLElement | null>(null)
let rest = { left: 0, size: 0 }
/** The last move found the thumb unrendered, so the engine holds no real position. */
let unplaced = true

function measureRest(thumb: HTMLElement): JellyRect | null {
  const style = getComputedStyle(thumb)
  // `left` is the CSS resting place for the current state, untouched by the
  // engine's `translate`; the thumb is square, and its height is never written.
  // Unrendered (a `display: none` ancestor) they come back as the authored
  // percentages, not lengths: there is nothing to travel from or to.
  if (!style.left.endsWith('px') || !style.height.endsWith('px'))
    return null
  rest = { left: Number.parseFloat(style.left), size: Number.parseFloat(style.height) }
  return { x: rest.left, y: 0, width: rest.size, height: rest.size }
}

// Drawn where the CSS already rests it, the thumb carries no inline style: the
// stylesheet is the truth again (a later size change or press reads it).
function paint(rect: Readonly<JellyRect>) {
  const thumb = thumbRef.value
  if (!thumb)
    return
  const dx = rect.x - rest.left
  const atRest = Math.abs(dx) < 0.01 && Math.abs(rect.width - rest.size) < 0.01
  thumb.style.translate = atRest ? '' : `${dx}px 0`
  thumb.style.width = atRest ? '' : `${rect.width}px`
}

const engine = useJellyIndicator({
  axis: 'x',
  material: 'glide',
  integrate: springSteps,
  bounds: () => {
    const track = trackRef.value
    return track && track.clientWidth > 0 ? { start: 0, end: track.clientWidth } : null
  },
  onFrame: frame => paint(frame.rect),
})

function placeThumb(animate: boolean) {
  const thumb = thumbRef.value
  if (!thumb)
    return
  const next = measureRest(thumb)
  if (!next) {
    // Hidden: the CSS alone places it, and the first move once shown lands.
    unplaced = true
    engine.stop()
    thumb.style.translate = ''
    thumb.style.width = ''
    return
  }
  engine.moveTo(next, { animate: animate && !unplaced })
  unplaced = false
  // A trip starts on the next frame; this one must already show the thumb where
  // it was, not where the CSS has just moved it.
  paint(engine.rect.value)
}

onMounted(() => placeThumb(false))
watch(() => props.modelValue, () => nextTick(() => placeThumb(true)))
watch(() => props.size, () => nextTick(() => placeThumb(false)))
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isActive"
    :aria-disabled="isBlocked"
    :aria-busy="loading || undefined"
    :aria-label="effectiveAriaLabel"
    :aria-labelledby="ariaLabelledby"
    :disabled="isBlocked"
    class="tuff-switch" :class="[
      {
        'is-active': isActive,
        'is-disabled': disabled,
        'is-loading': loading,
        'has-label': hasLabel,
        [`tuff-switch--${size}`]: size !== 'default',
      },
    ]"
    @click="toggle"
  >
    <span v-if="hasLabel && labelPlacement === 'start'" class="tuff-switch__label">
      <!-- The prop path animates; slot content is arbitrary nodes we cannot diff. -->
      <TxTextTransformer v-if="!slots.default" :text="label ?? ''" />
      <slot v-else />
    </span>

    <span ref="trackRef" class="tuff-switch__track">
      <span ref="thumbRef" class="tuff-switch__thumb" />
    </span>

    <span v-if="hasLabel && labelPlacement === 'end'" class="tuff-switch__label">
      <TxTextTransformer v-if="!slots.default" :text="label ?? ''" />
      <slot v-else />
    </span>
  </button>
</template>
