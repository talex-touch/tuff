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
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px;

  .tx-suggestion-chips__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    max-width: 100%;
    padding: 6px 12px;
    border: 0;
    border-radius: var(--tx-button-radius, 10px);
    background: var(--tx-fill-color-light, #f5f7fa);
    box-shadow:
      inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
      var(--tx-elevation-1, 0 1px 2px rgba(0, 0, 0, 0.04));
    color: var(--tx-text-color-primary, #303133);
    font: inherit;
    font-size: 12.5px;
    font-weight: var(--tx-font-weight-medium, 500);
    line-height: 18px;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, var(--tx-fill-color-light, #f5f7fa));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 44%, transparent);
      color: var(--tx-color-primary, #409eff);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary, #409eff);
      outline-offset: 2px;
    }
  }

  // Stacked follow-ups: crisp hairline separators with badged return glyph so
  // interactive prompt actions share TuffEx's accent grammar without resembling inline links.
  &.is-list {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 2px;
    padding: 0;

    .tx-suggestion-chips__chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 9px;
      flex: initial;
      padding: 7px 9px;
      border-radius: var(--tx-button-radius, 10px);
      background: transparent;
      box-shadow: none;
      font-size: 12.5px;
      font-weight: var(--tx-font-weight-medium, 500);
      line-height: 18px;
      text-align: left;
      white-space: normal;
      animation: tx-bui-fade-up 350ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))
        calc(var(--tx-suggestion-chips-index, 0) * 90ms) both;

      & + .tx-suggestion-chips__chip::before {
        content: '';
        position: absolute;
        top: -1px;
        left: 9px;
        right: 9px;
        height: 1px;
        background: var(--tx-border-color-lighter, #ebeef5);
        pointer-events: none;
      }

      &:hover {
        background: color-mix(in srgb, var(--tx-color-primary, #409eff) 9%, var(--tx-fill-color-light, #f5f7fa));
        box-shadow: none;
        color: var(--tx-text-color-primary, #303133);

        &::before,
        & + .tx-suggestion-chips__chip::before {
          opacity: 0;
        }

        .tx-suggestion-chips__glyph {
          background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 32%, transparent);
          color: var(--tx-color-primary, #409eff);
        }
      }
    }

    .tx-suggestion-chips__glyph {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      background: var(--tx-fill-color-light, #f5f7fa);
      box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
      color: var(--tx-text-color-regular, #606266);
    }
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-suggestion-chips .tx-suggestion-chips__chip {
    transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:active {
      transform: scale(0.985);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-suggestion-chips.is-list .tx-suggestion-chips__chip {
    animation: none;
  }
}
</style>
