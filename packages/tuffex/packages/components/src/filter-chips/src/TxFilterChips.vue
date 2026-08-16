<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { FilterChipItem, FilterChipsEmits, FilterChipsProps } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxFilterChips' })

const props = withDefaults(defineProps<FilterChipsProps>(), {
  items: () => [],
  disabled: false,
  role: 'toolbar',
  ariaLabel: 'Filters',
})

const emit = defineEmits<FilterChipsEmits>()

defineSlots<{
  /** Replaces a chip's inner content (dot, label, count). */
  chip?: (props: { item: FilterChipItem, active: boolean }) => any
}>()

const chipRefs = ref<(HTMLButtonElement | null)[]>([])

function setChipRef(el: Element | null, index: number): void {
  chipRefs.value[index] = el as HTMLButtonElement | null
}

function isDisabled(item: FilterChipItem): boolean {
  return props.disabled || Boolean(item.disabled)
}

function isActive(item: FilterChipItem): boolean {
  return props.modelValue !== undefined && item.value === props.modelValue
}

const activeIndex = computed(() => props.items.findIndex(item => isActive(item)))

// One tab stop for the whole row: Tab lands on the active chip (or the first
// enabled one), and arrow keys move between chips from there.
const rovingIndex = computed(() => {
  if (activeIndex.value >= 0)
    return activeIndex.value
  return props.items.findIndex(item => !isDisabled(item))
})

function select(item: FilterChipItem): void {
  if (isDisabled(item) || isActive(item))
    return
  emit('update:modelValue', item.value)
  emit('change', item.value)
}

function nextEnabled(from: number, step: number): number {
  const count = props.items.length
  if (!count)
    return -1
  for (let hop = 1; hop <= count; hop += 1) {
    const index = (from + step * hop + count * count) % count
    const item = props.items[index]
    if (item && !isDisabled(item))
      return index
  }
  return -1
}

function firstEnabled(step: 1 | -1): number {
  const count = props.items.length
  for (let hop = 0; hop < count; hop += 1) {
    const index = step === 1 ? hop : count - 1 - hop
    const item = props.items[index]
    if (item && !isDisabled(item))
      return index
  }
  return -1
}

function focusChip(index: number): void {
  if (index < 0)
    return
  const target = chipRefs.value[index]
  target?.focus()
  // In a tablist, selection follows focus (automatic activation); a toolbar is
  // a set of independent toggles, so moving focus must not change the filter.
  if (props.role === 'tablist') {
    const item = props.items[index]
    if (item)
      select(item)
  }
}

function onKeydown(event: KeyboardEvent, index: number): void {
  let target = -1
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
    target = nextEnabled(index, 1)
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    target = nextEnabled(index, -1)
  else if (event.key === 'Home')
    target = firstEnabled(1)
  else if (event.key === 'End')
    target = firstEnabled(-1)
  else
    return

  if (target < 0)
    return
  event.preventDefault()
  focusChip(target)
}
</script>

<template>
  <div
    class="tx-bui-filter-chips"
    :role="role"
    :aria-label="ariaLabel"
    :aria-orientation="role === 'tablist' ? 'horizontal' : undefined"
  >
    <button
      v-for="(item, index) in items"
      :key="item.value"
      :ref="el => setChipRef(el as Element | null, index)"
      type="button"
      class="tx-bui-filter-chips__chip"
      :class="{ 'is-active': isActive(item), 'is-disabled': isDisabled(item) }"
      :role="role === 'tablist' ? 'tab' : undefined"
      :aria-pressed="role === 'tablist' ? undefined : isActive(item)"
      :aria-selected="role === 'tablist' ? isActive(item) : undefined"
      :disabled="isDisabled(item)"
      :tabindex="index === rovingIndex ? 0 : -1"
      @click="select(item)"
      @keydown="onKeydown($event, index)"
    >
      <slot name="chip" :item="item" :active="isActive(item)">
        <span
          v-if="item.dot"
          class="tx-bui-filter-chips__dot"
          aria-hidden="true"
          :style="{ background: item.dot }"
        />
        <span class="tx-bui-filter-chips__label">{{ item.label }}</span>
        <span v-if="item.count !== undefined" class="tx-bui-filter-chips__count">{{ item.count }}</span>
      </slot>
    </button>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-filter-chips {
  @include bui-scope;

  display: flex;
  align-items: center;
  gap: 4px;
  // Negative margin plus equal padding: the chips scroll edge-to-edge while
  // hover/focus rings still have room instead of being clipped.
  margin: 0 -4px 4px;
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tx-bui-filter-chips__chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-bui-ink-2, #62656b);
  cursor: pointer;
  transition:
    background-color 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    color 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(.is-active):not(.is-disabled) {
    background: var(--tx-bui-hover, #f4f5f6);
  }

  &.is-active {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-filter-chips__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.tx-bui-filter-chips__label {
  white-space: nowrap;
}

.tx-bui-filter-chips__count {
  padding: 0 4px;
  border-radius: 4px;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.tx-bui-filter-chips__chip.is-active .tx-bui-filter-chips__count {
  color: var(--tx-bui-ink-2, #62656b);
  background: var(--tx-bui-field, #f2f2f3);
}
</style>
