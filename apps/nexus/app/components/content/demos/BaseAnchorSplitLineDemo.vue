<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '带横线',
      content: '内容从可见裂缝中浮现，箭头会随浮层自动定位。',
    }
  }

  return {
    trigger: 'Soft Edge',
    content: 'Content emerges with a soft edge and a placement-following arrow.',
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

    <div style="width: 240px; padding: 4px;">
      {{ labels.content }}
    </div>
  </TxBaseAnchor>
</template>
