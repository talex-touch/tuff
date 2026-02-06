<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const messages = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxChatList :messages="messages" :markdown="true" :stagger="true" />
  </div>
  <div v-else>
        <TxChatList :messages="messages" :markdown="true" :stagger="true" />
  </div>
</template>
