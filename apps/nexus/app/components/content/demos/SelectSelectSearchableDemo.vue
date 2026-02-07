<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')

const placeholder = computed(() => (locale.value === 'zh' ? '可搜索' : 'Searchable'))

const options = computed(() => {
  return Array.from({ length: 30 }).map((_, index) => {
    const number = index + 1
    return {
      value: `option${number}`,
      label: locale.value === 'zh' ? `选项 ${number}` : `Option ${number}`,
    }
  })
})
</script>

<template>
  <TuffSelect v-model="value" :placeholder="placeholder" searchable>
    <TuffSelectItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    />
  </TuffSelect>
</template>
