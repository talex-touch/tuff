<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref('')
const labels = computed(() => (locale.value === 'zh'
  ? { placeholder: '记录这次发布审阅结论...', status: '空内容会显示错误态。' }
  : { placeholder: 'Write the release review note...', status: 'Empty content shows an error state.' }))
</script>

<template>
  <div class="grid max-w-lg gap-2">
    <TxTextarea
      v-model="value"
      :placeholder="labels.placeholder"
      :max-length="160"
      show-count
      :status="value.trim() ? 'success' : 'error'"
      resize="vertical"
    />
    <span class="text-sm text-[var(--tx-text-color-secondary)]">{{ labels.status }}</span>
  </div>
</template>
