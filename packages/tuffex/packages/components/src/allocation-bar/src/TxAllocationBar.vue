<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AllocationBarEmits, AllocationBarProps, AllocationSegment } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxAllocationBar' })

const props = withDefaults(defineProps<AllocationBarProps>(), {
  modelValue: undefined,
  legend: true,
  detail: false,
  ariaLabel: 'Allocation segments',
  percentFormatter: undefined,
})

const emit = defineEmits<AllocationBarEmits>()

// The track spends this pair of pixels — 2px of inner padding and a 2px gap
// between neighbours. The shares are carved out of the gap budget, so the
// separators never rewrite the data (see `widthOf`).
const TRACK_GAP = 2

// Upstream colours the hero share and leaves the remainder in receding greys;
// a host that has real category colours passes `color` per segment. The greys
// are the neutral ink ramp — `--tx-bui-line` / `--tx-bui-line-strong` sit within
// ΔRGB 5–18 of the track's `--tx-bui-field` and vanish in both themes, while
// ink→ink-2→ink-3 recede by ≥56 per channel and hold ≥2.4:1 against the track.
const FALLBACK_COLORS = [
  'var(--tx-bui-accent, #0285ff)',
  'var(--tx-bui-ink, #1f2124)',
  'var(--tx-bui-ink-2, #62656b)',
  'var(--tx-bui-ink-3, #9a9da3)',
] as const

const activeKey = computed(() => props.modelValue ?? props.segments[0]?.key)
const activeIndex = computed(() => {
  const index = props.segments.findIndex(segment => segment.key === activeKey.value)
  return index === -1 ? 0 : index
})
const activeSegment = computed(() => props.segments[activeIndex.value])
const activeColor = computed(() =>
  activeSegment.value ? colorOf(activeSegment.value, activeIndex.value) : undefined,
)
const totalGap = computed(() => Math.max(0, props.segments.length - 1) * TRACK_GAP)

const control = ref<HTMLElement | null>(null)

function colorOf(segment: AllocationSegment, index: number): string {
  return segment.color ?? FALLBACK_COLORS[Math.min(index, FALLBACK_COLORS.length - 1)]!
}

/**
 * A share is a share of the width *left over*: the fixed gap budget is split
 * between the segments in proportion to their percentages and subtracted from
 * each width (`calc(percent% - its slice)`). The rendered widths therefore stay
 * exactly proportional to `percent` — the gaps cost layout space without eating
 * into any share, and flex has nothing left to shrink.
 */
function widthOf(percent: number): string {
  const gapShare = totalGap.value * (percent / 100)
  return gapShare === 0 ? `${percent}%` : `calc(${percent}% - ${+gapShare.toFixed(4)}px)`
}

function formatPercent(percent: number): string {
  return props.percentFormatter ? props.percentFormatter(percent) : `${percent}%`
}

function select(segment: AllocationSegment): void {
  if (segment.key === activeKey.value)
    return
  emit('update:modelValue', segment.key)
  emit('change', segment)
}

/**
 * Arrow keys move within the set that has focus, carrying the selection — the
 * radiogroup contract. The value stays controlled: this only emits.
 */
function onArrowKey(event: KeyboardEvent, index: number, set: 'segment' | 'chip'): void {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : 0
  if (step === 0 || props.segments.length === 0)
    return

  event.preventDefault()
  const count = props.segments.length
  const next = (index + step + count) % count
  control.value
    ?.querySelector<HTMLElement>(`[data-tx-set="${set}"][data-tx-index="${next}"]`)
    ?.focus()

  const segment = props.segments[next]
  if (segment)
    select(segment)
}
</script>

