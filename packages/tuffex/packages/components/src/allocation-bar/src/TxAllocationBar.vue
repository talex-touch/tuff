<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AllocationBarEmits, AllocationBarProps, AllocationSegment } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxAllocationBar' })

const props = withDefaults(defineProps<AllocationBarProps>(), {
  modelValue: undefined,
  legend: true,
  detail: false,
  ariaLabel: 'Allocation segments',
  percentFormatter: undefined,
})

const emit = defineEmits<AllocationBarEmits>()

// Upstream colours the hero share and leaves the remainder in receding greys;
// a host that has real category colours passes `color` per segment.
const FALLBACK_COLORS = [
  'var(--tx-bui-accent, #0285ff)',
  'var(--tx-bui-line-strong, #e0e2e5)',
  'var(--tx-bui-line, #ecedef)',
] as const

const activeKey = computed(() => props.modelValue ?? props.segments[0]?.key)
const activeSegment = computed(() =>
  props.segments.find(segment => segment.key === activeKey.value) ?? props.segments[0],
)

function colorOf(segment: AllocationSegment, index: number): string {
  return segment.color ?? FALLBACK_COLORS[Math.min(index, FALLBACK_COLORS.length - 1)]!
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
</script>

<template>
  <div class="tx-bui-allocation-bar">
    <div class="tx-bui-allocation-bar__track" role="group" :aria-label="ariaLabel">
      <button
        v-for="(segment, index) in segments"
        :key="segment.key"
        type="button"
        class="tx-bui-allocation-bar__segment"
        :class="{ 'is-active': segment.key === activeKey }"
        :style="{ width: `${segment.percent}%`, background: colorOf(segment, index) }"
        :aria-pressed="segment.key === activeKey"
        :aria-label="`${segment.label}: ${formatPercent(segment.percent)}`"
        @click="select(segment)"
      >
        <span class="tx-bui-allocation-bar__sheen" aria-hidden="true" />
      </button>
    </div>

    <div v-if="legend" class="tx-bui-allocation-bar__legend">
      <button
        v-for="(segment, index) in segments"
        :key="segment.key"
        type="button"
        class="tx-bui-allocation-bar__chip"
        :class="{ 'is-active': segment.key === activeKey }"
        :aria-pressed="segment.key === activeKey"
        @click="select(segment)"
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

    <div v-if="detail && activeSegment" class="tx-bui-allocation-bar__detail">
      <span
        class="tx-bui-allocation-bar__detail-label"
        :style="{ color: activeSegment.color }"
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
