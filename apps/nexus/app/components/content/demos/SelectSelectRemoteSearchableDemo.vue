<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()

const value = ref('')
const remoteOptions = ref<Array<{ value: string, label: string }>>([])

const placeholder = computed(() => (locale.value === 'zh' ? '远程搜索' : 'Remote search'))

function buildOptions() {
  return Array.from({ length: 30 }).map((_, index) => {
    const number = index + 1
    return {
      value: `option${number}`,
      label: locale.value === 'zh' ? `远程选项 ${number}` : `Option ${number}`,
    }
  })
}

function onSearch(query: string) {
  const normalized = query.trim().toLowerCase()
  const options = buildOptions()

  if (!normalized) {
    remoteOptions.value = options
    return
  }

  remoteOptions.value = options.filter(option => option.label.toLowerCase().includes(normalized))
}

watch(
  () => locale.value,
  () => {
    remoteOptions.value = buildOptions()
  },
  { immediate: true },
)
</script>

<template>
  <TuffSelect v-model="value" remote editable :placeholder="placeholder" @search="onSearch">
    <TuffSelectItem
      v-for="option in remoteOptions"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    />
  </TuffSelect>
</template>
