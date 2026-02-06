<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const files = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxImageUploader v-model="files" />
  </div>
  <div v-else>
        <TxImageUploader v-model="files" />
  </div>
</template>
