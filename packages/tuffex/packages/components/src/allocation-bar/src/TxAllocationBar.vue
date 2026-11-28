<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AllocationBarEmits, AllocationBarProps, AllocationSegment } from './types'
import { computed, ref } from 'vue'
import { usePressScrub } from '../../../../utils/press-scrub'
import { useMorphWindow } from '../../../../utils/use-morph-window'

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
// A selection change eases the chips' fill and ink; a hover repaints at once.
const morphing = useMorphWindow(activeKey, 150)
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

const track = ref<HTMLElement | null>(null)
// A drag across the bar selects the segment under the pointer, as a sweep of clicks
// would; Escape or a cancelled pointer goes back to the segment it started from.
// Keys, not indices, so a parent that rebuilds `segments` mid-drag loses nothing.
let sweep: { origin: string | undefined, current: string | undefined } | null = null
const scrub = usePressScrub(track, {
  read: sweepTo,
  cancel: () => {
    const origin = props.segments.findIndex(segment => segment.key === sweep?.origin)
    if (sweep && origin >= 0)
      selectAndFocus(origin)
  },
  end: () => {
    sweep = null
  },
})
const scrubbing = scrub.dragging

/** The segment nearest the pointer's x: a gap goes to the nearer side, past an end to that end. */
function segmentAt(clientX: number): number {
  let nearest = -1
  let distance = Infinity
  track.value?.querySelectorAll<HTMLElement>('[data-tx-set="segment"]').forEach((element, index) => {
    const rect = element.getBoundingClientRect()
    // A zero share has no width to land on.
    if (rect.width <= 0)
      return
    const gap = Math.max(rect.left - clientX, 0, clientX - rect.right)
    if (gap < distance) {
      distance = gap
      nearest = index
    }
  })
  return nearest
}

function sweepTo(event: PointerEvent): void {
  sweep ??= { origin: activeKey.value, current: activeKey.value }
  const index = segmentAt(event.clientX)
  const segment = props.segments[index]
  // Once per segment crossed, even when no `v-model` echoes the selection back.
  if (!segment || segment.key === sweep.current)
    return
  sweep.current = segment.key
  selectAndFocus(index)
}

/** Selection carries focus, as the arrow keys do, so the keyboard resumes from it. */
function selectAndFocus(index: number): void {
  if (control.value?.contains(document.activeElement)) {
    control.value
      .querySelector<HTMLElement>(`[data-tx-set="segment"][data-tx-index="${index}"]`)
      ?.focus({ preventScroll: true })
  }
  const segment = props.segments[index]
  if (segment)
    select(segment)
}
</script>

<template>
  <div class="tx-bui-allocation-bar" :class="{ 'is-morphing': morphing }">
    <div
      ref="control"
      class="tx-bui-allocation-bar__control"
      role="radiogroup"
      :aria-label="ariaLabel"
    >
      <div
        ref="track"
        class="tx-bui-allocation-bar__track"
        :class="{ 'is-scrubbing': scrubbing }"
        @pointerdown="scrub.pointerdown"
        @pointermove="scrub.pointermove"
        @pointerup="scrub.pointerup"
        @pointercancel="scrub.pointercancel"
        @lostpointercapture="scrub.lostpointercapture"
      >
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
      <div class="tx-bui-allocation-bar__detail-head">
        <span class="tx-bui-allocation-bar__detail-title">
          <span
            class="tx-bui-allocation-bar__detail-dot"
            aria-hidden="true"
            :style="{ background: activeColor }"
          />
          <span
            class="tx-bui-allocation-bar__detail-label"
            :style="{ color: activeColor }"
          >{{ activeSegment.label }}</span>
        </span>
        <span class="tx-bui-allocation-bar__detail-percent">
          {{ formatPercent(activeSegment.percent) }}
        </span>
      </div>
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
  height: 14px;
  padding: 2px;
  // A sideways drag sweeps the selection; a vertical swipe still scrolls the page.
  touch-action: pan-y;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: 7px;
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.tx-bui-allocation-bar__segment {
  position: relative;
  height: 100%;
  padding: 0;
  border: 0;
  overflow: hidden;
  cursor: inherit;
  border-radius: 3px;
  opacity: 0.42;
  transition:
    opacity 0.25s $allocation-ease,
    box-shadow 0.25s $allocation-ease,
    transform 0.25s $allocation-ease;

  &:first-child {
    border-top-left-radius: 5px;
    border-bottom-left-radius: 5px;
  }

  &:last-child {
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
  }

  &:hover:not(.is-active) {
    opacity: 0.72;
  }

  &.is-active {
    opacity: 1;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 24%);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 2px;
    z-index: 1;
  }

  &:active {
    transform: scaleY(0.92);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }

  // The selection follows the pointer 1:1, and the segment pressed first stays
  // `:active` for the whole drag.
  .tx-bui-allocation-bar__track.is-scrubbing & {
    transition: none;

    &:active {
      transform: none;
    }
  }
}

.tx-bui-allocation-bar__sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(255 255 255 / 26%) 0%, rgb(255 255 255 / 0%) 60%);
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.28s $allocation-ease;

  .tx-bui-allocation-bar__segment.is-active & {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  .tx-bui-allocation-bar__track.is-scrubbing & {
    transition: none;
  }
}

.tx-bui-allocation-bar__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 10px;
}

.tx-bui-allocation-bar__chip {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 3px 8px;
  border: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1.3;
  color: var(--tx-bui-ink-2, #62656b);
  cursor: pointer;
  border-radius: 7px;
  transition: transform 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  .tx-bui-allocation-bar.is-morphing & {
    transition:
      background-color 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      color 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      box-shadow 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      transform 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &:hover:not(.is-active) {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-hover, #f4f5f6);
  }

  &.is-active {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-field, #f2f2f3);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 1px;
  }

  &:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }
}

.tx-bui-allocation-bar__dot {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.tx-bui-allocation-bar__percent {
  @include bui-tabular-nums;
}

.tx-bui-allocation-bar__detail {
  padding: 10px 12px;
  margin-top: 10px;
  background: var(--tx-bui-inset, #f7f8f9);
  border-radius: var(--tx-bui-radius-control, 10px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.tx-bui-allocation-bar__detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-bui-allocation-bar__detail-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tx-bui-allocation-bar__detail-dot {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.tx-bui-allocation-bar__detail-label {
  font-size: 12.5px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-allocation-bar__detail-percent {
  @include bui-tabular-nums;
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-allocation-bar__detail-body {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-bui-ink-2, #62656b);
}
</style>
