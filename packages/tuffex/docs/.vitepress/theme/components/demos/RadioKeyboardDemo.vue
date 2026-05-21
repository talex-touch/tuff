<script setup lang="ts">
import { ref } from 'vue'

const value = ref<'inbox' | 'drafts' | 'archive'>('inbox')
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-520">
    <TxRadioGroup v-model="value" type="standard" direction="row">
      <TxRadio value="inbox" label="Inbox" />
      <TxRadio value="drafts" label="Drafts" />
      <TxRadio value="archive" label="Archive" />
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        Keyboard: ArrowRight / ArrowDown selects next, ArrowLeft / ArrowUp selects previous, Home / End jumps to edges.
        selected: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
