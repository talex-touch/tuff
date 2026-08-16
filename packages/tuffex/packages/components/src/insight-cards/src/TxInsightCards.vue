<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// The pager shell only. The cards themselves are host content: upstream's three
// are a two-series chart, an anomaly chart and an allocation bar, which live in
// tuffex as TxSparkChart / TxChartScrubber / TxAllocationBar and get composed
// through the default slot rather than hard-wired in here.

import type { InsightCardsEmits, InsightCardsProps, InsightPage } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxInsightCards' })

const props = withDefaults(defineProps<InsightCardsProps>(), {
  activeIndex: undefined,
  title: 'Insights',
  showCount: true,
  loop: true,
  previousLabel: 'Previous insight',
  nextLabel: 'Next insight',
})

const emit = defineEmits<InsightCardsEmits>()

defineSlots<{
  /** The card body for the active page. */
  default?: (props: { page: InsightPage, index: number }) => any
  /** Rich lede — mentions, inline stats — replacing `page.prose`. */
  prose?: (props: { page: InsightPage, index: number }) => any
  /** Replaces the follow-up pill. */
  'follow-up'?: (props: { page: InsightPage, index: number }) => any
}>()

const internalIndex = ref(0)
const isControlled = computed(() => props.activeIndex !== undefined)

const index = computed(() => {
  const raw = isControlled.value ? props.activeIndex! : internalIndex.value
  if (props.pages.length === 0)
    return 0
  return Math.min(Math.max(raw, 0), props.pages.length - 1)
})

const page = computed<InsightPage | undefined>(() => props.pages[index.value])
const canGoBack = computed(() => props.loop || index.value > 0)
const canGoForward = computed(() => props.loop || index.value < props.pages.length - 1)

function goTo(next: number): void {
  const total = props.pages.length
  if (total === 0)
    return

  const wrapped = props.loop
    ? ((next % total) + total) % total
    : Math.min(Math.max(next, 0), total - 1)

  if (wrapped === index.value)
    return

  if (!isControlled.value)
    internalIndex.value = wrapped

  emit('update:activeIndex', wrapped)
  const target = props.pages[wrapped]
  if (target)
    emit('change', target, wrapped)
}

function previous(): void {
  goTo(index.value - 1)
}

function next(): void {
  goTo(index.value + 1)
}

function followUp(): void {
  if (page.value)
    emit('followUp', page.value)
}

defineExpose({ previous, next, goTo })
</script>

<template>
  <div class="tx-bui-insight-cards">
    <div class="tx-bui-insight-cards__header">
      <span class="tx-bui-insight-cards__heading">
        <span class="tx-bui-insight-cards__title">{{ title }}</span>
        <span v-if="showCount" class="tx-bui-insight-cards__count">{{ pages.length }}</span>
      </span>
      <span class="tx-bui-insight-cards__pager">
        <button
          type="button"
          class="tx-bui-insight-cards__step"
          :aria-label="previousLabel"
          :disabled="!canGoBack || pages.length === 0"
          @click="previous"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="tx-bui-insight-cards__step"
          :aria-label="nextLabel"
          :disabled="!canGoForward || pages.length === 0"
          @click="next"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </span>
    </div>

    <div v-if="page" class="tx-bui-insight-cards__body">
      <p v-if="$slots.prose || page.prose" class="tx-bui-insight-cards__prose">
        <slot name="prose" :page="page" :index="index">
          {{ page.prose }}
        </slot>
      </p>

      <div class="tx-bui-insight-cards__card">
        <slot :page="page" :index="index" />
      </div>

      <slot name="follow-up" :page="page" :index="index">
        <button
          v-if="page.suggestion"
          type="button"
          class="tx-bui-insight-cards__follow-up"
          @click="followUp"
        >
          {{ page.suggestion }}
        </button>
      </slot>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-insight-cards {
  @include bui-scope;

  width: 100%;
}

.tx-bui-insight-cards__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tx-bui-insight-cards__heading {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.tx-bui-insight-cards__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-insight-cards__count {
  @include bui-tabular-nums;

  font-size: 13px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.tx-bui-insight-cards__pager {
  display: flex;
  gap: 2px;
  align-items: center;
}

.tx-bui-insight-cards__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--tx-bui-ink-3, #9a9da3);
  cursor: pointer;
  border-radius: var(--tx-bui-radius-chip, 6px);
  transition:
    background-color 0.1s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    color 0.1s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.1s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(:disabled) {
    color: var(--tx-bui-ink, #1f2124);
    background: var(--tx-bui-hover, #f4f5f6);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 1px;
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}

.tx-bui-insight-cards__prose {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.625;
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-insight-cards__card {
  margin-top: 8px;
}

.tx-bui-insight-cards__follow-up {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
  text-align: left;
  color: var(--tx-bui-ink, #1f2124);
  cursor: pointer;
  background: var(--tx-bui-surface, #fff);
  border-radius: 999px;
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
  transition: background-color 0.1s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover {
    background: var(--tx-bui-hover, #f4f5f6);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
