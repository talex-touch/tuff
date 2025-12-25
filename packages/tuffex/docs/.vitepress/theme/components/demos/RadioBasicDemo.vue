<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
    <TxRadioGroup v-model="value">
      <TxRadio value="a">Option A</TxRadio>
      <TxRadio value="b">Option B</TxRadio>
      <TxRadio value="c">Option C</TxRadio>
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div style="font-size: 12px; opacity: 0.8;">value: {{ value }}</div>
    </TxCard>
  </div>
</template>
