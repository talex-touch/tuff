<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="value" placeholder="请输入内容" />
  </div>
  <div v-else>
        <TuffInput v-model="value" placeholder="Type here..." />
  </div>
</template>
