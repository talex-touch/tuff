<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
const last = ref('')
const onSearch = (next: string) => {
  last.value = next
}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
        <TxSearchInput
          v-model="value"
          placeholder="Search anything"
          @search="onSearch"
        />

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          value: {{ value }}
        </div>
        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          last search: {{ last }}
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
        <TxSearchInput
          v-model="value"
          placeholder="Search anything"
          @search="onSearch"
        />

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          value: {{ value }}
        </div>
        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          last search: {{ last }}
        </div>
      </div>
  </div>
</template>
