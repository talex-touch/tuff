<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b'>('a')
</script>

<template>
  <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
    <TxRadioGroup v-model="value" disabled>
      <TxRadio value="a">Disabled A</TxRadio>
      <TxRadio value="b">Disabled B</TxRadio>
    </TxRadioGroup>

    <TxRadioGroup v-model="value">
      <TxRadio value="a" disabled>Option A</TxRadio>
      <TxRadio value="b">Option B</TxRadio>
    </TxRadioGroup>
  </div>
</template>
