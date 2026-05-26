<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const checked = ref(true)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      label: '我在前面',
      helper: '标签位于勾选框左侧',
    }
  }

  return {
    label: 'Text first',
    helper: 'The label is placed before the box',
  }
})
</script>

<template>
  <div class="checkbox-label-start-demo">
    <TxCheckbox v-model="checked" :label="copy.label" label-placement="start" />
    <span class="checkbox-label-start-demo__helper">
      {{ copy.helper }}
    </span>
  </div>
</template>

<style scoped>
.checkbox-label-start-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.checkbox-label-start-demo__helper {
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
