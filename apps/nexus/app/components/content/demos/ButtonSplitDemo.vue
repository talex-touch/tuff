<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)

async function handleRun() {
  if (loading.value)
    return
  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 1200))
  loading.value = false
}
</script>

<template>
  <div class="tuff-demo-row">
    <TxSplitButton
      variant="primary"
      size="sm"
      icon="i-ri-play-fill"
      :loading="loading"
      @click="handleRun"
    >
      RUN
      <template #menu="{ close }">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <TxButton size="sm" plain block icon="i-ri-settings-3-line" @click="close()">
            Settings
          </TxButton>
          <TxButton size="sm" plain block icon="i-ri-folder-open-line" @click="close()">
            Open Folder
          </TxButton>
        </div>
      </template>
    </TxSplitButton>
  </div>
</template>
