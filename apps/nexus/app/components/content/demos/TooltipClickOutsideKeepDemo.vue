<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      content: '点击切换，点击外部不关闭',
      trigger: '固定提示',
    }
  : {
      content: 'Click to toggle, outside click will not close',
      trigger: 'Pinned tooltip',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip
      v-model="open"
      trigger="click"
      :close-on-click-outside="false"
      :content="labels.content"
      :anchor="{ showArrow: true }"
    >
      <TxButton variant="ghost">
        {{ labels.trigger }}
      </TxButton>
    </TxTooltip>
  </div>
</template>
