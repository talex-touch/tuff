<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '弹性',
      content: '弹性缓动，时长 600ms',
    }
  }

  return {
    trigger: 'Elastic',
    content: 'Elastic easing with 600ms duration.',
  }
})
</script>

<template>
  <TxBaseAnchor
    v-model="open"
    placement="bottom-start"
    :duration="600"
    ease="elastic.out(1, 0.4)"
  >
    <template #reference>
      <TxButton>{{ labels.trigger }}</TxButton>
    </template>

    <div style="width: 240px; padding: 4px;">
      {{ labels.content }}
    </div>
  </TxBaseAnchor>
</template>
