<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const options = ref([])
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 10px; width: 320px;">
        <TxSearchSelect v-model="value" :options="options" placeholder="Search and pick" />
        <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
          Value: {{ value }}
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 10px; width: 320px;">
        <TxSearchSelect v-model="value" :options="options" placeholder="Search and pick" />
        <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
          Value: {{ value }}
        </div>
      </div>
  </div>
</template>
