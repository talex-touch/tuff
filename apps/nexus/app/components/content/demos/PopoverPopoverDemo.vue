<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '点击',
      content: '弹出层内容',
    }
  }

  return {
    trigger: 'Click',
    content: 'Popover content',
  }
})
</script>

<template>
  <TxPopover v-model="open">
    <template #reference>
      <TxButton>{{ labels.trigger }}</TxButton>
    </template>

    {{ labels.content }}
  </TxPopover>
</template>
