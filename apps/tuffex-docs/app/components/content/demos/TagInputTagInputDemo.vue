<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const tags = ref(['Design', 'Docs'])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '输入标签后回车',
      current: '当前标签',
      empty: '暂无',
    }
  }

  return {
    placeholder: 'Press Enter to add tags',
    current: 'Current tags',
    empty: 'None',
  }
})
</script>

<template>
  <div class="group" style="max-width: 360px;">
    <TxTagInput v-model="tags" :placeholder="labels.placeholder" />
    <div style="margin-top: 8px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      {{ labels.current }}：{{ tags.length ? tags.join(', ') : labels.empty }}
    </div>
  </div>
</template>
