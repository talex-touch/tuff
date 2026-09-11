<script setup lang="ts">
import type { PropType } from 'vue'
import type { TabBarEmits, TabBarIndicator, TabBarItem, TabBarSize, TabBarValue } from './types'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useIndicatorBox } from '../../../../utils/use-indicator-box'

defineOptions({ name: 'TxTabBar' })

// A runtime props object, not `defineProps<TabBarProps>()`. The SFC compiler
// resolves an imported props interface by reading the sibling module, and that
// resolution does not pick up fields added to `types.ts` afterwards — a cold dev
// server with every cache cleared still emitted the previous prop list, so a new
// prop silently arrived as a fallthrough attribute and read as `undefined`. The
// build output was correct the whole time, which is what makes it so easy to
// miss. `TxTabs` declares its props the same way. `TabBarProps` stays exported
// for callers; it is just not the source of the runtime list.
const props = defineProps({
  modelValue: { type: [String, Number] as PropType<TabBarValue>, default: '' },
  items: { type: Array as PropType<TabBarItem[]>, default: () => [] },
  fixed: { type: Boolean, default: true },
  safeAreaBottom: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  zIndex: { type: Number, default: 2000 },
  indicator: { type: String as PropType<TabBarIndicator>, default: 'pill' },
  size: { type: String as PropType<TabBarSize>, default: 'md' },
})

const emit = defineEmits<TabBarEmits>()

