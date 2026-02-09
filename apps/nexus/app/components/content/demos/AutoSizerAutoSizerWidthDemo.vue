<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const loading = ref(false)
const toggle = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxButton @click="toggle">
          Toggle loading
        </TxButton>

        <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
          <TxButton :loading="loading" variant="primary">
            Submit
          </TxButton>
        </TxAutoSizer>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxButton @click="toggle">
          Toggle loading
        </TxButton>

        <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
          <TxButton :loading="loading" variant="primary">
            Submit
          </TxButton>
        </TxAutoSizer>
      </div>
  </div>
</template>
