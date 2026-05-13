<script setup lang="ts">
import type { TxAiSuggestionProps } from '../../types'

defineOptions({
  name: 'TxAiSuggestion',
})

withDefaults(defineProps<TxAiSuggestionProps>(), {
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
    :class="{ 'is-active': active }"
    :disabled="disabled"
    @click="emit('select', text)"
  >
    <slot>{{ text }}</slot>
  </button>
</template>
