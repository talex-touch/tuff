<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const sent = ref('')
const text = ref('')
const onSend = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 680px; display: grid; gap: 12px;">
      <TxChatComposer v-model="text" @send="onSend" />

      <div style="padding: 10px 12px; border-radius: 14px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);">
        <div style="font-size: 12px; opacity: .7; margin-bottom: 8px;">
Sent
</div>
        <div v-if="!sent.length" style="opacity: .7;">
None
</div>
        <div v-else style="display: grid; gap: 6px;">
          <div v-for="(message, index) in sent" :key="index">
{{ message }}
</div>
        </div>
      </div>

      <TxTypingIndicator />
    </div>
  </div>
  <div v-else>
    <div style="width: 680px; display: grid; gap: 12px;">
      <TxChatComposer v-model="text" @send="onSend" />

      <div style="padding: 10px 12px; border-radius: 14px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);">
        <div style="font-size: 12px; opacity: .7; margin-bottom: 8px;">
Sent
</div>
        <div v-if="!sent.length" style="opacity: .7;">
None
</div>
        <div v-else style="display: grid; gap: 6px;">
          <div v-for="(message, index) in sent" :key="index">
{{ message }}
</div>
        </div>
      </div>

      <TxTypingIndicator />
    </div>
  </div>
</template>
