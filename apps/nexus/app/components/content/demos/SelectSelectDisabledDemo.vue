<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '禁用状态',
      option: '选项 1',
    }
  }

  return {
    placeholder: 'Disabled',
    option: 'Option 1',
  }
})
</script>

<template>
  <TuffSelect v-model="value" :placeholder="labels.placeholder" disabled>
    <TuffSelectItem value="option1" :label="labels.option" />
  </TuffSelect>
</template>
