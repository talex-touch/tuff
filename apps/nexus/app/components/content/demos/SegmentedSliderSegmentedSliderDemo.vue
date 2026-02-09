<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const segments = ref('')
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 16px; width: 400px;">
        <div>
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
            当前值: {{ value }}
          </div>
          <TxSegmentedSlider v-model="value" :segments="segments" />
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 16px; width: 400px;">
        <div>
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
            当前值: {{ value }}
          </div>
          <TxSegmentedSlider v-model="value" :segments="segments" />
        </div>
      </div>
  </div>
</template>
