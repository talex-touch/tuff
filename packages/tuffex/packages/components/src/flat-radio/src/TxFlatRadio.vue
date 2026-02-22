<script setup lang="ts">
import type { TxFlatRadioProps, TxFlatRadioSize, TxFlatRadioValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRefs, watch } from 'vue'
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

provide(FLAT_RADIO_KEY, {
  modelValue: computed(() => props.modelValue),
  multiple: computed(() => props.multiple),
  disabled: computed(() => props.disabled),
  size: computed(() => props.size as TxFlatRadioSize),
  registerItem,
  unregisterItem,
  select,
  isSelected,
})

// --- Indicator (single-select only) ---
const containerRef = ref<HTMLElement | null>(null)
const indicatorStyle = ref<Record<string, string>>({
  opacity: '0',
  transform: 'translateX(0)',
  width: '0px',
})
const indicatorTransition = ref(true)

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

  const left = el.offsetLeft
  const width = el.offsetWidth

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

  if (containerRef.value) {
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

// Track focused value for multi-select keyboard navigation
const focusedValue = ref<TxFlatRadioValue | null>(null)

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
const sizeConfig = computed(() => {
  const map: Record<TxFlatRadioSize, { height: string, padding: string, fontSize: string, gap: string, radius: string, itemRadius: string }> = {
    sm: { height: '24px', padding: '2px', fontSize: '12px', gap: '2px', radius: '6px', itemRadius: '4px' },
    md: { height: '30px', padding: '3px', fontSize: '13px', gap: '4px', radius: '8px', itemRadius: '6px' },
    lg: { height: '36px', padding: '4px', fontSize: '14px', gap: '4px', radius: '10px', itemRadius: '8px' },
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
}))
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
  background: var(--tx-fill-color, #f0f2f5);
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
    padding: 0 8px;
    border-radius: var(--tx-flat-radio-item-radius, 6px);
    font-size: inherit;
  }
}

.tx-flat-radio__indicator {
  position: absolute;
  top: var(--tx-flat-radio-padding, 3px);
  left: 0;
  height: calc(100% - var(--tx-flat-radio-padding, 3px) * 2);
  border-radius: var(--tx-flat-radio-item-radius, 6px);
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
  pointer-events: none;
  z-index: 0;

  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.15s ease;

  &.no-transition {
    transition: none !important;
  }
}
</style>
