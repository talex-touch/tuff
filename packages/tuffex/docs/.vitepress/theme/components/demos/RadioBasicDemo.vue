<script setup lang="ts">
import { ref } from 'vue'

const value1 = ref<'a' | 'b' | 'c'>('a')
const value2 = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px;">
    <div>
      <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">With Glass Effect:</div>
      <TxRadioGroup v-model="value1" glass>
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div>
      <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Without Glass:</div>
      <TxRadioGroup v-model="value2">
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>
  </div>
</template>