const value = computed({
  get: () => props.modelValue,
  set: (v: TabBarValue) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

interface TabBarGeometry {
  /** Bar height. The indicator measures the item box, so this drives it too. */
  height: string
  iconSize: string
  labelSize: string
  /** Gap between the icon row and the label. */
  gap: string
  pillRadius: string
  /** How far the pill is inset from the item box, per axis. */
  insetX: number
  insetY: number
}

// Geometry is delivered as inline CSS variables rather than size classes, the
// same contract TxFlatRadio holds: a caller that wants one value different
// overrides that variable instead of having to restate the whole tier.
const sizeConfig = computed<TabBarGeometry>(() => {
  const map: Record<TabBarSize, TabBarGeometry> = {
    sm: { height: '44px', iconSize: '17px', labelSize: '10px', gap: '1px', pillRadius: '10px', insetX: 6, insetY: 4 },
    md: { height: '56px', iconSize: '20px', labelSize: '11px', gap: '2px', pillRadius: '14px', insetX: 8, insetY: 6 },
    lg: { height: '64px', iconSize: '23px', labelSize: '12px', gap: '3px', pillRadius: '16px', insetX: 10, insetY: 7 },
  }
  return map[props.size as TabBarSize] ?? map.md
})

const rootStyle = computed<Record<string, string>>(() => {
  const g = sizeConfig.value
  return {
    '--tx-tab-bar-z-index': String(props.zIndex ?? 2000),
    '--tx-tab-bar-height': g.height,
    '--tx-tab-bar-icon-size': g.iconSize,
    '--tx-tab-bar-label-size': g.labelSize,
    '--tx-tab-bar-item-gap': g.gap,
    '--tx-tab-bar-pill-radius': g.pillRadius,
  }
})

// --- Sliding indicator ---
// The same shared measurement TxSidebarNav and TxFlatRadio read from, so a bar
// that travels cannot drift from the controls that travel beside it.
const innerRef = ref<HTMLElement | null>(null)
const itemMap = new Map<TabBarValue, HTMLElement>()

function setItemRef(v: TabBarValue, el: Element | null): void {
  if (el instanceof HTMLElement)
    itemMap.set(v, el)
  else
    itemMap.delete(v)
}

onBeforeUnmount(() => itemMap.clear())

const { box, revealed } = useIndicatorBox({
  container: innerRef,
  target: () => itemMap.get(props.modelValue as TabBarValue),
})

const showIndicator = computed(() => props.indicator !== 'none' && box.value != null)

const DOT_SIZE = 6

const indicatorStyle = computed<Record<string, string>>(() => {
  const b = box.value
  if (!b)
    return { opacity: '0' }

  // Every variant travels on the same x, so switching one never changes where
  // the indicator is, only what it looks like.
  const style: Record<string, string> = { opacity: '1' }

  if (props.indicator === 'line') {
    // A rule the item's width, pinned to the bar's top edge.
    style.transform = `translateX(${b.left}px)`
    style.width = `${b.width}px`
    return style
  }

  if (props.indicator === 'dot') {
    // Centred under the item rather than filling it, so a dense bar stays quiet.
    style.transform = `translate(${b.left + (b.width - DOT_SIZE) / 2}px, ${b.top + b.height - DOT_SIZE - 6}px)`
    style.width = `${DOT_SIZE}px`
    style.height = `${DOT_SIZE}px`
    return style
  }

  // `pill` and `block` share the inset box and differ only in paint.
  //
  // The inset is arithmetic, not margin: an absolutely positioned box with an
  // explicit width and height ignores margin for sizing, so a CSS margin left
  // the pill at the item's full height and hanging out of the bar.
  const { insetX, insetY } = sizeConfig.value
  style.transform = `translate(${b.left + insetX}px, ${b.top + insetY}px)`
  style.width = `${Math.max(0, b.width - insetX * 2)}px`
  style.height = `${Math.max(0, b.height - insetY * 2)}px`
  return style
})

function onPick(v: TabBarValue, disabled?: boolean) {
  if (props.disabled)
    return
  if (disabled)
    return
  value.value = v
}
</script>

<template>
  <nav
    class="tx-tab-bar"
    :class="{ 'is-fixed': fixed, 'is-disabled': disabled }"
    :style="rootStyle"
  >
    <div ref="innerRef" class="tx-tab-bar__inner">
      <span
        v-if="showIndicator"
        class="tx-tab-bar__indicator"
        :class="[`is-${indicator}`, { 'no-transition': !revealed }]"
        :style="indicatorStyle"
        aria-hidden="true"
      />
      <button
        v-for="it in items"
        :key="String(it.value)"
        :ref="el => setItemRef(it.value, el as Element | null)"
        type="button"
        class="tx-tab-bar__item"
        :class="{ 'is-active': value === it.value, 'is-item-disabled': !!it.disabled }"
        :disabled="disabled || !!it.disabled"
        :aria-current="value === it.value ? 'page' : undefined"
        @click="onPick(it.value, it.disabled)"
      >
        <div class="tx-tab-bar__icon">
          <i v-if="it.iconClass" :class="it.iconClass" />
          <span v-if="it.badge != null && it.badge !== ''" class="tx-tab-bar__badge">{{ it.badge }}</span>
        </div>
        <div class="tx-tab-bar__label">
          {{ it.label }}
        </div>
      </button>
    </div>

    <div v-if="safeAreaBottom" class="tx-tab-bar__safe" aria-hidden="true" />
  </nav>
</template>

<style scoped lang="scss">
.tx-tab-bar {

  width: 100%;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  z-index: var(--tx-tab-bar-z-index, 2000);

  &.is-fixed {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
  }

  &.is-disabled {
    opacity: 0.75;
  }
}

.tx-tab-bar__inner {
  position: relative;
  height: var(--tx-tab-bar-height, 56px);
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: center;
}

// Travel and resize share one duration and one curve — the same contract
// TxFlatRadio's thumb holds. Two curves make the indicator arrive and only then
// finish growing, which is what reads as cheap.
.tx-tab-bar__indicator {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 0;
  will-change: transform, width;

  transition:
    transform var(--tx-tab-bar-indicator-duration, 0.26s) var(--tx-tab-bar-indicator-ease, cubic-bezier(0.32, 1.28, 0.5, 1)),
    width var(--tx-tab-bar-indicator-duration, 0.26s) var(--tx-tab-bar-indicator-ease, cubic-bezier(0.32, 1.28, 0.5, 1)),
    opacity 0.15s ease;

  &.no-transition {
    transition: none !important;
  }

  // The pill is inset from the item box so it reads as sitting inside the bar
  // rather than replacing the row.
  &.is-pill {
    box-sizing: border-box;
    border-radius: var(--tx-tab-bar-pill-radius, 14px);
    background: var(--tx-surface-raised, #fff);
    box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
  }

  // Same box as the pill, but a tint rather than a raised surface — for a bar
  // sitting on a card, where another shadow would just add noise.
  &.is-block {
    box-sizing: border-box;
    border-radius: var(--tx-tab-bar-pill-radius, 14px);
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  }

  &.is-line {
    height: 2px;
    border-radius: 999px;
    background: var(--tx-color-primary, #409eff);
  }

  &.is-dot {
    border-radius: 999px;
    background: var(--tx-color-primary, #409eff);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-tab-bar__indicator {
    transition: opacity 0.15s ease;
  }
}

.tx-tab-bar__item {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--tx-tab-bar-item-gap, 2px) + 2px);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);

  &.is-active {
    color: var(--tx-color-primary, #409eff);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.tx-tab-bar__icon {
  position: relative;
  width: calc(var(--tx-tab-bar-icon-size, 20px) + 2px);
  height: calc(var(--tx-tab-bar-icon-size, 20px) + 2px);
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: var(--tx-tab-bar-icon-size, 20px);
  }
}

.tx-tab-bar__badge {
  position: absolute;
  top: -7px;
  right: -12px;
  box-shadow: 0 0 0 2px var(--tx-bg-color-overlay, #fff);
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--tx-color-danger, #f56c6c);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}

.tx-tab-bar__label {
  font-size: var(--tx-tab-bar-label-size, 11px);
  line-height: 1.1;
}

.tx-tab-bar__safe {
  height: env(safe-area-inset-bottom, 0px);
}
</style>
