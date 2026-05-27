<script setup lang="ts">
import { ref } from 'vue'

const single = ref<'overview' | 'activity' | 'settings'>('overview')
const multiple = ref<Array<'email' | 'push' | 'sms'>>(['email'])
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 14px;">
    <div class="tx-demo__col" style="gap: 6px;">
      <div class="tx-demo__label">
        single mode
      </div>
      <TxFlatRadio v-model="single">
        <TxFlatRadioItem value="overview" label="Overview" />
        <TxFlatRadioItem value="activity" label="Activity" />
        <TxFlatRadioItem value="settings" label="Settings" />
      </TxFlatRadio>
      <div class="tx-demo__meta">
        focus with Tab, move with Arrow keys, confirm with Enter/Space
      </div>
    </div>

    <div class="tx-demo__col" style="gap: 6px;">
      <div class="tx-demo__label">
        multiple mode
      </div>
      <TxFlatRadio v-model="multiple" multiple>
        <TxFlatRadioItem value="email" label="Email" />
        <TxFlatRadioItem value="push" label="Push" />
        <TxFlatRadioItem value="sms" label="SMS" />
      </TxFlatRadio>
      <div class="tx-demo__meta">
        selected: {{ multiple.join(', ') || 'none' }}
      </div>
    </div>
  </div>
</template>
