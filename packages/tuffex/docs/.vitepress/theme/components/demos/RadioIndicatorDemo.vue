<script setup lang="ts">
import { ref } from 'vue'

const valueDefault = ref<'a' | 'b' | 'c'>('a')
const valuePlain = ref<'a' | 'b' | 'c'>('a')
const valueBlur = ref<'a' | 'b' | 'c'>('a')
const valueGlass = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 18px; width: 100%;">
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 12px; opacity: 0.7;">Default</div>
      <TxRadioGroup v-model="valueDefault">
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 12px; opacity: 0.7;">Plain</div>
      <TxRadioGroup v-model="valuePlain" :elastic="false">
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 12px; opacity: 0.7;">Blur</div>
      <TxRadioGroup v-model="valueBlur" blur>
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 12px; opacity: 0.7;">Glass</div>
      <TxRadioGroup v-model="valueGlass" glass>
        <TxRadio value="a">Option A</TxRadio>
        <TxRadio value="b">Option B</TxRadio>
        <TxRadio value="c">Option C</TxRadio>
      </TxRadioGroup>
    </div>
  </div>
</template>
