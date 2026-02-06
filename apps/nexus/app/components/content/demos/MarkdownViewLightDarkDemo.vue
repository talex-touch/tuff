<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const richContent = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; width: 100%;">
      <div style="padding: 12px; border-radius: 12px; border: 1px solid #d1d9e0; background: #ffffff;">
        <TxMarkdownView :content="richContent" theme="light" />
      </div>
      <div style="padding: 12px; border-radius: 12px; border: 1px solid #30363d; background: #0d1117;">
        <TxMarkdownView :content="richContent" theme="dark" />
      </div>
    </div>
  </div>
  <div v-else>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; width: 100%;">
      <div style="padding: 12px; border-radius: 12px; border: 1px solid #d1d9e0; background: #ffffff;">
        <TxMarkdownView :content="richContent" theme="light" />
      </div>
      <div style="padding: 12px; border-radius: 12px; border: 1px solid #30363d; background: #0d1117;">
        <TxMarkdownView :content="richContent" theme="dark" />
      </div>
    </div>
  </div>
</template>
