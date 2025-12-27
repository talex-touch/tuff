<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 520px;">
    <TxRadioGroup v-model="value" type="card">
      <TxRadio value="a">
        <div style="font-weight: 600;">Option A</div>
        <div style="font-size: 12px; opacity: 0.75;">Description text for option A</div>
      </TxRadio>
      <TxRadio value="b">
        <div style="font-weight: 600;">Option B</div>
        <div style="font-size: 12px; opacity: 0.75;">A longer description line to test wrapping and spacing</div>
      </TxRadio>
      <TxRadio value="c" disabled>
        <div style="font-weight: 600;">Option C (disabled)</div>
        <div style="font-size: 12px; opacity: 0.75;">Disabled option</div>
      </TxRadio>
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div style="font-size: 12px; opacity: 0.8;">selected: {{ value }}</div>
    </TxCard>
  </div>
</template>
