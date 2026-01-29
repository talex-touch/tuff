<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TxRadioGroup v-model="value" type="standard" direction="row">
      <TxRadio value="a" label="Option A" />
      <TxRadio value="b" label="Option B" />
      <TxRadio value="c" label="Option C" />
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
