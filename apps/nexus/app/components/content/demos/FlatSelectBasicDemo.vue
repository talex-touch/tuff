<script setup lang="ts">
import { ref } from 'vue'

const value = ref<string>('json')
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatSelect v-model="value" placeholder="选择格式">
      <TxFlatSelectItem value="json" label="JSON" />
      <TxFlatSelectItem value="csv" label="CSV" />
      <TxFlatSelectItem value="xml" label="XML" />
    </TxFlatSelect>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
