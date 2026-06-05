<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('locked')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '禁用状态',
      selected: '当前选中',
      option: '已锁定配置',
      hint: 'disabled 会关闭并阻止触发器与选项交互。',
    }
  }

  return {
    placeholder: 'Disabled',
    selected: 'Selected',
    option: 'Locked configuration',
    hint: 'disabled closes the panel and blocks trigger and option interaction.',
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect v-model="value" :placeholder="labels.placeholder" disabled eager>
      <TuffSelectItem value="locked" :label="labels.option" />
    </TuffSelect>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
      <div class="select-demo__hint">
        {{ labels.hint }}
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.select-demo__hint {
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
