<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { FilterChipItem, FilterChipsEmits, FilterChipsProps, FilterChipsRole, FilterChipValue } from './types'
import type { PropType } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'TxFilterChips' })

// Declared as a runtime object rather than `defineProps<FilterChipsProps>()`, on purpose.
// A type-only declaration is resolved from `types.ts` when the SFC compiles, and the dev
// server's Vue plugin does not recompile this file when *that* file changes — so a prop added
// to the interface shipped as an unknown attribute here until the SFC itself was touched, and
// `iconOnly` fell through as `false` on every render while vitest (a cold compile) passed.
// Listing the props here keeps the declaration inside the file the compiler watches; the
// interface stays the public type and the `satisfies` keeps the two from drifting.
const props = defineProps({
  modelValue: { type: [String, Number] as PropType<FilterChipValue>, default: undefined },
  items: { type: Array as PropType<FilterChipItem[]>, default: () => [] },
  disabled: { type: Boolean, default: false },
  role: { type: String as PropType<FilterChipsRole>, default: 'toolbar' },
  indicator: { type: Boolean, default: true },
  iconOnly: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Filters' },
} satisfies Record<keyof FilterChipsProps, unknown>)

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

/** Only a chip that has a glyph may hide its words. */
function showsIconOnly(item: FilterChipItem): boolean {
  return props.iconOnly && Boolean(item.iconClass)
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

/* ─── active-fill indicator ─── */

const rootRef = ref<HTMLElement | null>(null)
const geometry = ref<{ x: number, y: number, width: number, height: number } | null>(null)
// Suppresses the transition while a position is written that must not be
// travelled to: the first paint, a re-measure after the chips were rebuilt, a
// resize. Without it the fill would slide in from the row's left edge every
// time the panel opens.
const placing = ref(true)
let placingFrame = 0

/**
 * The chip's own offsets, not a `getBoundingClientRect`: the row scrolls
 * horizontally, and the indicator is an absolutely positioned child of it, so
 * it lives in the same scrolled coordinate space as the chips and must be
 * measured in it. Viewport coordinates would drift the moment the row scrolls.
 */
function place(animate: boolean): void {
  const chip = props.indicator && activeIndex.value >= 0 ? chipRefs.value[activeIndex.value] : null
  if (!chip) {
    // No fill to move rather than a fill flying to index 0 and back.
    geometry.value = null
    return
  }

  if (!animate) {
    placing.value = true
    if (typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(placingFrame)
  }

  geometry.value = {
    x: chip.offsetLeft,
    y: chip.offsetTop,
    width: chip.offsetWidth,
    height: chip.offsetHeight,
  }

  if (!animate) {
    // `is-placing` may only come off once the browser has *committed* the new
    // box. Vue flushes the style binding after this function returns, so a
    // single rAF from here can land in the same frame as that write and re-arm
    // the transition while the width is still tweening up from 0 — the fill
    // then paints 0-wide on every open. Wait for the DOM write, force the style
    // recalc, and lift the guard one frame after that.
    void nextTick(() => {
      void rootRef.value?.offsetWidth
      if (typeof requestAnimationFrame === 'undefined')
        placing.value = false
      else
        placingFrame = requestAnimationFrame(() => (placing.value = false))
    })
  }
}

const indicatorVars = computed(() => {
  const box = geometry.value
  if (!box)
    return undefined
  return {
    '--tx-bui-filter-chips-indicator-x': `${box.x}px`,
    '--tx-bui-filter-chips-indicator-y': `${box.y}px`,
    '--tx-bui-filter-chips-indicator-w': `${box.width}px`,
    '--tx-bui-filter-chips-indicator-h': `${box.height}px`,
  }
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  void nextTick(() => place(false))

  // Chips change width after a webfont lands and when the row is resized; the
  // fill has to follow without travelling there.
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => place(false))
    resizeObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (typeof cancelAnimationFrame !== 'undefined')
    cancelAnimationFrame(placingFrame)
})

// A selection travels; a rebuilt chip list does not — the host refetching its
// options must not read as the user having picked something.
watch(() => props.modelValue, () => void nextTick(() => place(true)))
watch(() => props.items, () => void nextTick(() => place(false)))
watch(() => props.indicator, () => void nextTick(() => place(false)))

</script>

<template>
  <div
    ref="rootRef"
    class="tx-bui-filter-chips"
    :class="{ 'is-sliding': indicator, 'is-placing': placing }"
    :style="indicatorVars"
    :role="role"
    :aria-label="ariaLabel"
    :aria-orientation="role === 'tablist' ? 'horizontal' : undefined"
  >
    <span
      v-if="indicator && geometry"
      class="tx-bui-filter-chips__indicator"
      aria-hidden="true"
    />
    <button
      v-for="(item, index) in items"
      :key="item.value"
      :ref="el => setChipRef(el as Element | null, index)"
      type="button"
      class="tx-bui-filter-chips__chip"
      :class="{ 'is-active': isActive(item), 'is-disabled': isDisabled(item), 'is-icon-only': showsIconOnly(item) }"
      :role="role === 'tablist' ? 'tab' : undefined"
      :aria-pressed="role === 'tablist' ? undefined : isActive(item)"
      :aria-selected="role === 'tablist' ? isActive(item) : undefined"
      :aria-label="showsIconOnly(item) ? item.label : undefined"
      :title="showsIconOnly(item) ? item.label : undefined"
      :disabled="isDisabled(item)"
      :tabindex="index === rovingIndex ? 0 : -1"
      @click="select(item)"
      @keydown="onKeydown($event, index)"
    >
      <slot name="chip" :item="item" :active="isActive(item)">
        <i
          v-if="item.iconClass"
          class="tx-bui-filter-chips__icon"
          :class="item.iconClass"
          aria-hidden="true"
        />
        <span
          v-if="item.dot"
          class="tx-bui-filter-chips__dot"
          aria-hidden="true"
          :style="{ background: item.dot }"
        />
        <span v-if="!showsIconOnly(item)" class="tx-bui-filter-chips__label">{{ item.label }}</span>
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
  position: relative;
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

/*
  The active chip's fill, drawn once and moved, rather than painted on whichever
  chip happens to be active. It is a child of the scrolling row on purpose: an
  absolutely positioned child scrolls with its scroll container's content, which
  is exactly what keeps the fill under its chip while the row scrolls sideways.

  Resting appearance is the chip's former `.is-active` fill, unchanged — only
  the travel between two chips is new.
*/
.tx-bui-filter-chips__indicator {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--tx-bui-filter-chips-indicator-w, 0);
  height: var(--tx-bui-filter-chips-indicator-h, 0);
  border-radius: 999px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
  transform: translate(
    var(--tx-bui-filter-chips-indicator-x, 0),
    var(--tx-bui-filter-chips-indicator-y, 0)
  );
  pointer-events: none;
  transition:
    transform 0.24s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    width 0.24s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  // A position that must not be travelled to: first paint, a rebuilt chip list,
  // a resize.
  .tx-bui-filter-chips.is-placing & {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-filter-chips__chip {  display: inline-flex;
  position: relative;
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

  // With the indicator on, the fill belongs to it alone. Leaving it on the chip
  // too would hold the outgoing chip lit while the indicator slid away from it.
  .tx-bui-filter-chips.is-sliding &.is-active {
    background: transparent;
    box-shadow: none;
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

/*
  Sized off the chip's own font so it tracks the label rather than a fixed px
  ladder, and held at 1em square: an icon class that failed to load would
  otherwise collapse the glyph to nothing and leave the chip looking like it had
  a stray leading space.
*/
.tx-bui-filter-chips__icon {
  flex: 0 0 auto;
  width: 1.15em;
  height: 1.15em;
  font-size: 1.15em;
  line-height: 1;
}

/*
  A glyph alone in a 26px pill: square it up. Pill padding was sized to hold a
  word and would leave a lone icon swimming in a wide oval; a fixed 30px slot
  keeps every icon-only chip the same width, so the sliding fill has a steady
  shape to travel between.
*/
.tx-bui-filter-chips__chip.is-icon-only {
  width: 30px;
  padding: 0;
  justify-content: center;
  font-size: 15px;
}

// The scope mixin resets `button { padding: 0 }` under the root, and that
// compound selector outranks the bare class above, so a chip rendered with its
// label flush against the pill edge. Only the padding needs the extra weight —
// lifting the whole rule would also rewrite the parent of every `&` nested
// inside it.
.tx-bui-filter-chips .tx-bui-filter-chips__chip {
  padding: 0 10px;
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
