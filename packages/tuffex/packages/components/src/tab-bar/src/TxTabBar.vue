<script setup lang="ts">
import type { TabBarEmits, TabBarProps, TabBarValue } from './types'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useIndicatorBox } from '../../../../utils/use-indicator-box'

defineOptions({ name: 'TxTabBar' })

const props = withDefaults(defineProps<TabBarProps>(), {
  modelValue: '',
  items: () => [],
  fixed: true,
  safeAreaBottom: true,
  disabled: false,
  zIndex: 2000,
  indicator: 'pill',
})

const emit = defineEmits<TabBarEmits>()

const value = computed({
  get: () => props.modelValue,
  set: (v: TabBarValue) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const rootStyle = computed<Record<string, string>>(() => {
  return {
    '--tx-tab-bar-z-index': String(props.zIndex ?? 2000),
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

const PILL_INSET_X = 8
const PILL_INSET_Y = 6

const indicatorStyle = computed<Record<string, string>>(() => {
  const b = box.value
  if (!b)
    return { opacity: '0' }

  // A pill wraps the item's box; a line is a rule the item's width, pinned to
  // the bar's top edge. Both travel on the same x, so switching variant never
  // changes where the indicator is, only what it looks like.
  const style: Record<string, string> = { opacity: '1' }

  if (props.indicator === 'line') {
    style.transform = `translateX(${b.left}px)`
    style.width = `${b.width}px`
    return style
  }

  // The inset is arithmetic, not margin: an absolutely positioned box with an
  // explicit width and height ignores margin for sizing, so a CSS margin left
  // the pill at the item's full 56px and hanging 6px out of the bar.
  style.transform = `translate(${b.left + PILL_INSET_X}px, ${b.top + PILL_INSET_Y}px)`
  style.width = `${Math.max(0, b.width - PILL_INSET_X * 2)}px`
  style.height = `${Math.max(0, b.height - PILL_INSET_Y * 2)}px`
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
  --tx-tab-bar-height: 56px;

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
  height: var(--tx-tab-bar-height);
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
    border-radius: 14px;
    background: var(--tx-surface-raised, #fff);
    box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
  }

  &.is-line {
    height: 2px;
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
  gap: 4px;
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
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 20px;
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
  font-size: 12px;
  line-height: 1.1;
}

.tx-tab-bar__safe {
  height: env(safe-area-inset-bottom, 0px);
}
</style>
