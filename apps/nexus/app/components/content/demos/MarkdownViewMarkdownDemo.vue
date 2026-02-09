<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const richContent = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxMarkdownView :content="richContent" />
  </div>
  <div v-else>
        <TxMarkdownView :content="richContent" />
  </div>
</template>
