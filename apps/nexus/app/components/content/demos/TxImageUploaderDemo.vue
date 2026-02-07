<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const files = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 560px;">
      <TxImageUploader v-model="files" />
      <div style="margin-top: 12px; font-size: 12px; opacity: 0.75;">
        {{ files.length }} files
      </div>
    </div>
  </div>
  <div v-else>
    <div style="width: 560px;">
      <TxImageUploader v-model="files" />
      <div style="margin-top: 12px; font-size: 12px; opacity: 0.75;">
        {{ files.length }} files
      </div>
    </div>
  </div>
</template>
