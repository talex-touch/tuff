<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '请选择',
      option1: '可选项 1',
      option2: '禁用选项',
      option3: '可选项 2',
    }
  }

  return {
    placeholder: 'Please select',
    option1: 'Available 1',
    option2: 'Disabled option',
    option3: 'Available 2',
  }
})
</script>

<template>
  <TuffSelect v-model="value" :placeholder="labels.placeholder">
    <TuffSelectItem value="option1" :label="labels.option1" />
    <TuffSelectItem value="option2" :label="labels.option2" disabled />
    <TuffSelectItem value="option3" :label="labels.option3" />
  </TuffSelect>
</template>
