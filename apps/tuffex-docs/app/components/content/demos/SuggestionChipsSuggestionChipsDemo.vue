<script setup lang="ts">
import { ref } from 'vue'

interface Suggestion {
  id: string
  text: string
}

const suggestions = ref<Suggestion[]>([
  { id: 'explain', text: 'Explain this code' },
  { id: 'test', text: 'Add unit tests' },
  { id: 'perf', text: 'Any room to optimise?' },
  { id: 'edge', text: 'What edge cases am I missing?' },
])

const lastSelected = ref<Suggestion | null>(null)

function handleSelect(suggestion: Suggestion) {
  lastSelected.value = suggestion
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <TxSuggestionChips :suggestions="suggestions" @select="handleSelect" />
    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="lastSelected">
        Selected: <code>{{ lastSelected.id }}</code> — {{ lastSelected.text }}
      </template>
      <template v-else>
        Pick a suggestion to see the emitted payload.
      </template>
    </p>
  </div>
</template>
