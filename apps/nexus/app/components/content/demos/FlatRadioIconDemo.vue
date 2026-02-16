<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'grid' | 'list' | 'kanban'>('grid')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatRadio v-model="value">
      <TxFlatRadioItem value="grid" icon="i-carbon-grid" label="Grid" />
      <TxFlatRadioItem value="list" icon="i-carbon-list" label="List" />
      <TxFlatRadioItem value="kanban" icon="i-carbon-column" label="Kanban" />
    </TxFlatRadio>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
