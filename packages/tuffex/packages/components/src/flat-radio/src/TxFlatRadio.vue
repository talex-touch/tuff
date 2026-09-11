<script setup lang="ts">
import type { TxFlatRadioProps, TxFlatRadioSize, TxFlatRadioValue } from './types'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, provide, ref, toRefs, watch } from 'vue'
import { FLAT_RADIO_KEY } from './types'

defineOptions({ name: 'TxFlatRadio' })

const props = withDefaults(defineProps<TxFlatRadioProps>(), {
  multiple: false,
  disabled: false,
  size: 'md',
  bordered: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: TxFlatRadioValue | TxFlatRadioValue[]): void
  (e: 'change', value: TxFlatRadioValue | TxFlatRadioValue[]): void
}>()

const { disabled, multiple } = toRefs(props)

// --- Item registration ---
const itemMap = new Map<TxFlatRadioValue, HTMLElement>()
const orderedValues = ref<TxFlatRadioValue[]>([])

function rebuildOrder() {
  const root = containerRef.value
  if (!root) return
  const els = Array.from(root.querySelectorAll<HTMLElement>('.tx-flat-radio-item'))
  const sorted: TxFlatRadioValue[] = []
  for (const el of els) {
    for (const [val, registered] of itemMap) {
      if (registered === el) {
        sorted.push(val)
        break
      }
    }
  }
  orderedValues.value = sorted
}

function registerItem(value: TxFlatRadioValue, el: HTMLElement) {
  itemMap.set(value, el)
  rebuildOrder()
  updateIndicatorNoTransition()
}

function unregisterItem(value: TxFlatRadioValue) {
  itemMap.delete(value)
  rebuildOrder()
  updateIndicatorNoTransition()
}

function isSelected(value: TxFlatRadioValue): boolean {
  if (props.multiple) {
    const arr = Array.isArray(props.modelValue) ? props.modelValue : []
    return arr.includes(value)
  }
  return props.modelValue === value
}

function select(value: TxFlatRadioValue) {
  if (props.disabled) return

  if (props.multiple) {
    const arr = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = arr.indexOf(value)
    if (idx >= 0) {
      arr.splice(idx, 1)
    } else {
      arr.push(value)
    }
    emit('update:modelValue', arr)
    emit('change', arr)
  } else {
    emit('update:modelValue', value)
    emit('change', value)
  }
}

// Virtual-focus cursor for multi-select keyboard navigation. Exposed via the
// context so items can render it (is-focused) and the container can announce it
// through aria-activedescendant.
const focusedValue = ref<TxFlatRadioValue | null>(null)

const uid = getCurrentInstance()?.uid ?? 0
const idMap = new Map<TxFlatRadioValue, string>()
let idSeq = 0
function getItemId(value: TxFlatRadioValue): string {
  let id = idMap.get(value)
  if (id == null) {
    id = `tx-flat-radio-${uid}-item-${idSeq++}`
    idMap.set(value, id)
  }
  return id
}

provide(FLAT_RADIO_KEY, {
  modelValue: computed(() => props.modelValue),
  multiple: computed(() => props.multiple),
  disabled: computed(() => props.disabled),
  size: computed(() => props.size as TxFlatRadioSize),
  focusedValue,
  registerItem,
  unregisterItem,
  select,
  isSelected,
  getItemId,
})

// --- Indicator (single-select only) ---
const containerRef = ref<HTMLElement | null>(null)
const indicatorStyle = ref<Record<string, string>>({
  opacity: '0',
  transform: 'translateX(0)',
  width: '0px',
})
const indicatorTransition = ref(true)

// `offsetLeft` / `offsetWidth` round to whole pixels, so the thumb landed up to
// 1px off its item and by a different amount per item, which reads as wobble
// rather than as an offset. Rects are fractional.
function readGeometry(el: HTMLElement, root: HTMLElement): { left: number, width: number } {
  const item = el.getBoundingClientRect()
  const box = root.getBoundingClientRect()

  // Rects are visual pixels: an ancestor transform or browser zoom scales them,
  // while the translateX below is in the container's own coordinate space.
  const ratio = root.offsetWidth > 0 ? box.width / root.offsetWidth : 1
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1

  // The indicator's `left: 0` resolves against the padding box; a rect delta
  // starts at the border box, so the border has to come back off.
  return {
    left: (item.left - box.left) / scale - root.clientLeft,
    width: item.width / scale,
  }
}

