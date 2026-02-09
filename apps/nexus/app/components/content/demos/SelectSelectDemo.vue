<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '请选择',
      options: [
        { value: 'option1', label: '选项 1' },
        { value: 'option2', label: '选项 2' },
        { value: 'option3', label: '选项 3' },
      ],
    }
  }

  return {
    placeholder: 'Please select',
    options: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
  }
})
</script>

<template>
  <TuffSelect v-model="value" :placeholder="labels.placeholder">
    <TuffSelectItem
      v-for="option in labels.options"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    />
  </TuffSelect>
</template>
