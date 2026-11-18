<script setup lang="ts">
import type { TxAiSuggestionProps } from '../../types'

defineOptions({
  name: 'TxAiSuggestion',
})

withDefaults(defineProps<TxAiSuggestionProps>(), {
  tone: 'neutral',
  variant: 'chip',
  size: 'md',
  disabled: false,
  active: false,
})

const emit = defineEmits<{
  (e: 'select', text: string): void
}>()
</script>

<template>
  <button
    type="button"
    class="tx-ai-suggestion"
    :class="[
      `tx-ai-suggestion--${variant}`,
      `tx-ai-suggestion--${size}`,
      `tx-ai-suggestion--tone-${tone}`,
      { 'is-active': active },
    ]"
    :disabled="disabled"
    :aria-pressed="active ? 'true' : undefined"
    @click="emit('select', text)"
  >
    <slot name="icon">
      <span v-if="icon" :class="icon" class="tx-ai-suggestion__icon" aria-hidden="true" />
    </slot>
    <span class="tx-ai-suggestion__content">
      <span class="tx-ai-suggestion__title">
        <slot>{{ text }}</slot>
      </span>
      <span v-if="description" class="tx-ai-suggestion__desc">
        {{ description }}
      </span>
    </span>
  </button>
</template>
