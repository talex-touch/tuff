<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxSlider v-model="value" :min="0" :max="100" :step="1" />
        <div style="margin-top: 8px; color: var(--tx-text-color-secondary);">
          Value: {{ value }}
        </div>
      </div>
  </div>
  <div v-else>
      <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxSlider v-model="value" :min="0" :max="100" :step="1" />
        <div style="margin-top: 8px; color: var(--tx-text-color-secondary);">
          Value: {{ value }}
        </div>
      </div>
  </div>
</template>
