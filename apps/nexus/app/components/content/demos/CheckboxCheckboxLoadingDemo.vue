<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()

const asyncChecked = ref(false)
const committing = ref(false)
const loadingUnchecked = ref(false)
const loadingChecked = ref(true)
const loadingMixed = ref(false)

let commitTimer: ReturnType<typeof setTimeout> | undefined

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      async: '异步提交',
      unchecked: '加载中 / 未选中',
      checked: '加载中 / 已选中',
      mixed: '加载中 / 部分选中',
    }
  }

  return {
    async: 'Async commit',
    unchecked: 'Loading / unchecked',
    checked: 'Loading / checked',
    mixed: 'Loading / mixed',
  }
})

// The box keeps its previous fill until the commit lands, so the ring marks the
// value as still unresolved rather than one already applied.
function commit(next: boolean): void {
  committing.value = true
  commitTimer = setTimeout(() => {
    asyncChecked.value = next
    committing.value = false
  }, 1200)
}

onBeforeUnmount(() => {
  if (commitTimer)
    clearTimeout(commitTimer)
})
</script>

<template>
  <div class="checkbox-loading-demo">
    <TxCheckbox
      :model-value="asyncChecked"
      :loading="committing"
      :label="copy.async"
      @change="commit"
    />
    <TxCheckbox v-model="loadingUnchecked" :label="copy.unchecked" loading />
    <TxCheckbox v-model="loadingChecked" :label="copy.checked" loading />
    <TxCheckbox v-model="loadingMixed" :label="copy.mixed" indeterminate loading />
  </div>
</template>

<style scoped>
.checkbox-loading-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}
</style>
