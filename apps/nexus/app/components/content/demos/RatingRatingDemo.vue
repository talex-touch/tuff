<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const score = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxRating v-model="score" :precision="0.5" show-text />
  </div>
  <div v-else>
        <TxRating v-model="score" :precision="0.5" show-text />
  </div>
</template>
