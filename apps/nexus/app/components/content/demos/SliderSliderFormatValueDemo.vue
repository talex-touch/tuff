<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const formatValue = ref('')
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxSlider
          v-model="value"
          :min="0"
          :max="100"
          show-value
          :format-value="formatValue"
        />
      </div>
  </div>
  <div v-else>
      <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxSlider
          v-model="value"
          :min="0"
          :max="100"
          show-value
          :format-value="formatValue"
        />
      </div>
  </div>
</template>
