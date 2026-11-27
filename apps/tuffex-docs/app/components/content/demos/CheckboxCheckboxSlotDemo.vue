<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const checked = ref(false)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '自定义标签',
      desc: '可以放入强调文本、说明或图标',
    }
  }

  return {
    title: 'Custom label',
    desc: 'Use rich text, hints, or icons inside the slot',
  }
})
</script>

<template>
  <TxCheckbox v-model="checked">
    <span class="checkbox-slot-demo__label">
      <span>{{ copy.title }}</span>
      <small>{{ copy.desc }}</small>
    </span>
  </TxCheckbox>
</template>

<style scoped>
.checkbox-slot-demo__label {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.checkbox-slot-demo__label small {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
