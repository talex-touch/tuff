<script setup lang="ts">
import { ref } from 'vue'

const value1 = ref<'a' | 'b' | 'c'>('a')
const value2 = ref<'a' | 'b' | 'c'>('a')
const value3 = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px;">
    <div>
      <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Glass Effect (玻璃效果):</div>
      <TxRadioGroup v-model="value1" glass>
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div>
      <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Blur Effect (模糊效果):</div>
      <TxRadioGroup v-model="value2" blur>
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div>
      <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Plain with Elastic (普通弹性):</div>
      <TxRadioGroup v-model="value3">
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>
  </div>
</template>
