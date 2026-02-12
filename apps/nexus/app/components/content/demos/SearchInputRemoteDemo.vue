<script setup lang="ts">
import { ref } from 'vue'

const value = ref('')
const loading = ref(false)
const hits = ref<string[]>([])
const open = ref(false)

async function onSearch(q: string) {
  const query = q.trim().toLowerCase()
  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 200))
  hits.value = Array.from({ length: 12 })
    .map((_, i) => `Result ${i + 1}`)
    .filter(s => s.toLowerCase().includes(query))
  loading.value = false
  open.value = true
}

function onPick(h: string) {
  value.value = h
  open.value = false
}
</script>

<template>
  <div style="width: 320px;">
    <TxPopover v-model="open" :offset="6" :close-on-click-outside="true" :reference-full-width="true">
      <template #reference>
        <TxSearchInput
          v-model="value"
          remote
          :search-debounce="250"
          placeholder="Type to remote-search"
          @focus="open = true"
          @search="onSearch"
        />
      </template>

      <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="10">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
            <span v-if="loading">Loading...</span>
            <span v-else>Hits: {{ hits.length }}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto;">
            <TxButton v-for="h in hits" :key="h" variant="bare" size="small" block native-type="button" style="justify-content: flex-start;" @click="onPick(h)">
              {{ h }}
            </TxButton>

            <div v-if="!loading && value.trim() && !hits.length" style="color: var(--tx-text-color-secondary, #909399); font-size: 12px; padding: 6px 2px;">
              No results
            </div>
          </div>
        </div>
      </TxCard>
    </TxPopover>
  </div>
</template>
