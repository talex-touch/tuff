<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const checked = ref(false)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      aria: '勾选',
      on: '仅图形复选框：已选中',
      off: '仅图形复选框：未选中',
    }
  }

  return {
    aria: 'Toggle option',
    on: 'Icon-only checkbox: checked',
    off: 'Icon-only checkbox: unchecked',
  }
})
</script>

<template>
  <div class="checkbox-no-label-demo">
    <TxCheckbox v-model="checked" :aria-label="copy.aria" />
    <span class="checkbox-no-label-demo__state">
      {{ checked ? copy.on : copy.off }}
    </span>
  </div>
</template>

<style scoped>
.checkbox-no-label-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.checkbox-no-label-demo__state {
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