<template>
  <div class="tx-bui-allocation-bar">
    <div
      ref="control"
      class="tx-bui-allocation-bar__control"
      role="radiogroup"
      :aria-label="ariaLabel"
    >
      <div class="tx-bui-allocation-bar__track">
        <button
          v-for="(segment, index) in segments"
          :key="segment.key"
          type="button"
          role="radio"
          class="tx-bui-allocation-bar__segment"
          :class="{ 'is-active': segment.key === activeKey }"
          :style="{ width: widthOf(segment.percent), background: colorOf(segment, index) }"
          :aria-checked="segment.key === activeKey"
          :aria-label="`${segment.label}: ${formatPercent(segment.percent)}`"
          :tabindex="segment.key === activeKey ? 0 : -1"
          data-tx-set="segment"
          :data-tx-index="index"
          @click="select(segment)"
          @keydown="onArrowKey($event, index, 'segment')"
        >
          <span class="tx-bui-allocation-bar__sheen" aria-hidden="true" />
        </button>
      </div>

      <div v-if="legend" class="tx-bui-allocation-bar__legend">
        <button
          v-for="(segment, index) in segments"
          :key="segment.key"
          type="button"
          role="radio"
          class="tx-bui-allocation-bar__chip"
          :class="{ 'is-active': segment.key === activeKey }"
          :aria-checked="segment.key === activeKey"
          :tabindex="segment.key === activeKey ? 0 : -1"
          data-tx-set="chip"
          :data-tx-index="index"
          @click="select(segment)"
          @keydown="onArrowKey($event, index, 'chip')"
        >
          <span
            class="tx-bui-allocation-bar__dot"
            aria-hidden="true"
            :style="{ background: colorOf(segment, index) }"
          />
          {{ segment.short ?? segment.label }}
          <span class="tx-bui-allocation-bar__percent">{{ formatPercent(segment.percent) }}</span>
        </button>
      </div>
    </div>

    <div v-if="detail && activeSegment" class="tx-bui-allocation-bar__detail">
      <span
        class="tx-bui-allocation-bar__detail-label"
        :style="{ color: activeColor }"
      >{{ activeSegment.label }}</span>
      <span v-if="activeSegment.description" class="tx-bui-allocation-bar__detail-body">
        {{ activeSegment.description }}
      </span>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

// Upstream drives this card with `--ease-link`, not the family's usual
// `--ease-out-strong`: the segments settle rather than snap. No tuffex token
// carries that curve, so it stays a literal here.
$allocation-ease: cubic-bezier(0.16, 1, 0.3, 1);

.tx-bui-allocation-bar {
  @include bui-scope;

  display: flex;
  flex-direction: column;
}

.tx-bui-allocation-bar__control {
  display: flex;
  flex-direction: column;
}

.tx-bui-allocation-bar__track {
  display: flex;
  gap: 2px;
  height: 36px;
  padding: 2px;
  overflow: hidden;
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: 999px;
}

.tx-bui-allocation-bar__segment {
  position: relative;
  height: 100%;
  overflow: hidden;
  cursor: pointer;
  border-radius: 999px;
  opacity: 0.58;
  transition:
    opacity 0.3s $allocation-ease,
    box-shadow 0.3s $allocation-ease,
    transform 0.3s $allocation-ease;

  &.is-active {
    opacity: 1;
    // Inner rim, not an outer ring: the segment sits inside a pill track and an
    // outer ring would collide with its neighbour's edge.
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 22%);
  }

  &:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }
}

.tx-bui-allocation-bar__sheen {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 0;
  background: rgb(255 255 255 / 20%);
  border-radius: 999px;
  opacity: 0;
  transition:
    width 0.5s $allocation-ease,
    opacity 0.5s $allocation-ease;

  .tx-bui-allocation-bar__segment.is-active & {
    width: calc(100% - 8px);
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-allocation-bar__legend {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.tx-bui-allocation-bar__chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  color: var(--tx-bui-ink-2, #62656b);
  cursor: pointer;
  border-radius: 999px;
  transition:
    background-color 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    color 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(.is-active) {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-hover, #f4f5f6);
  }

  &.is-active {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-field, #f2f2f3);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 1px;
  }

  &:active {
    transform: scale(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }
}

.tx-bui-allocation-bar__dot {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
}

.tx-bui-allocation-bar__percent {
  @include bui-tabular-nums;
}

.tx-bui-allocation-bar__detail {
  min-height: 64px;
  padding: 8px 10px;
  margin-top: 12px;
  background: var(--tx-bui-inset, #f7f8f9);
  border-radius: var(--tx-bui-radius-control, 8px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.tx-bui-allocation-bar__detail-label {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-allocation-bar__detail-body {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--tx-bui-ink-3, #9a9da3);
}
</style>
