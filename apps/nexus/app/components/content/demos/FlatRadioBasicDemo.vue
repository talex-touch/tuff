<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'light' | 'dark' | 'auto'>('light')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatRadio v-model="value">
      <TxFlatRadioItem value="light" label="Light" />
      <TxFlatRadioItem value="dark" label="Dark" />
      <TxFlatRadioItem value="auto" label="Auto" />
    </TxFlatRadio>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
