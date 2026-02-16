<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '点击',
      content: '裂缝动画弹出内容',
    }
  }

  return {
    trigger: 'Click',
    content: 'Popover content with split-line animation.',
  }
})
</script>

<template>
  <TxBasePopover v-model="open" placement="bottom-start">
    <template #reference>
      <TxButton>{{ labels.trigger }}</TxButton>
    </template>

    <div style="width: 220px; padding: 4px;">
      {{ labels.content }}
    </div>
  </TxBasePopover>
</template>
