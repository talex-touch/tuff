<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const loading = ref(false)
const options = ref([])
const value = ref('')
const onSearch = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
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
  </div>
  <div v-else>
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
  </div>
</template>
