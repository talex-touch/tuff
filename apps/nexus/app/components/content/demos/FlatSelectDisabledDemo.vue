<script setup lang="ts">
import { ref } from 'vue'

const value = ref<string>('')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatSelect v-model="value" placeholder="请选择" disabled>
      <TxFlatSelectItem value="a" label="Option A" />
      <TxFlatSelectItem value="b" label="Option B" />
    </TxFlatSelect>

    <TxFlatSelect v-model="value" placeholder="请选择">
      <TxFlatSelectItem value="a" label="Option A" />
      <TxFlatSelectItem value="b" label="Option B" disabled />
      <TxFlatSelectItem value="c" label="Option C" />
    </TxFlatSelect>
  </div>
</template>
