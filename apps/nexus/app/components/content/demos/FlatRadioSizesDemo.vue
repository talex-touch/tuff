<script setup lang="ts">
import { ref } from 'vue'

const sm = ref<'a' | 'b' | 'c'>('a')
const md = ref<'a' | 'b' | 'c'>('a')
const lg = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 16px;">
    <div class="tx-demo__col" style="gap: 6px;">
      <div class="tx-demo__label">
        sm
      </div>
      <TxFlatRadio v-model="sm" size="sm">
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    </div>

    <div class="tx-demo__col" style="gap: 6px;">
      <div class="tx-demo__label">
        md
      </div>
      <TxFlatRadio v-model="md" size="md">
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    </div>

    <div class="tx-demo__col" style="gap: 6px;">
      <div class="tx-demo__label">
        lg
      </div>
      <TxFlatRadio v-model="lg" size="lg">
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    </div>
  </div>
</template>
