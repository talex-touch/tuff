<script setup lang="ts">
import type { AiSuggestion } from '../../ai-elements/src/types'

defineOptions({ name: 'TxSuggestionChips' })

withDefaults(
  defineProps<{
    suggestions: AiSuggestion[]
    /**
     * `list` stacks the follow-ups into rules-separated rows instead of a
     * scrolling chip row — the shape a settled answer ends on.
     * @default 'wrap'
     */
    layout?: 'wrap' | 'list'
  }>(),
  {
    layout: 'wrap',
  },
)

const emit = defineEmits<{
  select: [suggestion: AiSuggestion]
}>()

// The template branches on `layout` at the row level rather than rendering one
// row with a conditional glyph inside it. A `v-if` within the row would leave a
// placeholder comment and stray whitespace in the default row, whose markup is
// a contract that predates this layout.
</script>

<template>
  <div
    v-if="suggestions.length > 0"
    class="tx-suggestion-chips"
    :class="{ 'is-list': layout === 'list' }"
    role="list"
  >
    <template v-for="(suggestion, index) in suggestions" :key="suggestion.id">
      <button
        v-if="layout === 'list'"
        type="button"
        class="tx-suggestion-chips__chip"
        role="listitem"
        :style="{ '--tx-suggestion-chips-index': index }"
        @click="emit('select', suggestion)"
      >
        <span class="tx-suggestion-chips__glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 10l-5 5 5 5" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
        </span>
        {{ suggestion.text }}
      </button>
      <button
        v-else
        type="button"
        class="tx-suggestion-chips__chip"
        role="listitem"
        @click="emit('select', suggestion)"
      >
        {{ suggestion.text }}
      </button>
    </template>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;

.tx-suggestion-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px;
  // Fade both edges so overflow reads as scrollable, not clipped.
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .tx-suggestion-chips__chip {
    flex: none;
    padding: 6px 13px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 999px;
    background: var(--tx-fill-color-blank, #fff);
    color: var(--tx-text-color-primary, #111827);
    font: inherit;
    font-size: 12.5px;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
      border-color: var(--tx-color-primary, #409eff);
      background: color-mix(in srgb, var(--tx-color-primary, #409eff) 5%, transparent);
    }
  }

  // Stacked follow-ups: rules instead of outlines, and each row arrives a beat
  // after the one above it.
  &.is-list {
    flex-direction: column;
    gap: 0;
    padding: 0;
    overflow-x: visible;
    -webkit-mask-image: none;
    mask-image: none;

    .tx-suggestion-chips__chip {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: initial;
      padding: 6px;
      border: 0;
      border-bottom: 1px solid var(--tx-border-color-lighter, #e5e7eb);
      border-radius: 7px;
      background: transparent;
      font-size: 12.5px;
      text-align: left;
      white-space: normal;
      animation: tx-bui-fade-up 350ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))
        calc(var(--tx-suggestion-chips-index, 0) * 90ms) both;

      &:hover {
        border-color: var(--tx-border-color-lighter, #e5e7eb);
        background: var(--tx-fill-color-light, #f5f7fa);
      }
    }

    .tx-suggestion-chips__glyph {
      display: flex;
      flex: none;
      color: var(--tx-text-color-secondary, #6b7280);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-suggestion-chips.is-list .tx-suggestion-chips__chip {
    animation: none;
  }
}
</style>
