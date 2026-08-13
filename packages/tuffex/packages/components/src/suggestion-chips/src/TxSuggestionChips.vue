<script setup lang="ts">
import type { AiSuggestion } from '../../ai-elements/src/types'

defineOptions({ name: 'TxSuggestionChips' })

withDefaults(
  defineProps<{
    suggestions: AiSuggestion[]
  }>(),
  {},
)

const emit = defineEmits<{
  select: [suggestion: AiSuggestion]
}>()
</script>

<template>
  <div v-if="suggestions.length > 0" class="tx-suggestion-chips" role="list">
    <button
      v-for="suggestion in suggestions"
      :key="suggestion.id"
      type="button"
      class="tx-suggestion-chips__chip"
      role="listitem"
      @click="emit('select', suggestion)"
    >
      {{ suggestion.text }}
    </button>
  </div>
</template>

<style lang="scss">
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
}
</style>
