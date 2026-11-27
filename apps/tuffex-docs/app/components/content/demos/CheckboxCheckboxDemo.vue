<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const checked = ref(false)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      label: '选项',
      on: '已选中',
      off: '未选中',
    }
  }

  return {
    label: 'Option',
    on: 'Checked',
    off: 'Unchecked',
  }
})
</script>

<template>
  <div class="checkbox-demo">
    <TxCheckbox v-model="checked" :label="copy.label" />
    <span class="checkbox-demo__state" :class="{ 'is-on': checked }">
      {{ checked ? copy.on : copy.off }}
    </span>
  </div>
</template>

<style scoped>
.checkbox-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.checkbox-demo__state {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.checkbox-demo__state.is-on {
  background: var(--tx-color-primary-light-9);
  color: var(--tx-color-primary);
}
</style>
