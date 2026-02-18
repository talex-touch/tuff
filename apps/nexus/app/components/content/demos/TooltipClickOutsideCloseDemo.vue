<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      content: '点击切换，点击外部关闭',
      trigger: '点击我',
    }
  : {
      content: 'Click to toggle, click outside to close',
      trigger: 'Click me',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip
      v-model="open"
      trigger="click"
      :content="labels.content"
      :anchor="{ showArrow: true }"
    >
      <TxButton variant="ghost">
        {{ labels.trigger }}
      </TxButton>
    </TxTooltip>
  </div>
</template>
