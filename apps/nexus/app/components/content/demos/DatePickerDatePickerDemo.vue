<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
const visible = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton variant="primary" @click="visible = true">
            Open date picker
          </TxButton>
          <div style="color: var(--tx-text-color-secondary);">
            Value: {{ value }}
          </div>
        </div>

        <TxDatePicker
          v-model="value"
          v-model:visible="visible"
          title="Date"
          min="2025-01-01"
          max="2030-12-31"
        />
      </div>
  </div>
  <div v-else>
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton variant="primary" @click="visible = true">
            Open date picker
          </TxButton>
          <div style="color: var(--tx-text-color-secondary);">
            Value: {{ value }}
          </div>
        </div>

        <TxDatePicker
          v-model="value"
          v-model:visible="visible"
          title="Date"
          min="2025-01-01"
          max="2030-12-31"
        />
      </div>
  </div>
</template>
