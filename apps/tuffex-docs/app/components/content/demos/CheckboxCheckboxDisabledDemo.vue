<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const disabledUnchecked = ref(false)
const disabledChecked = ref(true)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      unchecked: '禁用',
      checked: '禁用且已选中',
    }
  }

  return {
    unchecked: 'Disabled',
    checked: 'Disabled checked',
  }
})
</script>

<template>
  <div class="checkbox-disabled-demo">
    <TxCheckbox v-model="disabledUnchecked" :label="copy.unchecked" disabled />
    <TxCheckbox v-model="disabledChecked" :label="copy.checked" disabled />
  </div>
</template>

<style scoped>
.checkbox-disabled-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}
</style>
