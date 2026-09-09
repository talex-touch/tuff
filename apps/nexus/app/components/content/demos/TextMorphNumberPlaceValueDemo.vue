<script setup lang="ts">
import { ref } from 'vue'

const total = ref(1204)
const numbers = ref(true)

function bump(delta: number) {
  total.value = Math.max(0, total.value + delta)
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
      <TxButton @click="bump(1)">
        +1
      </TxButton>
      <TxButton @click="bump(114)">
        +114
      </TxButton>
      <TxButton @click="bump(8796)">
        +8,796
      </TxButton>
      <TxButton @click="bump(-total + 999999)">
        999,999
      </TxButton>
      <TxButton @click="bump(-total + 1000000)">
        1,000,000
      </TxButton>

      <TxSwitch v-model="numbers" label="numbers" />
    </div>

    <TxCard variant="plain" background="mask" :padding="16" :radius="14">
      <div style="font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums;">
        <TxTextMorph :text="`$${total.toLocaleString('en')}`" :numbers="numbers" />
      </div>
    </TxCard>

    <div style="font-size: 12px; opacity: 0.65;">
      Digits are matched by place value, not left to right: 1,204 &rarr; 1,318 rolls the
      hundreds and tens and leaves the thousands alone. Turn <code>numbers</code> off to
      see the same change as a plain character morph.
    </div>
  </div>
</template>
