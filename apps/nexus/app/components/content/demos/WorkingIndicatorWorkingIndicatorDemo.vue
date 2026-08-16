<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return { label: '正在搅拌', restart: '重新计时' }
  }

  return { label: 'Churning', restart: 'Restart clock' }
})

// A wall-clock origin rather than a mount-relative counter: remounting the row
// (or re-rendering it mid-stream) must not reset the elapsed reading.
const startedAt = ref(Date.now())
</script>

<template>
  <div class="flex flex-col gap-4">
    <button
      type="button"
      class="self-start rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
      @click="startedAt = Date.now()"
    >
      {{ copy.restart }}
    </button>

    <TxWorkingIndicator :label="copy.label" :started-at="startedAt" />
  </div>
</template>
