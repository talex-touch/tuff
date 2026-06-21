<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref, watch } from 'vue'

interface SelectDemoOption {
  value: TxSelectValue
  label: string
}

const { locale } = useI18n()
const value = ref<TxSelectValue[]>(['agent'])
const options = ref<SelectDemoOption[]>([])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '输入或选择标签',
      createText: '添加标签',
      selected: '当前标签',
      hint: '输入新标签后按 Enter，或点击下拉底部按钮完成自助添加。',
      options: [
        { value: 'agent', label: 'agent' },
        { value: 'workflow', label: 'workflow' },
        { value: 'sync', label: 'sync' },
      ],
    }
  }

  return {
    placeholder: 'Type or select tags',
    createText: 'Add tag',
    selected: 'Selected tags',
    hint: 'Type a new tag, then press Enter or use the dropdown footer action.',
    options: [
      { value: 'agent', label: 'agent' },
      { value: 'workflow', label: 'workflow' },
      { value: 'sync', label: 'sync' },
    ],
  }
})

watch(
  () => labels.value.options,
  nextOptions => {
    const createdOptions = options.value.filter(option =>
      !nextOptions.some(nextOption => nextOption.value === option.value),
    )
    options.value = [...nextOptions, ...createdOptions]
  },
  { immediate: true },
)

function onCreate(option: SelectDemoOption) {
  if (!options.value.some(item => item.value === option.value)) {
    options.value = [...options.value, option]
  }
}
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      multiple
      searchable
      allow-create
      :create-text="labels.createText"
      :options="options"
      :placeholder="labels.placeholder"
      @create="onCreate"
    />

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value.join(', ') }}
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
