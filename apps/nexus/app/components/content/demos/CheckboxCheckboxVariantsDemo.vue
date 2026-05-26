<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const fillChecked = ref(true)
const checkmarkChecked = ref(true)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      fill: '填充样式',
      checkmark: '带勾选标记',
      hint: '两种样式共享同一套交互与可访问性语义。',
    }
  }

  return {
    fill: 'Fill style',
    checkmark: 'With checkmark',
    hint: 'Both variants share the same interaction and accessibility semantics.',
  }
})
</script>

<template>
  <div class="checkbox-variants-demo">
    <div class="checkbox-variants-demo__row">
      <TxCheckbox v-model="fillChecked" :label="copy.fill" />
      <TxCheckbox v-model="checkmarkChecked" variant="checkmark" :label="copy.checkmark" />
    </div>
    <p class="checkbox-variants-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.checkbox-variants-demo {
  display: inline-flex;
  flex-direction: column;
  gap: 10px;
}

.checkbox-variants-demo__row {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.checkbox-variants-demo__hint {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
