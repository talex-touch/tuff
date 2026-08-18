<script setup lang="ts">
import type { TxSelectOptionLike, TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('design-studio')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '选择工作区',
      searchPlaceholder: '搜索工作区',
      selected: '当前选中',
      options: [
        {
          label: '最近使用',
          options: [
            { value: 'design-studio', label: '设计工作室', icon: 'i-carbon-paint-brush', description: '12 个项目' },
            { value: 'product-team', label: '产品团队', icon: 'i-carbon-layers', description: '8 个项目' },
          ],
        },
        {
          label: '全部工作区',
          options: [
            { value: 'playground', label: '实验场', icon: 'i-carbon-chemistry', description: '24 个实验' },
            { value: 'component-archive', label: '组件归档', icon: 'i-carbon-archive', description: '61 个组件' },
            { value: 'launch-plan', label: '发布计划', icon: 'i-carbon-rocket', description: '3 个里程碑' },
          ],
        },
      ] satisfies TxSelectOptionLike[],
    }
  }

  return {
    placeholder: 'Select workspace',
    searchPlaceholder: 'Search workspaces',
    selected: 'Selected',
    options: [
      {
        label: 'Recent',
        options: [
          { value: 'design-studio', label: 'Design studio', icon: 'i-carbon-paint-brush', description: '12 projects' },
          { value: 'product-team', label: 'Product team', icon: 'i-carbon-layers', description: '8 projects' },
        ],
      },
      {
        label: 'Workspaces',
        options: [
          { value: 'playground', label: 'Playground', icon: 'i-carbon-chemistry', description: '24 experiments' },
          { value: 'component-archive', label: 'Component archive', icon: 'i-carbon-archive', description: '61 components' },
          { value: 'launch-plan', label: 'Launch plan', icon: 'i-carbon-rocket', description: '3 milestones' },
        ],
      },
    ] satisfies TxSelectOptionLike[],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      style="width: 300px"
      searchable
      :options="labels.options"
      :placeholder="labels.placeholder"
      :search-placeholder="labels.searchPlaceholder"
    />

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
