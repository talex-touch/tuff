<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxRadioGroup v-model="value">
      <TxRadio value="a">Option A</TxRadio>
      <TxRadio value="b">Option B</TxRadio>
      <TxRadio value="c">Option C</TxRadio>
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">selected: {{ value }}</div>
    </TxCard>
  </div>
</template>
