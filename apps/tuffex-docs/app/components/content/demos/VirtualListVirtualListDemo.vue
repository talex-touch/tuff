<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const items = computed(() => {
  const prefix = locale.value === 'zh' ? '项目' : 'Item'
  return Array.from({ length: 100 }, (_, index) => `${prefix} ${index + 1}`)
})
</script>

<template>
  <div class="group">
    <TxVirtualList :items="items" :item-height="36" height="240px">
      <template #item="{ item, index }">
        <div style="padding: 6px 12px; width: 100%;">
          {{ index + 1 }}. {{ item }}
        </div>
      </template>
    </TxVirtualList>
  </div>
</template>
