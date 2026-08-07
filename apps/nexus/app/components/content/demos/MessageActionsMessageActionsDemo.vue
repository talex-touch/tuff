<script setup lang="ts">
import { ref } from 'vue'

const ANSWER = 'Sorting dominates at O(n log n), so the reduce is not the bottleneck.'

const log = ref<string[]>([])

function onCopy(text: string) {
  log.value = [`copy: ${text.slice(0, 24)}…`, ...log.value].slice(0, 3)
}

function onRegenerate() {
  log.value = ['regenerate', ...log.value].slice(0, 3)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-[var(--tx-text-color-primary)]">
      {{ ANSWER }}
    </p>

    <!-- The Share button lives in the default slot and joins the same arrow-key
         roving order as the built-in controls. -->
    <TxMessageActions
      :copy-text="ANSWER"
      regenerable
      @copy="onCopy"
      @regenerate="onRegenerate"
    >
      <button type="button" class="rounded-lg px-2 py-1 text-sm">
        Share
      </button>
    </TxMessageActions>

    <ul v-if="log.length" class="text-sm text-[var(--tx-text-color-secondary)]">
      <li v-for="(entry, index) in log" :key="index">
        {{ entry }}
      </li>
    </ul>
    <p v-else class="text-sm text-[var(--tx-text-color-secondary)]">
      Tab to the bar, then use the arrow keys.
    </p>
  </div>
</template>
