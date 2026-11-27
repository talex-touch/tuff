<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const text = ref('')
const onSend = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxChatComposer v-model="text" @send="onSend" />
  </div>
  <div v-else>
        <TxChatComposer v-model="text" @send="onSend" />
  </div>
</template>