function updateIndicator(animate: boolean) {
  if (props.multiple) {
    indicatorStyle.value = { ...indicatorStyle.value, opacity: '0' }
    return
  }

  const current = props.modelValue as TxFlatRadioValue
  const el = itemMap.get(current)
  if (!el || !containerRef.value) {
    indicatorStyle.value = { ...indicatorStyle.value, opacity: '0' }
    return
  }

  const { left, width } = readGeometry(el, containerRef.value)

  indicatorTransition.value = animate
  indicatorStyle.value = {
    opacity: '1',
    transform: `translateX(${left}px)`,
    width: `${width}px`,
  }
}

function updateIndicatorNoTransition() {
  nextTick(() => updateIndicator(false))
}

// ResizeObserver for layout shifts
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  updateIndicator(false)

  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateIndicator(false)
    })
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    updateIndicator(true)
  },
  { flush: 'post', deep: true },
)

// --- Keyboard navigation ---
function getEnabledValues(): TxFlatRadioValue[] {
  return orderedValues.value.filter((v) => {
    const el = itemMap.get(v)
    return el && !el.hasAttribute('disabled')
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (props.disabled) return

  const enabled = getEnabledValues()
  if (enabled.length === 0) return

  const fallbackValue = enabled[0]
  if (fallbackValue == null)
    return
  const singleValue = Array.isArray(props.modelValue) ? undefined : props.modelValue
  const currentVal = props.multiple
    ? (focusedValue.value ?? fallbackValue)
    : (singleValue ?? fallbackValue)
  const currentIdx = enabled.indexOf(currentVal)
  let nextIdx = -1

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault()
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % enabled.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      nextIdx = currentIdx < 0 ? enabled.length - 1 : (currentIdx - 1 + enabled.length) % enabled.length
      break
    case 'Home':
      e.preventDefault()
      nextIdx = 0
      break
    case 'End':
      e.preventDefault()
      nextIdx = enabled.length - 1
      break
    case ' ':
    case 'Enter':
      if (props.multiple) {
        e.preventDefault()
        if (focusedValue.value != null) {
          select(focusedValue.value)
        }
      }
      return
    default:
      return
  }

  if (nextIdx >= 0) {
    const nextValue = enabled[nextIdx]
    if (nextValue == null)
      return
    if (props.multiple) {
      focusedValue.value = nextValue
    } else if (nextValue !== props.modelValue) {
      select(nextValue)
    }
  }
}

// --- Size config ---
// `itemPadding` and `itemGap` were hard-coded (0 8px / 4px) until xl arrived:
// at 15px type those two values are what read as cramped, and they are the two
// TxFineTuneCard does *not* override, so widening the ladder here leaves its
// inline pin intact.
interface FlatRadioGeometry {
  height: string
  padding: string
  fontSize: string
  gap: string
  radius: string
  itemRadius: string
  itemPadding: string
  itemGap: string
}

const sizeConfig = computed(() => {
  const map: Record<TxFlatRadioSize, FlatRadioGeometry> = {
    sm: { height: '24px', padding: '2px', fontSize: '12px', gap: '2px', radius: '6px', itemRadius: '4px', itemPadding: '0 8px', itemGap: '4px' },
    md: { height: '30px', padding: '3px', fontSize: '13px', gap: '4px', radius: '8px', itemRadius: '6px', itemPadding: '0 8px', itemGap: '4px' },
    lg: { height: '36px', padding: '4px', fontSize: '14px', gap: '4px', radius: '10px', itemRadius: '8px', itemPadding: '0 8px', itemGap: '4px' },
    xl: { height: '44px', padding: '5px', fontSize: '15px', gap: '6px', radius: '14px', itemRadius: '10px', itemPadding: '0 16px', itemGap: '6px' },
  }
  return map[props.size as TxFlatRadioSize] ?? map.md
})

const cssVars = computed(() => ({
  '--tx-flat-radio-height': sizeConfig.value.height,
  '--tx-flat-radio-padding': sizeConfig.value.padding,
  '--tx-flat-radio-font-size': sizeConfig.value.fontSize,
  '--tx-flat-radio-gap': sizeConfig.value.gap,
  '--tx-flat-radio-radius': sizeConfig.value.radius,
  '--tx-flat-radio-item-radius': sizeConfig.value.itemRadius,
  '--tx-flat-radio-item-padding': sizeConfig.value.itemPadding,
  '--tx-flat-radio-item-gap': sizeConfig.value.itemGap,
}))

// Announce the multi-select virtual-focus cursor to assistive tech.
const activeDescendantId = computed(() =>
  props.multiple && focusedValue.value != null ? getItemId(focusedValue.value) : undefined,
)
</script>

<template>
  <div
    ref="containerRef"
    class="tx-flat-radio"
    :class="{
      'is-disabled': disabled,
      'is-bordered': bordered,
      'is-multiple': multiple,
    }"
    :style="cssVars"
    :role="multiple ? 'group' : 'radiogroup'"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
    :aria-activedescendant="activeDescendantId"
    @keydown="handleKeydown"
  >
    <span
      v-if="!multiple"
      class="tx-flat-radio__indicator"
      :class="{ 'no-transition': !indicatorTransition }"
      :style="indicatorStyle"
      aria-hidden="true"
    />
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-flat-radio {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: var(--tx-flat-radio-height, 30px);
  padding: var(--tx-flat-radio-padding, 3px);
  gap: var(--tx-flat-radio-gap, 4px);
  font-size: var(--tx-flat-radio-font-size, 13px);
  border-radius: var(--tx-flat-radio-radius, 8px);
  background: var(--tx-flat-radio-track-bg, var(--tx-fill-color, #f0f2f5));
  box-sizing: border-box;
  outline: none;
  user-select: none;

  &.is-bordered {
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
  }

  &.is-disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 25%, transparent);
  }

  :deep(.tx-flat-radio-item) {
    height: 100%;
    padding: var(--tx-flat-radio-item-padding, 0 8px);
    border-radius: var(--tx-flat-radio-item-radius, 6px);
    font-size: inherit;
  }
}

