<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const content = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxMarkdownView :content="content" />
  </div>
  <div v-else>
        <TxMarkdownView :content="content" />
  </div>
</template>
