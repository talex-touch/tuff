<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')

const labels = computed(() => (locale.value === 'zh'
  ? { placeholder: '请输入内容' }
  : { placeholder: 'Type here...' }))
</script>

<template>
  <TuffInput v-model="value" :placeholder="labels.placeholder" />
</template>
