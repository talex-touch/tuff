<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const options = ref([])
const value1 = ref('')
const value2 = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px; width: 520px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxCascader v-model="value1" :options="options" placeholder="Single" />
          <TxCascader v-model="value2" :options="options" multiple placeholder="Multiple" />
        </div>

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          single: {{ value1 }}
        </div>
        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          multiple: {{ value2 }}
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px; width: 520px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxCascader v-model="value1" :options="options" placeholder="Single" />
          <TxCascader v-model="value2" :options="options" multiple placeholder="Multiple" />
        </div>

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          single: {{ value1 }}
        </div>
        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          multiple: {{ value2 }}
        </div>
      </div>
  </div>
</template>
