<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '点击',
      content: '裂缝动画弹出内容，箭头会跟随浮层位置自动校准。',
    }
  }

  return {
    trigger: 'Click',
    content: 'Popover content with split-line animation and a placement-following arrow.',
  }
})
</script>

<template>
  <TxBaseAnchor
    v-model="open"
    placement="bottom-start"
    :show-arrow="true"
  >
    <template #reference>
      <TxButton>{{ labels.trigger }}</TxButton>
    </template>

    <div style="width: 220px; padding: 4px;">
      {{ labels.content }}
    </div>
  </TxBaseAnchor>
</template>