// The indicator has to sit *above* the track it slides on, and the only
// comparison a viewer makes is thumb against track. Two earlier attempts were
// anchored to the wrong thing: `--tx-bg-color-overlay` alone is white on light
// but *darker* than the track on dark (#1d1e1f against #303030), and mixing the
// text colour into it lifted the thumb relative to the overlay while landing it
// within four RGB steps of the track in both themes — measured rgb(49,50,52)
// against a rgb(48,48,48) track. `--tx-surface-raised` is defined against
// --tx-fill-color, which is the track itself, so the lift cannot invert.
.tx-flat-radio__indicator {
  position: absolute;
  top: var(--tx-flat-radio-padding, 3px);
  left: 0;
  height: calc(100% - var(--tx-flat-radio-padding, 3px) * 2);
  border-radius: var(--tx-flat-radio-item-radius, 6px);
  background: var(--tx-flat-radio-indicator-bg, var(--tx-surface-raised, #fff));
  // Was two stacked straight-down layers totalling ~0.24 alpha, which read as
  // heavy once the xl tier made the thumb large. One soft directional layer now
  // — and it no longer has to stand in for a missing thumb/track contrast.
  box-shadow: var(--tx-flat-radio-indicator-shadow, var(--tx-elevation-2, 1px 2px 8px rgba(0, 0, 0, 0.05)));
  pointer-events: none;
  z-index: 0;
  will-change: transform, width;

  // Travel and resize used to run on two different curves (0.25s overshoot
  // against a 0.2s ease), so on labels of unequal width the thumb arrived and
  // *then* finished growing. One duration and one curve for both makes it read
  // as a single body; the overshoot applies to width on purpose, because the
  // slight stretch past the target and back is the part that feels physical.
  transition:
    transform var(--tx-flat-radio-duration, 0.26s) var(--tx-flat-radio-ease, cubic-bezier(0.32, 1.28, 0.5, 1)),
    width var(--tx-flat-radio-duration, 0.26s) var(--tx-flat-radio-ease, cubic-bezier(0.32, 1.28, 0.5, 1)),
    opacity 0.15s ease;

  &.no-transition {
    transition: none !important;
  }
}

// The fade stays so the thumb still resolves rather than popping in; only the
// travel and the stretch go.
@media (prefers-reduced-motion: reduce) {
  .tx-flat-radio__indicator {
    transition: opacity 0.15s ease;
  }
}
</style>
