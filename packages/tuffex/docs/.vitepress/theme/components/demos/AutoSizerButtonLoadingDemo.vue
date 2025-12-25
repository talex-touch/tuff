<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
const sizerRef = ref<any>(null)

function toggle() {
  void sizerRef.value?.action?.(() => {
    loading.value = !loading.value
  })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <TxButton @click="toggle">Toggle loading</TxButton>

    <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
      <TxButton :loading="loading" variant="primary">Submit</TxButton>
    </TxAutoSizer>
  </div>
</template>
