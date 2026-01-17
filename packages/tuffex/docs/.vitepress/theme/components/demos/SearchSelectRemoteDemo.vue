<script setup lang="ts">
import { ref } from 'vue'

const value = ref<string | number>('')
const query = ref('')
const loading = ref(false)

const options = ref<Array<{ value: string, label: string }>>([])

async function onSearch(q: string) {
  query.value = q
  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 220))

  const base = Array.from({ length: 18 }).map((_, i) => `Result ${i + 1}`)
  const list = base
    .filter(s => s.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 12)

  options.value = list.map(s => ({ value: s, label: s }))
  loading.value = false
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 10px; width: 320px;">
    <TxSearchSelect
      v-model="value"
      remote
      :loading="loading"
      :options="options"
      placeholder="Type to remote-search"
      @search="onSearch"
    />

    <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      Query: {{ query || '-' }}
    </div>
  </div>
</template>
