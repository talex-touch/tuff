<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const clearableValue = ref('')

const labels = computed(() => (locale.value === 'zh'
  ? { placeholder: '可清空' }
  : { placeholder: 'Clearable' }))
</script>

<template>
  <TuffInput v-model="clearableValue" clearable :placeholder="labels.placeholder" />
</template>
