<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 400px;">
    <TxRadioGroup v-model="value" type="standard">
      <TxRadio value="a" label="Option A" />
      <TxRadio value="b" label="Option B" />
      <TxRadio value="c" label="Option C" />
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div style="font-size: 12px; opacity: 0.8;">selected: {{ value }}</div>
    </TxCard>
  </div>
</template>
