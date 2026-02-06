<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const clearableValue = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="clearableValue" clearable placeholder="可清空" />
  </div>
  <div v-else>
        <TuffInput v-model="clearableValue" clearable placeholder="Clearable" />
  </div>
</template>
