<script setup lang="ts">
import { ref } from 'vue'

const withPrefix = ref('')
const withSuffix = ref('')
</script>

<template>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; width: 100%; min-width: 0;">
    <TuffInput v-model="withPrefix" style="flex: 1 1 220px;" placeholder="Search">
      <template #prefix>
        <TxIcon name="i-carbon-search" />
      </template>
    </TuffInput>

    <TuffInput v-model="withSuffix" style="flex: 1 1 220px;" placeholder="User">
      <template #suffix>
        <TxIcon name="i-carbon-user" />
      </template>
    </TuffInput>
  </div>
</template>
