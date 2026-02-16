<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatRadio v-model="value">
      <TxFlatRadioItem value="a" label="Option A" />
      <TxFlatRadioItem value="b" label="Option B" disabled />
      <TxFlatRadioItem value="c" label="Option C" />
    </TxFlatRadio>

    <TxFlatRadio v-model="value" disabled>
      <TxFlatRadioItem value="a" label="Option A" />
      <TxFlatRadioItem value="b" label="Option B" />
      <TxFlatRadioItem value="c" label="Option C" />
    </TxFlatRadio>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
