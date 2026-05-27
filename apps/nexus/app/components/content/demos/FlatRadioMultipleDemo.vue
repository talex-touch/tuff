<script setup lang="ts">
import { ref } from 'vue'

type Mode = 'mention' | 'reply' | 'archive' | 'mute'

const value = ref<Mode[]>(['mention', 'reply'])
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px;">
    <TxFlatRadio v-model="value" multiple>
      <TxFlatRadioItem value="mention" label="Mention" icon="i-carbon-at" />
      <TxFlatRadioItem value="reply" label="Reply" icon="i-carbon-reply" />
      <TxFlatRadioItem value="archive" label="Archive" icon="i-carbon-archive" />
      <TxFlatRadioItem value="mute" label="Mute" icon="i-carbon-volume-mute" />
    </TxFlatRadio>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        selected: {{ value.join(', ') || 'none' }}
      </div>
    </TxCard>
  </div>
</template>
