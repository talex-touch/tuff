<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('docs')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '搜索工作区',
      searchPlaceholder: '输入标签名称',
      selected: '当前选中',
      hint: 'searchable 会在下拉面板内过滤已注册选项。',
      options: [
        { value: 'docs', label: 'Docs 文档' },
        { value: 'sdk', label: 'SDK 工具' },
        { value: 'release', label: 'Release 发布' },
        { value: 'support', label: 'Support 支持' },
        { value: 'analytics', label: 'Analytics 分析' },
        { value: 'security', label: 'Security 安全' },
      ],
    }
  }

  return {
    placeholder: 'Search workspace',
    searchPlaceholder: 'Type a tag name',
    selected: 'Selected',
    hint: 'searchable filters the registered options inside the dropdown panel.',
    options: [
      { value: 'docs', label: 'Docs' },
      { value: 'sdk', label: 'SDK tools' },
      { value: 'release', label: 'Release' },
      { value: 'support', label: 'Support' },
      { value: 'analytics', label: 'Analytics' },
      { value: 'security', label: 'Security' },
    ],
  }
})

const overflowOptions = computed(() => {
  const prefix = locale.value === 'zh' ? '归档标签' : 'Archive tag'
  return Array.from({ length: 18 }).map((_, index) => {
    const id = index + 1
    return {
      value: `archive-${id}`,
      label: `${prefix} ${id}`,
    }
  })
})

const options = computed(() => [
  ...labels.value.options,
  ...overflowOptions.value,
])
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      :placeholder="labels.placeholder"
      :search-placeholder="labels.searchPlaceholder"
      searchable
    >
      <TuffSelectItem
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
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
