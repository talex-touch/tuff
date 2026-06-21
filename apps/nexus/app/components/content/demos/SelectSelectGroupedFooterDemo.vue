<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

interface SelectDemoOption {
  value: TxSelectValue
  label: string
  disabled?: boolean
}

interface SelectDemoOptionGroup {
  label: string
  disabled?: boolean
  options: SelectDemoOption[]
}

type SelectDemoOptionLike = SelectDemoOption | SelectDemoOptionGroup

const { locale } = useI18n()
const value = ref<TxSelectValue>('lucy')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '选择成员',
      selected: '当前成员',
      action: '添加成员',
      hint: '分组选项由 options 直接传入，footer slot 可放置业务快捷操作。',
      options: [
        {
          label: 'Manager',
          options: [
            { value: 'jack', label: 'Jack' },
            { value: 'lucy', label: 'Lucy' },
          ],
        },
        {
          label: 'Engineer',
          options: [
            { value: 'yiminghe', label: 'Yiminghe' },
            { value: 'zhao', label: 'Zhao' },
          ],
        },
      ] satisfies SelectDemoOptionLike[],
    }
  }

  return {
    placeholder: 'Select member',
    selected: 'Selected member',
    action: 'Add member',
    hint: 'Grouped options come from the options prop, and the footer slot can host workflow actions.',
    options: [
      {
        label: 'Manager',
        options: [
          { value: 'jack', label: 'Jack' },
          { value: 'lucy', label: 'Lucy' },
        ],
      },
      {
        label: 'Engineer',
        options: [
          { value: 'yiminghe', label: 'Yiminghe' },
          { value: 'zhao', label: 'Zhao' },
        ],
      },
    ] satisfies SelectDemoOptionLike[],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect v-model="value" :options="labels.options" :placeholder="labels.placeholder">
      <template #footer>
        <TxButton size="small" variant="ghost" native-type="button">
          + {{ labels.action }}
        </TxButton>
      </template>
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
